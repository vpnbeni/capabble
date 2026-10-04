/**
 * Electricity (connections + bills) and infrastructure projects.
 */
const asyncHandler = require('../../middleware/asyncHandler');
const { httpError, getModel, auditUser } = require('../../modules/cpitl/feeService');
const { upsertForSource, voidForSource } = require('../../modules/cpitl/expenseLedger');
const { PAYMENT_MODES } = require('../../modules/cpitl/constants');

const ok = (res, data, extra = {}) => res.json({ success: true, data, ...extra });
const round = (v) => Math.round((Number(v) || 0) * 100) / 100;
const pick = (body, fields) => fields.reduce((acc, f) => {
  if (body[f] !== undefined) acc[f] = body[f] === '' && /Id$/.test(f) ? null : body[f];
  return acc;
}, {});

/** Optional ASETS location list for pickers (empty when ASETS is off). */
const listLocations = asyncHandler(async (req, res) => {
  if (!req.models.AssetLocation) return ok(res, [], { meta: { asetsActive: false } });
  const rows = await req.models.AssetLocation.find({ isActive: { $ne: false }, isArchived: { $ne: true } })
    .select('name type path')
    .sort({ path: 1, name: 1 })
    .limit(1000)
    .lean();
  return ok(res, rows, { meta: { asetsActive: true } });
});

// ── Electricity connections ─────────────────────────────────────────
const CONNECTION_FIELDS = ['name', 'consumerNo', 'meterNo', 'provider', 'locationId', 'locationText', 'sanctionedLoadKw', 'notes'];

const listConnections = asyncHandler(async (req, res) => {
  const ElectricityConnection = getModel(req.models, 'ElectricityConnection');
  return ok(res, await ElectricityConnection.find({ isActive: { $ne: false } }).sort({ name: 1 }).lean());
});

const saveConnection = asyncHandler(async (req, res) => {
  const ElectricityConnection = getModel(req.models, 'ElectricityConnection');
  const payload = pick(req.body, CONNECTION_FIELDS);
  if (!req.params.id && !String(payload.name || '').trim()) throw httpError('Connection name is required.');
  const doc = req.params.id
    ? await ElectricityConnection.findByIdAndUpdate(req.params.id, { ...payload, updatedBy: auditUser(req) }, { new: true, runValidators: true })
    : await ElectricityConnection.create({ ...payload, createdBy: auditUser(req) });
  if (!doc) throw httpError('Connection not found.', 404);
  return res.status(req.params.id ? 200 : 201).json({ success: true, data: doc, message: 'Connection saved.' });
});

const archiveConnection = asyncHandler(async (req, res) => {
  const ElectricityConnection = getModel(req.models, 'ElectricityConnection');
  await ElectricityConnection.updateOne({ _id: req.params.id }, { $set: { isActive: false, updatedBy: auditUser(req) } });
  return ok(res, null, { message: 'Connection archived. Its bills are kept.' });
});

// ── Electricity bills ───────────────────────────────────────────────
const BILL_FIELDS = ['connectionId', 'billMonth', 'billNo', 'periodFrom', 'periodTo', 'prevReading', 'currReading', 'units', 'amount', 'dueDate', 'notes', 'attachments'];

const normalizeBill = (payload) => {
  if (!/^\d{4}-\d{2}$/.test(String(payload.billMonth || ''))) throw httpError('Pick the bill month.');
  const amount = Number(payload.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw httpError('Enter the bill amount.');
  const prev = payload.prevReading === '' || payload.prevReading === null || payload.prevReading === undefined ? null : Number(payload.prevReading);
  const curr = payload.currReading === '' || payload.currReading === null || payload.currReading === undefined ? null : Number(payload.currReading);
  if (prev !== null && curr !== null && curr < prev) throw httpError('Current reading is lower than the previous reading.');
  const units = prev !== null && curr !== null ? curr - prev : Number(payload.units) || 0;
  return { ...payload, amount: round(amount), prevReading: prev, currReading: curr, units: round(units) };
};

const listBills = asyncHandler(async (req, res) => {
  const ElectricityBill = getModel(req.models, 'ElectricityBill');
  const filter = { isActive: { $ne: false } };
  if (req.query.connectionId) filter.connectionId = req.query.connectionId;
  if (req.query.status) filter.status = req.query.status;
  return ok(res, await ElectricityBill.find(filter).sort({ billMonth: -1, createdAt: -1 }).lean());
});

const createBill = asyncHandler(async (req, res) => {
  const ElectricityBill = getModel(req.models, 'ElectricityBill');
  const ElectricityConnection = getModel(req.models, 'ElectricityConnection');
  const payload = normalizeBill(pick(req.body, BILL_FIELDS));
  const connection = await ElectricityConnection.findById(payload.connectionId).lean();
  if (!connection) throw httpError('Pick a connection.');
  const duplicate = await ElectricityBill.findOne({ connectionId: connection._id, billMonth: payload.billMonth, isActive: { $ne: false } }).lean();
  if (duplicate) throw httpError(`A bill for ${payload.billMonth} already exists for ${connection.name}.`, 400);
  const bill = await ElectricityBill.create({
    ...payload,
    connectionSnapshot: { name: connection.name, consumerNo: connection.consumerNo },
    createdBy: auditUser(req),
    ...(req.academicSession ? { academicSession: req.academicSession } : {}),
  });
  if (req.body.markPaid) {
    await payBillDoc(req, bill, req.body);
  }
  return res.status(201).json({ success: true, data: bill, message: 'Bill saved.' });
});

const updateBill = asyncHandler(async (req, res) => {
  const ElectricityBill = getModel(req.models, 'ElectricityBill');
  const bill = await ElectricityBill.findById(req.params.id);
  if (!bill || bill.isActive === false) throw httpError('Bill not found.', 404);
  bill.set(normalizeBill({ ...bill.toObject(), ...pick(req.body, BILL_FIELDS) }));
  await bill.save();
  if (bill.status === 'paid') {
    await upsertForSource(req.models, { kind: 'electricity', sourceModel: 'ElectricityBill', source: bill, sessionLabel: req.academicSession, user: auditUser(req) });
  }
  return ok(res, bill, { message: 'Bill updated.' });
});

async function payBillDoc(req, bill, body) {
  const mode = body.mode || 'bank_transfer';
  if (!PAYMENT_MODES.includes(mode)) throw httpError('Invalid payment mode.');
  bill.set({ status: 'paid', paidOn: body.paidOn ? new Date(body.paidOn) : new Date(), mode, reference: body.reference || bill.reference });
  const expense = await upsertForSource(req.models, { kind: 'electricity', sourceModel: 'ElectricityBill', source: bill, sessionLabel: req.academicSession, user: auditUser(req) });
  bill.expenseId = expense._id;
  await bill.save();
  return bill;
}

const payBill = asyncHandler(async (req, res) => {
  const ElectricityBill = getModel(req.models, 'ElectricityBill');
  const bill = await ElectricityBill.findById(req.params.id);
  if (!bill || bill.isActive === false) throw httpError('Bill not found.', 404);
  await payBillDoc(req, bill, req.body || {});
  return ok(res, bill, { message: 'Bill marked paid.' });
});

const removeBill = asyncHandler(async (req, res) => {
  const ElectricityBill = getModel(req.models, 'ElectricityBill');
  const bill = await ElectricityBill.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!bill) throw httpError('Bill not found.', 404);
  await voidForSource(req.models, bill._id, req.body?.reason || 'Bill removed', auditUser(req));
  return ok(res, null, { message: 'Bill removed.' });
});

/** Monthly units & cost per connection, across all sessions so year-on-year works. */
const electricityAnalytics = asyncHandler(async (req, res) => {
  const ElectricityBill = getModel(req.models, 'ElectricityBill');
  const rows = await ElectricityBill.aggregate([
    { $match: { academicSession: { $exists: true }, isActive: { $ne: false } } },
    { $group: { _id: { connectionId: '$connectionId', month: '$billMonth' }, units: { $sum: '$units' }, amount: { $sum: '$amount' } } },
    { $sort: { '_id.month': 1 } },
  ]);
  const byConnection = new Map();
  rows.forEach(({ _id, units, amount }) => {
    const key = String(_id.connectionId);
    if (!byConnection.has(key)) byConnection.set(key, []);
    byConnection.get(key).push({ month: _id.month, units: round(units), amount: round(amount), costPerUnit: units > 0 ? round(amount / units) : null });
  });
  const series = [...byConnection.entries()].map(([connectionId, months]) => {
    const byMonth = new Map(months.map((m) => [m.month, m]));
    return {
      connectionId,
      months: months.map((m) => {
        const [y, mm] = m.month.split('-');
        const lastYear = byMonth.get(`${Number(y) - 1}-${mm}`);
        return { ...m, lastYearUnits: lastYear?.units ?? null, lastYearAmount: lastYear?.amount ?? null };
      }),
    };
  });
  return ok(res, series);
});

// ── Infrastructure projects ─────────────────────────────────────────
const PROJECT_FIELDS = ['title', 'type', 'description', 'locationId', 'locationText', 'vendor', 'sanctionedBudget', 'startDate', 'targetDate', 'completedDate', 'status', 'milestones', 'documents'];

const spentByProject = async (models, ids) => {
  const CapitalExpense = getModel(models, 'CapitalExpense');
  const rows = await CapitalExpense.aggregate([
    { $match: { academicSession: { $exists: true }, kind: 'infra', status: 'valid', 'sourceRef.id': { $in: ids } } },
    { $group: { _id: '$sourceRef.id', spent: { $sum: '$amount' }, payments: { $sum: 1 }, lastPayment: { $max: '$date' } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r]));
};

const listProjects = asyncHandler(async (req, res) => {
  const InfraProject = getModel(req.models, 'InfraProject');
  const projects = await InfraProject.find({ isActive: { $ne: false } }).sort({ updatedAt: -1 }).lean();
  const spent = await spentByProject(req.models, projects.map((p) => p._id));
  return ok(res, projects.map((p) => {
    const s = spent.get(String(p._id));
    return { ...p, spent: round(s?.spent), payments: s?.payments || 0, lastPayment: s?.lastPayment || null };
  }));
});

const getProject = asyncHandler(async (req, res) => {
  const InfraProject = getModel(req.models, 'InfraProject');
  const CapitalExpense = getModel(req.models, 'CapitalExpense');
  const project = await InfraProject.findById(req.params.id).lean();
  if (!project) throw httpError('Project not found.', 404);
  // Infra spans sessions, so match payments across every session explicitly.
  const payments = await CapitalExpense.find({ academicSession: { $exists: true }, kind: 'infra', 'sourceRef.id': project._id })
    .sort({ date: -1 })
    .lean();
  const spent = round(payments.filter((p) => p.status === 'valid').reduce((s, p) => s + p.amount, 0));
  return ok(res, { ...project, spent, payments });
});

const saveProject = asyncHandler(async (req, res) => {
  const InfraProject = getModel(req.models, 'InfraProject');
  const payload = pick(req.body, PROJECT_FIELDS);
  if (!req.params.id && !String(payload.title || '').trim()) throw httpError('Project title is required.');
  if (payload.status === 'completed' && !payload.completedDate) payload.completedDate = new Date();
  if (Array.isArray(payload.milestones)) {
    payload.milestones = payload.milestones.map((m) => ({ ...m, doneAt: m.done ? m.doneAt || new Date() : null }));
  }
  const doc = req.params.id
    ? await InfraProject.findByIdAndUpdate(req.params.id, { ...payload, updatedBy: auditUser(req) }, { new: true, runValidators: true })
    : await InfraProject.create({ ...payload, createdBy: auditUser(req) });
  if (!doc) throw httpError('Project not found.', 404);
  return res.status(req.params.id ? 200 : 201).json({ success: true, data: doc, message: 'Project saved.' });
});

const addProjectPayment = asyncHandler(async (req, res) => {
  const InfraProject = getModel(req.models, 'InfraProject');
  const CapitalExpense = getModel(req.models, 'CapitalExpense');
  const project = await InfraProject.findById(req.params.id).lean();
  if (!project) throw httpError('Project not found.', 404);
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw httpError('Enter an amount greater than zero.');
  const mode = req.body.mode || 'bank_transfer';
  if (!PAYMENT_MODES.includes(mode)) throw httpError('Invalid payment mode.');
  const expense = await CapitalExpense.create({
    kind: 'infra',
    date: req.body.date ? new Date(req.body.date) : new Date(),
    amount: round(amount),
    mode,
    payee: req.body.payee || project.vendor || '',
    reference: req.body.reference || '',
    title: `Infra — ${project.title}`,
    notes: req.body.notes || '',
    attachments: Array.isArray(req.body.attachments) ? req.body.attachments : [],
    sourceRef: { model: 'InfraProject', id: project._id },
    createdBy: auditUser(req),
    ...(req.academicSession ? { academicSession: req.academicSession } : {}),
  });
  if (project.status === 'planned') await InfraProject.updateOne({ _id: project._id }, { $set: { status: 'in_progress' } });
  return res.status(201).json({ success: true, data: expense, message: 'Payment recorded.' });
});

module.exports = {
  listLocations,
  listConnections,
  saveConnection,
  archiveConnection,
  listBills,
  createBill,
  updateBill,
  payBill,
  removeBill,
  electricityAnalytics,
  listProjects,
  getProject,
  saveProject,
  addProjectPayment,
};
