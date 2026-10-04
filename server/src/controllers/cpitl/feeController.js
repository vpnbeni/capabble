const asyncHandler = require('../../middleware/asyncHandler');
const {
  httpError,
  getModel,
  auditUser,
  ensureFeeHeads,
  getSettings,
  assignStructure,
  recordRevision,
  syncDemandsForAccounts,
} = require('../../modules/cpitl/feeService');
const { annualTotal, FEE_FREQUENCIES, normalizePlan } = require('../../modules/cpitl/feeSchedule');
const { FEE_HEAD_CATEGORIES, PAYMENT_MODES } = require('../../modules/cpitl/constants');

const ok = (res, data, extra = {}) => res.json({ success: true, data, ...extra });

const sortClassValue = (value) => {
  const numeric = parseInt(String(value || '').replace(/\D/g, ''), 10);
  return Number.isNaN(numeric) ? Number.MAX_SAFE_INTEGER : numeric;
};

// ── Meta ────────────────────────────────────────────────────────────
const getMeta = asyncHandler(async (req, res) => ok(res, {
  frequencies: FEE_FREQUENCIES,
  categories: FEE_HEAD_CATEGORIES,
  paymentModes: PAYMENT_MODES,
  academicSession: req.academicSession || null,
}));

const listClasses = asyncHandler(async (req, res) => {
  const Student = getModel(req.models, 'Student');
  const rows = await Student.aggregate([
    { $match: { isActive: { $ne: false } } },
    { $group: { _id: { class: '$class', section: '$section' }, count: { $sum: 1 } } },
  ]);
  const byClass = new Map();
  rows.forEach(({ _id, count }) => {
    const cls = String(_id?.class || '').trim();
    if (!cls) return;
    if (!byClass.has(cls)) byClass.set(cls, { class: cls, count: 0, sections: [] });
    const entry = byClass.get(cls);
    entry.count += count;
    entry.sections.push({ section: String(_id?.section || '').trim(), count });
  });
  const data = [...byClass.values()]
    .map((entry) => ({ ...entry, sections: entry.sections.sort((a, b) => a.section.localeCompare(b.section)) }))
    .sort((a, b) => sortClassValue(a.class) - sortClassValue(b.class) || a.class.localeCompare(b.class));
  return ok(res, data);
});

// ── Fee heads ───────────────────────────────────────────────────────
const HEAD_FIELDS = ['name', 'code', 'category', 'frequency', 'isRefundable', 'isOptional', 'description', 'sortOrder'];
const pick = (body, fields) => fields.reduce((acc, f) => {
  if (body[f] !== undefined) acc[f] = body[f];
  return acc;
}, {});

const listFeeHeads = asyncHandler(async (req, res) => {
  await ensureFeeHeads(req.models);
  const FeeHead = getModel(req.models, 'FeeHead');
  const heads = await FeeHead.find({ isActive: { $ne: false } }).sort({ sortOrder: 1, name: 1 }).lean();
  return ok(res, heads);
});

const createFeeHead = asyncHandler(async (req, res) => {
  const FeeHead = getModel(req.models, 'FeeHead');
  const payload = pick(req.body, HEAD_FIELDS);
  if (!payload.name || !payload.code) throw httpError('Name and code are required.');
  const exists = await FeeHead.findOne({ code: String(payload.code).toUpperCase().trim() });
  if (exists) {
    if (exists.isActive === false) {
      exists.set({ ...payload, isActive: true, updatedBy: auditUser(req) });
      await exists.save();
      return res.status(201).json({ success: true, data: exists, message: 'Fee head restored.' });
    }
    throw httpError('A fee head with this code already exists.', 400);
  }
  const head = await FeeHead.create({ ...payload, createdBy: auditUser(req), academicSession: req.academicSession || undefined });
  return res.status(201).json({ success: true, data: head, message: 'Fee head created.' });
});

const updateFeeHead = asyncHandler(async (req, res) => {
  const FeeHead = getModel(req.models, 'FeeHead');
  const head = await FeeHead.findById(req.params.id);
  if (!head) throw httpError('Fee head not found.', 404);
  head.set({ ...pick(req.body, HEAD_FIELDS), updatedBy: auditUser(req) });
  await head.save();
  return ok(res, head, { message: 'Fee head updated.' });
});

const deleteFeeHead = asyncHandler(async (req, res) => {
  const FeeHead = getModel(req.models, 'FeeHead');
  const FeeStructure = getModel(req.models, 'FeeStructure');
  const inUse = await FeeStructure.countDocuments({ 'components.feeHead': req.params.id, status: { $ne: 'archived' }, isActive: { $ne: false } });
  if (inUse) throw httpError('This fee head is used in a fee structure. Remove it from the structure first.', 400);
  await FeeHead.updateOne({ _id: req.params.id }, { $set: { isActive: false, updatedBy: auditUser(req) } });
  return ok(res, null, { message: 'Fee head removed.' });
});

// ── Fee structures ──────────────────────────────────────────────────
const normalizeComponents = async (models, components = []) => {
  const FeeHead = getModel(models, 'FeeHead');
  const ids = components.map((c) => c.feeHead).filter(Boolean);
  const heads = await FeeHead.find({ _id: { $in: ids } }).lean();
  const byId = new Map(heads.map((h) => [String(h._id), h]));
  const seen = new Set();
  return components.reduce((acc, c) => {
    const head = byId.get(String(c.feeHead));
    if (!head || seen.has(String(head._id))) return acc;
    seen.add(String(head._id));
    const amount = Number(c.amount);
    if (!Number.isFinite(amount) || amount < 0) throw httpError(`Invalid amount for ${head.name}.`);
    acc.push({
      feeHead: head._id,
      name: head.name,
      code: head.code,
      amount,
      frequency: FEE_FREQUENCIES.includes(c.frequency) ? c.frequency : head.frequency,
      isOptional: c.isOptional !== undefined ? Boolean(c.isOptional) : Boolean(head.isOptional),
    });
    return acc;
  }, []);
};

const withComputed = (structure, assignedCount = 0) => {
  const plain = typeof structure.toObject === 'function' ? structure.toObject() : structure;
  return {
    ...plain,
    annualTotal: annualTotal(plain.components, plain.installmentPlan),
    annualTotalWithOptional: annualTotal(plain.components, plain.installmentPlan, { includeOptional: true }),
    assignedCount,
  };
};

const listStructures = asyncHandler(async (req, res) => {
  const FeeStructure = getModel(req.models, 'FeeStructure');
  const StudentFeeAccount = getModel(req.models, 'StudentFeeAccount');
  const filter = { isActive: { $ne: false } };
  if (req.query.status) filter.status = req.query.status;
  const structures = await FeeStructure.find(filter).sort({ status: 1, updatedAt: -1 }).lean();
  const counts = await StudentFeeAccount.aggregate([
    { $match: { structureId: { $in: structures.map((s) => s._id) } } },
    { $group: { _id: '$structureId', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
  return ok(res, structures.map((s) => withComputed(s, countMap.get(String(s._id)) || 0)));
});

const getStructure = asyncHandler(async (req, res) => {
  const FeeStructure = getModel(req.models, 'FeeStructure');
  const StudentFeeAccount = getModel(req.models, 'StudentFeeAccount');
  const structure = await FeeStructure.findById(req.params.id).lean();
  if (!structure) throw httpError('Fee structure not found.', 404);
  const assignedCount = await StudentFeeAccount.countDocuments({ structureId: structure._id });
  return ok(res, withComputed(structure, assignedCount));
});

const createStructure = asyncHandler(async (req, res) => {
  const FeeStructure = getModel(req.models, 'FeeStructure');
  const settings = await getSettings(req.models);
  const { name, description, applicableClasses, components, installmentPlan, lateFee, status } = req.body;
  if (!String(name || '').trim()) throw httpError('Structure name is required.');
  const structure = await FeeStructure.create({
    name,
    description,
    applicableClasses: Array.isArray(applicableClasses) ? applicableClasses : [],
    components: await normalizeComponents(req.models, components),
    installmentPlan: normalizePlan({ dueDay: settings.defaultDueDay, ...(installmentPlan || {}) }),
    lateFee: lateFee || settings.defaultLateFee,
    status: ['draft', 'active'].includes(status) ? status : 'draft',
    version: 1,
    createdBy: auditUser(req),
    academicSession: req.academicSession || undefined,
  });
  await recordRevision(req.models, structure, [], 'Structure created', auditUser(req));
  return res.status(201).json({ success: true, data: withComputed(structure), message: 'Fee structure created.' });
});

const updateStructure = asyncHandler(async (req, res) => {
  const FeeStructure = getModel(req.models, 'FeeStructure');
  const structure = await FeeStructure.findById(req.params.id);
  if (!structure) throw httpError('Fee structure not found.', 404);
  if (structure.status === 'archived') throw httpError('Archived structures cannot be edited. Duplicate it instead.', 400);

  const previousComponents = structure.toObject().components;
  const { name, description, applicableClasses, components, installmentPlan, lateFee, status, changeNote } = req.body;
  if (name !== undefined) structure.name = name;
  if (description !== undefined) structure.description = description;
  if (Array.isArray(applicableClasses)) structure.applicableClasses = applicableClasses;
  if (Array.isArray(components)) structure.components = await normalizeComponents(req.models, components);
  if (installmentPlan) structure.installmentPlan = normalizePlan(installmentPlan);
  if (lateFee) structure.lateFee = lateFee;
  if (['draft', 'active', 'archived'].includes(status)) structure.status = status;
  structure.version += 1;
  structure.updatedBy = auditUser(req);
  await structure.save();
  await recordRevision(req.models, structure, previousComponents, changeNote, auditUser(req));

  return ok(res, withComputed(structure), { message: `Saved as version ${structure.version}.` });
});

const duplicateStructure = asyncHandler(async (req, res) => {
  const FeeStructure = getModel(req.models, 'FeeStructure');
  const source = await FeeStructure.findById(req.params.id).lean();
  if (!source) throw httpError('Fee structure not found.', 404);
  const copy = await FeeStructure.create({
    name: req.body?.name || `${source.name} (Copy)`,
    description: source.description,
    applicableClasses: source.applicableClasses,
    components: source.components,
    installmentPlan: source.installmentPlan,
    lateFee: source.lateFee,
    status: 'draft',
    version: 1,
    createdBy: auditUser(req),
    academicSession: req.academicSession || undefined,
  });
  await recordRevision(req.models, copy, [], `Duplicated from "${source.name}" v${source.version}`, auditUser(req));
  return res.status(201).json({ success: true, data: withComputed(copy), message: 'Structure duplicated.' });
});

const archiveStructure = asyncHandler(async (req, res) => {
  const FeeStructure = getModel(req.models, 'FeeStructure');
  const structure = await FeeStructure.findById(req.params.id);
  if (!structure) throw httpError('Fee structure not found.', 404);
  const previous = structure.toObject().components;
  structure.status = 'archived';
  structure.version += 1;
  structure.updatedBy = auditUser(req);
  await structure.save();
  await recordRevision(req.models, structure, previous, 'Structure archived', auditUser(req));
  return ok(res, withComputed(structure), { message: 'Structure archived.' });
});

const listRevisions = asyncHandler(async (req, res) => {
  const FeeStructureRevision = getModel(req.models, 'FeeStructureRevision');
  const revisions = await FeeStructureRevision.find({ structureId: req.params.id })
    .sort({ version: -1 })
    .select(req.query.full === 'true' ? '' : '-snapshot')
    .lean();
  return ok(res, revisions);
});

const getRevision = asyncHandler(async (req, res) => {
  const FeeStructureRevision = getModel(req.models, 'FeeStructureRevision');
  const revision = await FeeStructureRevision.findOne({ structureId: req.params.id, version: Number(req.params.version) }).lean();
  if (!revision) throw httpError('Revision not found.', 404);
  return ok(res, revision);
});

const assignStructureHandler = asyncHandler(async (req, res) => {
  const FeeStructure = getModel(req.models, 'FeeStructure');
  const structure = await FeeStructure.findById(req.params.id);
  if (!structure) throw httpError('Fee structure not found.', 404);
  if (structure.status === 'archived') throw httpError('Archived structures cannot be assigned.', 400);
  if (!structure.components.length) throw httpError('Add at least one fee component before assigning.');
  if (structure.status === 'draft') {
    structure.status = 'active';
    await structure.save();
  }
  const summary = await assignStructure(
    req.models,
    structure,
    {
      classes: Array.isArray(req.body.classes) ? req.body.classes : [],
      sections: Array.isArray(req.body.sections) ? req.body.sections : [],
      studentIds: Array.isArray(req.body.studentIds) ? req.body.studentIds : [],
    },
    req.academicSession,
    auditUser(req)
  );
  return ok(res, summary, { message: `Assigned to ${summary.students} student(s).` });
});

/** Re-apply the latest structure version to every assigned account's unpaid dues. */
const reapplyStructure = asyncHandler(async (req, res) => {
  const FeeStructure = getModel(req.models, 'FeeStructure');
  const StudentFeeAccount = getModel(req.models, 'StudentFeeAccount');
  const structure = await FeeStructure.findById(req.params.id);
  if (!structure) throw httpError('Fee structure not found.', 404);
  const accounts = await StudentFeeAccount.find({ structureId: structure._id }).lean();
  await StudentFeeAccount.updateMany({ structureId: structure._id }, { $set: { structureVersion: structure.version } });
  const result = await syncDemandsForAccounts(req.models, accounts, () => structure, req.academicSession);
  const updated = result.updated + result.created;
  return ok(res, { accounts: accounts.length, demandsTouched: updated }, { message: `Re-applied to ${accounts.length} student account(s).` });
});

// ── Settings ────────────────────────────────────────────────────────
const getSettingsHandler = asyncHandler(async (req, res) => ok(res, await getSettings(req.models)));

const updateSettings = asyncHandler(async (req, res) => {
  const settings = await getSettings(req.models);
  const fields = ['receiptPrefix', 'gstin', 'pan', 'slipFooterNote', 'bankDetails', 'defaultDueDay', 'defaultLateFee', 'concessionPresets'];
  settings.set({ ...pick(req.body, fields), updatedBy: auditUser(req) });
  await settings.save();
  return ok(res, settings, { message: 'Settings saved.' });
});

module.exports = {
  getMeta,
  listClasses,
  listFeeHeads,
  createFeeHead,
  updateFeeHead,
  deleteFeeHead,
  listStructures,
  getStructure,
  createStructure,
  updateStructure,
  duplicateStructure,
  archiveStructure,
  listRevisions,
  getRevision,
  assignStructureHandler,
  reapplyStructure,
  getSettingsHandler,
  updateSettings,
};
