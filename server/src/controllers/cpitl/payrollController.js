const ExcelJS = require('exceljs');
const asyncHandler = require('../../middleware/asyncHandler');
const eventBus = require('../../events/eventBus');
const EVENTS = require('../../events/eventNames');
const pdfGenerator = require('../../utils/pdfGenerator');
const { numberToIndianWords } = require('../../utils/numberToIndianWords');
const { httpError, getModel, auditUser, getSettings } = require('../../modules/cpitl/feeService');
const { upsertForSource, voidForSource } = require('../../modules/cpitl/expenseLedger');
const { computePayslip, daysInMonth, attendanceLop, reviseComponents, REVISION_LIMITS, DEFAULT_PAYROLL_SETTINGS } = require('../../modules/cpitl/payroll');
const { parseIds, runBulk, sendBulk, labelled } = require('../../modules/cpitl/bulk');
const { DEFAULT_SALARY_COMPONENTS } = require('../../modules/cpitl/constants');

const ok = (res, data, extra = {}) => res.json({ success: true, data, ...extra });
const MONTH_RE = /^\d{4}-\d{2}$/;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthTitle = (month) => {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

const staffKeyFor = (teacher) => (teacher.employeeId ? `emp:${String(teacher.employeeId).trim()}` : `t:${teacher._id}`);

const snapshotTeacher = (t) => ({
  name: t.name || '',
  employeeId: t.employeeId || '',
  designation: t.designation || '',
  department: t.department || '',
  dutyType: t.dutyType || '',
  bankName: t.bankName || '',
  accountNumber: t.accountNumber || '',
  ifscCode: t.ifscCode || '',
});

const payrollSettings = async (models) => {
  const settings = await getSettings(models);
  return { ...DEFAULT_PAYROLL_SETTINGS, ...(settings.payroll?.toObject ? settings.payroll.toObject() : settings.payroll || {}) };
};

const ensureComponents = async (models) => {
  const SalaryComponent = getModel(models, 'SalaryComponent');
  if (await SalaryComponent.countDocuments({})) return;
  await SalaryComponent.insertMany(DEFAULT_SALARY_COMPONENTS.map((c) => ({ ...c })), { ordered: false }).catch(() => {});
};

const STAFF_FIELDS = 'name employeeId designation department dutyType bankName accountNumber ifscCode isActive profileImage';

// ── Components & settings ───────────────────────────────────────────
const listComponents = asyncHandler(async (req, res) => {
  await ensureComponents(req.models);
  const SalaryComponent = getModel(req.models, 'SalaryComponent');
  return ok(res, await SalaryComponent.find({ isActive: { $ne: false } }).sort({ sortOrder: 1, name: 1 }).lean());
});

const saveComponent = asyncHandler(async (req, res) => {
  const SalaryComponent = getModel(req.models, 'SalaryComponent');
  const fields = ['name', 'code', 'type', 'calc', 'defaultValue', 'sortOrder'];
  const payload = fields.reduce((acc, f) => (req.body[f] !== undefined ? { ...acc, [f]: req.body[f] } : acc), {});
  if (['PF', 'ESI', 'PT', 'TDS', 'ARREARS', 'OTHER'].includes(String(payload.code || '').toUpperCase())) {
    throw httpError('PF, ESI, PT and TDS are calculated automatically; use another code.');
  }
  if (!req.params.id && (!payload.name || !payload.code)) throw httpError('Name and code are required.');
  const doc = req.params.id
    ? await SalaryComponent.findByIdAndUpdate(req.params.id, { ...payload, updatedBy: auditUser(req) }, { new: true, runValidators: true })
    : await SalaryComponent.create({ ...payload, createdBy: auditUser(req) });
  if (!doc) throw httpError('Component not found.', 404);
  return res.status(req.params.id ? 200 : 201).json({ success: true, data: doc, message: 'Component saved.' });
});

const archiveComponent = asyncHandler(async (req, res) => {
  const SalaryComponent = getModel(req.models, 'SalaryComponent');
  const doc = await SalaryComponent.findById(req.params.id);
  if (!doc) throw httpError('Component not found.', 404);
  if (doc.code === 'BASIC') throw httpError('Basic cannot be removed.', 400);
  doc.isActive = false;
  await doc.save();
  return ok(res, null, { message: 'Component removed. Existing salaries keep their values.' });
});

const getPayrollSettings = asyncHandler(async (req, res) => ok(res, await payrollSettings(req.models)));

const updatePayrollSettings = asyncHandler(async (req, res) => {
  const settings = await getSettings(req.models);
  const allowed = ['pfRate', 'pfWageCeiling', 'esiEmployee', 'esiEmployer', 'esiGrossLimit', 'ptSlabs'];
  const current = settings.payroll?.toObject ? settings.payroll.toObject() : settings.payroll || {};
  allowed.forEach((k) => {
    if (req.body[k] !== undefined) current[k] = req.body[k];
  });
  settings.payroll = current;
  settings.updatedBy = auditUser(req);
  await settings.save();
  return ok(res, await payrollSettings(req.models), { message: 'Payroll settings saved.' });
});

// ── Staff salary structures ─────────────────────────────────────────
const listStaffSalaries = asyncHandler(async (req, res) => {
  const Teacher = getModel(req.models, 'Teacher');
  const StaffSalaryStructure = getModel(req.models, 'StaffSalaryStructure');
  const staff = await Teacher.find({ isActive: { $ne: false } }).select(STAFF_FIELDS).sort({ name: 1 }).lean();
  const keys = staff.map(staffKeyFor);
  const structures = await StaffSalaryStructure.find({ staffKey: { $in: keys }, isActive: { $ne: false } }).lean();
  const byKey = new Map(structures.map((s) => [s.staffKey, s]));
  return ok(res, staff.map((t) => {
    const s = byKey.get(staffKeyFor(t));
    return {
      teacherId: t._id,
      staffKey: staffKeyFor(t),
      ...snapshotTeacher(t),
      salary: s ? { _id: s._id, gross: s.gross, net: s.net, deductions: s.deductions, employerCost: s.employerCost, effectiveFrom: s.effectiveFrom } : null,
    };
  }));
});

const getStaffSalary = asyncHandler(async (req, res) => {
  const Teacher = getModel(req.models, 'Teacher');
  const StaffSalaryStructure = getModel(req.models, 'StaffSalaryStructure');
  const teacher = await Teacher.findById(req.params.teacherId).select(STAFF_FIELDS).lean();
  if (!teacher) throw httpError('Staff member not found.', 404);
  const structure = await StaffSalaryStructure.findOne({ staffKey: staffKeyFor(teacher) }).lean();
  return ok(res, { teacher: { _id: teacher._id, ...snapshotTeacher(teacher) }, staffKey: staffKeyFor(teacher), structure });
});

/** Read-only card data for the staff profile in STAAF. */
const getSalarySummary = asyncHandler(async (req, res) => {
  const Teacher = getModel(req.models, 'Teacher');
  const StaffSalaryStructure = getModel(req.models, 'StaffSalaryStructure');
  const teacher = await Teacher.findById(req.params.teacherId).select('employeeId').lean();
  if (!teacher) throw httpError('Staff member not found.', 404);
  const s = await StaffSalaryStructure.findOne({ staffKey: staffKeyFor(teacher), isActive: { $ne: false } }).lean();
  return ok(res, s ? {
    gross: s.gross,
    net: s.net,
    deductions: s.deductions,
    employerCost: s.employerCost,
    effectiveFrom: s.effectiveFrom,
    lastRevision: s.revisions?.[s.revisions.length - 1] || null,
  } : null);
});

/**
 * Saves a salary structure for one staff member and records a revision when the gross
 * changes. Shared by the single-record save and the bulk revision so both behave the same.
 */
const applySalary = async (models, teacher, body, user, settings) => {
  const StaffSalaryStructure = getModel(models, 'StaffSalaryStructure');
  const SalaryComponent = getModel(models, 'SalaryComponent');

  const catalog = await SalaryComponent.find({}).lean();
  const byId = new Map(catalog.map((c) => [String(c._id), c]));
  const byCode = new Map(catalog.map((c) => [c.code, c]));
  const components = (Array.isArray(body?.components) ? body.components : [])
    .map((line) => {
      const c = byId.get(String(line.componentId)) || byCode.get(String(line.code || '').toUpperCase());
      if (!c) return null;
      const value = Number(line.value);
      if (!Number.isFinite(value) || value < 0) throw httpError(`Invalid value for ${c.name}.`);
      return { componentId: c._id, code: c.code, name: c.name, type: c.type, calc: line.calc || c.calc, value };
    })
    .filter((l) => l && l.value > 0);
  if (!components.some((c) => c.code === 'BASIC')) throw httpError('Basic pay is required.');

  const options = { pf: true, pfWageCap: true, esi: 'auto', tdsMonthly: 0, ...(body.options || {}) };
  const preview = computePayslip({ components, options }, { daysInMonth: 30 }, settings || await payrollSettings(models));
  const staffKey = staffKeyFor(teacher);
  const effectiveFrom = body.effectiveFrom ? new Date(body.effectiveFrom) : new Date();

  let doc = await StaffSalaryStructure.findOne({ staffKey });
  const fromGross = doc?.gross || 0;
  if (!doc) doc = new StaffSalaryStructure({ staffKey, createdBy: user });
  doc.set({
    teacherId: teacher._id,
    employeeId: teacher.employeeId || '',
    staffSnapshot: snapshotTeacher(teacher),
    components,
    options,
    effectiveFrom,
    gross: preview.gross,
    deductions: preview.totalDeductions,
    net: preview.net,
    employerCost: preview.employerCost,
    isActive: true,
    updatedBy: user,
  });
  if (fromGross !== preview.gross || !doc.revisions.length) {
    doc.revisions.push({ effectiveFrom, fromGross, toGross: preview.gross, toNet: preview.net, note: body.note || (fromGross ? 'Revised' : 'Salary set'), by: user });
  }
  await doc.save();
  return { doc, preview };
};

const saveStaffSalary = asyncHandler(async (req, res) => {
  const Teacher = getModel(req.models, 'Teacher');
  const teacher = await Teacher.findById(req.params.teacherId).select(STAFF_FIELDS).lean();
  if (!teacher) throw httpError('Staff member not found.', 404);
  const { doc, preview } = await applySalary(req.models, teacher, req.body, auditUser(req));
  return ok(res, { structure: doc, preview }, { message: 'Salary saved.' });
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validates the body of a bulk salary revision. */
const parseRevision = (body = {}) => {
  const { mode } = body;
  if (!['percent', 'amount'].includes(mode)) throw httpError('Choose "percent" or "amount" as the change type.');
  const value = Number(body.value);
  const limits = REVISION_LIMITS[mode];
  if (body.value === '' || body.value === null || !Number.isFinite(value) || value === 0) throw httpError('Enter a change other than zero.');
  if (value < limits.min || value > limits.max) {
    throw httpError(mode === 'percent'
      ? `Percent change must be between ${limits.min}% and ${limits.max}%.`
      : 'Amount change must be within ±₹10,00,000.');
  }
  const effectiveFrom = String(body.effectiveFrom || '');
  const date = new Date(`${effectiveFrom}T00:00:00Z`);
  if (!DATE_RE.test(effectiveFrom) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== effectiveFrom) {
    throw httpError('Pick a valid effective-from date.');
  }
  const note = String(body.note || '').trim().slice(0, 200);
  return { mode, value, effectiveFrom, note, preview: body.preview === true || body.preview === 'true' };
};

const revisionNote = (mode, value) => {
  const sign = value > 0 ? '+' : '−';
  return mode === 'percent'
    ? `Revised ${sign}${Math.abs(value)}%`
    : `Revised ${sign}₹${Math.abs(value).toLocaleString('en-IN')}`;
};

/**
 * POST /salary/staff/bulk-revise — % or ₹ change to the monthly gross of selected staff,
 * effective from a date. preview=true returns before/after without saving. Saving goes
 * through applySalary (the same path as editing one salary), so history is kept.
 */
const bulkReviseSalaries = asyncHandler(async (req, res) => {
  const ids = parseIds(req.body?.teacherIds, { field: 'teacherIds' });
  const { mode, value, effectiveFrom, note, preview } = parseRevision(req.body || {});
  const Teacher = getModel(req.models, 'Teacher');
  const StaffSalaryStructure = getModel(req.models, 'StaffSalaryStructure');
  const SalaryComponent = getModel(req.models, 'SalaryComponent');

  const teachers = await Teacher.find({ _id: { $in: ids } }).select(STAFF_FIELDS).lean();
  const teacherById = new Map(teachers.map((t) => [String(t._id), t]));
  const structures = await StaffSalaryStructure.find({ staffKey: { $in: teachers.map(staffKeyFor) }, isActive: { $ne: false } }).lean();
  const structureByKey = new Map(structures.map((s) => [s.staffKey, s]));
  const catalog = await SalaryComponent.find({}).select('code').lean();
  const knownIds = new Set(catalog.map((c) => String(c._id)));
  const knownCodes = new Set(catalog.map((c) => c.code));
  const settings = await payrollSettings(req.models);
  const user = auditUser(req);
  const rows = [];

  const result = await runBulk(ids, async (id) => {
    const teacher = teacherById.get(id);
    const label = teacher?.name || 'Staff member';
    const row = { teacherId: id, name: label, beforeGross: 0, afterGross: 0 };
    rows.push(row);
    try {
      if (!teacher) throw httpError('Staff member not found.');
      const structure = structureByKey.get(staffKeyFor(teacher));
      if (!structure) throw httpError('No salary set.');
      const before = computePayslip(structure, { daysInMonth: 30 }, settings);
      row.beforeGross = before.gross;
      row.beforeNet = before.net;
      row.afterGross = before.gross;
      row.afterNet = before.net;
      const lines = (structure.components || []).filter((c) => Number(c.value) > 0);
      if (lines.some((c) => !knownIds.has(String(c.componentId)) && !knownCodes.has(String(c.code || '').toUpperCase()))) {
        throw httpError('This salary uses a component that no longer exists. Edit it on its own.');
      }
      let revised;
      try {
        revised = reviseComponents(lines, { mode, value });
      } catch (error) {
        throw httpError(error.message);
      }
      const after = computePayslip({ components: revised.components, options: structure.options }, { daysInMonth: 30 }, settings);
      row.afterGross = after.gross;
      row.afterNet = after.net;
      if (!preview) {
        await applySalary(req.models, teacher, {
          components: revised.components.map((c) => ({ componentId: c.componentId, code: c.code, calc: c.calc, value: c.value })),
          options: structure.options,
          effectiveFrom,
          note: note || revisionNote(mode, value),
        }, user, settings);
      }
      return label;
    } catch (error) {
      row.error = error.message;
      throw labelled(error, label);
    }
  });

  const data = { ...result, preview, rows };
  if (preview) return ok(res, data);
  return sendBulk(res, data);
});

/** Live preview without saving. */
const previewSalary = asyncHandler(async (req, res) => {
  const preview = computePayslip(
    { components: req.body.components || [], options: req.body.options || {} },
    { daysInMonth: 30, lopDays: req.body.lopDays || 0 },
    await payrollSettings(req.models)
  );
  return ok(res, preview);
});

// ── Payroll runs ────────────────────────────────────────────────────
const computeTotals = (payslips) => payslips.reduce((t, p) => ({
  staff: t.staff + 1,
  gross: t.gross + p.gross,
  deductions: t.deductions + p.totalDeductions,
  net: t.net + p.net,
  employerPf: t.employerPf + p.employerPf,
  employerEsi: t.employerEsi + p.employerEsi,
}), { staff: 0, gross: 0, deductions: 0, net: 0, employerPf: 0, employerEsi: 0 });

const slipFields = (calc) => ({
  paidDays: calc.paidDays,
  lopDays: calc.lopDays,
  earnings: calc.earnings,
  deductions: calc.deductions,
  gross: calc.gross,
  totalDeductions: calc.totalDeductions,
  net: calc.net,
  employerPf: calc.employerPf,
  employerEsi: calc.employerEsi,
});

const listRuns = asyncHandler(async (req, res) => {
  const PayrollRun = getModel(req.models, 'PayrollRun');
  return ok(res, await PayrollRun.find({}).select('-payslips').sort({ month: -1 }).lean());
});

const createRun = asyncHandler(async (req, res) => {
  const PayrollRun = getModel(req.models, 'PayrollRun');
  const Teacher = getModel(req.models, 'Teacher');
  const StaffSalaryStructure = getModel(req.models, 'StaffSalaryStructure');
  const { month } = req.body || {};
  if (!MONTH_RE.test(String(month || ''))) throw httpError('Pick a month.');
  if (await PayrollRun.findOne({ month }).lean()) throw httpError(`Payroll for ${monthTitle(month)} already exists.`, 400);

  const staff = await Teacher.find({ isActive: { $ne: false } }).select(STAFF_FIELDS).lean();
  const structures = await StaffSalaryStructure.find({ staffKey: { $in: staff.map(staffKeyFor) }, isActive: { $ne: false } }).lean();
  const structureByKey = new Map(structures.map((s) => [s.staffKey, s]));
  if (!structures.length) throw httpError('No staff have a salary set yet. Set salaries first.');

  // ATTND integration — only when that module is active for the tenant.
  let lopByStaff = {};
  const attendanceUsed = Boolean(req.models.StaffAttendanceDaily);
  if (attendanceUsed) {
    const records = await req.models.StaffAttendanceDaily.find({ attendanceDate: { $regex: `^${month}-` }, status: { $in: ['A', 'HD'] } })
      .select('staffId status')
      .lean();
    lopByStaff = attendanceLop(records);
  }

  const settings = await payrollSettings(req.models);
  const totalDays = daysInMonth(month);
  const payslips = staff
    .filter((t) => structureByKey.has(staffKeyFor(t)))
    .map((t) => {
      const structure = structureByKey.get(staffKeyFor(t));
      const lop = attendanceUsed ? lopByStaff[String(t._id)] || 0 : 0;
      const calc = computePayslip(structure, { daysInMonth: totalDays, lopDays: lop }, settings);
      return {
        staffKey: structure.staffKey,
        teacherId: t._id,
        snapshot: snapshotTeacher(t),
        lopFromAttendance: attendanceUsed ? lop : null,
        arrears: 0,
        otherDeduction: 0,
        ...slipFields(calc),
      };
    })
    .sort((a, b) => a.snapshot.name.localeCompare(b.snapshot.name));

  const run = await PayrollRun.create({
    month,
    daysInMonth: totalDays,
    payslips,
    totals: computeTotals(payslips),
    attendanceUsed,
    createdBy: auditUser(req),
    ...(req.academicSession ? { academicSession: req.academicSession } : {}),
  });
  return res.status(201).json({ success: true, data: run, message: `Draft payroll for ${monthTitle(month)} created for ${payslips.length} staff.` });
});

const loadRun = async (models, month) => {
  const PayrollRun = getModel(models, 'PayrollRun');
  const run = await PayrollRun.findOne({ month });
  if (!run) throw httpError('Payroll run not found.', 404);
  return run;
};

const getRun = asyncHandler(async (req, res) => {
  const run = await loadRun(req.models, req.params.month);
  const missing = await (async () => {
    const Teacher = getModel(req.models, 'Teacher');
    const StaffSalaryStructure = getModel(req.models, 'StaffSalaryStructure');
    const staff = await Teacher.find({ isActive: { $ne: false } }).select('name employeeId designation').lean();
    const keys = new Set((await StaffSalaryStructure.find({ isActive: { $ne: false } }).select('staffKey').lean()).map((s) => s.staffKey));
    return staff.filter((t) => !keys.has(staffKeyFor(t))).map((t) => ({ teacherId: t._id, name: t.name, designation: t.designation }));
  })();
  return ok(res, { ...run.toObject(), staffWithoutSalary: missing });
});

const updateRun = asyncHandler(async (req, res) => {
  const StaffSalaryStructure = getModel(req.models, 'StaffSalaryStructure');
  const run = await loadRun(req.models, req.params.month);
  if (run.status !== 'draft') throw httpError('Only draft payroll can be edited. Reopen it first.', 400);
  const edits = new Map((Array.isArray(req.body.payslips) ? req.body.payslips : []).map((p) => [String(p._id), p]));
  const structures = new Map((await StaffSalaryStructure.find({ staffKey: { $in: run.payslips.map((p) => p.staffKey) } }).lean()).map((s) => [s.staffKey, s]));
  const settings = await payrollSettings(req.models);
  run.payslips.forEach((slip) => {
    const edit = edits.get(String(slip._id));
    if (edit) {
      if (edit.lopDays !== undefined) slip.lopDays = Math.max(0, Math.min(run.daysInMonth, Number(edit.lopDays) || 0));
      if (edit.arrears !== undefined) slip.arrears = Math.max(0, Number(edit.arrears) || 0);
      if (edit.otherDeduction !== undefined) slip.otherDeduction = Math.max(0, Number(edit.otherDeduction) || 0);
      if (edit.remarks !== undefined) slip.remarks = edit.remarks;
    }
    const structure = structures.get(slip.staffKey);
    if (!structure) return;
    slip.set(slipFields(computePayslip(structure, {
      daysInMonth: run.daysInMonth,
      lopDays: slip.lopDays,
      arrears: slip.arrears,
      otherDeduction: slip.otherDeduction,
    }, settings)));
  });
  run.totals = computeTotals(run.payslips);
  run.updatedBy = auditUser(req);
  await run.save();
  return ok(res, run, { message: 'Payroll updated.' });
});

const deleteRun = asyncHandler(async (req, res) => {
  const PayrollRun = getModel(req.models, 'PayrollRun');
  const run = await loadRun(req.models, req.params.month);
  if (run.status !== 'draft') throw httpError('Only a draft payroll can be deleted.', 400);
  await PayrollRun.deleteOne({ _id: run._id });
  return ok(res, null, { message: 'Draft deleted.' });
});

const finalizeRun = asyncHandler(async (req, res) => {
  const run = await loadRun(req.models, req.params.month);
  if (run.status !== 'draft') throw httpError('Payroll is already finalized.', 400);
  if (!run.payslips.length) throw httpError('No payslips in this run.');
  run.status = 'finalized';
  run.updatedBy = auditUser(req);
  await run.save();
  eventBus.emitFromRequest(req, EVENTS.PAYROLL_FINALIZED, { runId: String(run._id) });
  return ok(res, run, { message: 'Payroll finalized. Payslips are ready.' });
});

const payRun = asyncHandler(async (req, res) => {
  const run = await loadRun(req.models, req.params.month);
  if (run.status !== 'finalized') throw httpError('Finalize the payroll before marking it paid.', 400);
  run.set({
    status: 'paid',
    paidOn: req.body?.paidOn ? new Date(req.body.paidOn) : new Date(),
    paymentMode: req.body?.mode || 'bank_transfer',
    reference: req.body?.reference || '',
    updatedBy: auditUser(req),
  });
  const expense = await upsertForSource(req.models, { kind: 'salary', sourceModel: 'PayrollRun', source: run, sessionLabel: req.academicSession, user: auditUser(req) });
  run.expenseId = expense._id;
  await run.save();
  eventBus.emitFromRequest(req, EVENTS.PAYROLL_PAID, { runId: String(run._id) });
  return ok(res, run, { message: `Salary for ${monthTitle(run.month)} marked paid.` });
});

const reopenRun = asyncHandler(async (req, res) => {
  const run = await loadRun(req.models, req.params.month);
  if (run.status === 'draft') throw httpError('Payroll is already a draft.', 400);
  if (run.status === 'paid') await voidForSource(req.models, run._id, 'Payroll reopened', auditUser(req));
  run.set({ status: 'draft', paidOn: null, updatedBy: auditUser(req) });
  await run.save();
  return ok(res, run, { message: 'Payroll reopened as draft.' });
});

// ── Outputs ─────────────────────────────────────────────────────────
const inr = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * GET  ?staffKey=… → one staff member's payslip, or every payslip in the run.
 * POST { teacherIds } → payslips for the selected staff only (ids can be too many for a URL).
 */
const payslipsPdf = asyncHandler(async (req, res) => {
  const teacherIds = req.method === 'POST' ? new Set(parseIds(req.body?.teacherIds, { field: 'teacherIds' })) : null;
  const run = await loadRun(req.models, req.params.month);
  let slips = run.payslips;
  if (teacherIds) slips = run.payslips.filter((p) => teacherIds.has(String(p.teacherId)));
  else if (req.query.staffKey) slips = run.payslips.filter((p) => p.staffKey === req.query.staffKey);
  if (!slips.length) throw httpError('No payslips found.', 404);
  const profile = req.models.SchoolProfile ? await req.models.SchoolProfile.findOne({}).lean() : null;
  const data = {
    school: { name: profile?.schoolName || 'School', address: profile?.address || '', logoUrl: profile?.logoUrl || '' },
    title: monthTitle(run.month),
    draft: run.status === 'draft',
    slips: slips.map((p) => {
      const rows = Math.max(p.earnings.length, p.deductions.length);
      return {
        ...p.toObject().snapshot,
        paidDays: p.paidDays,
        lopDays: p.lopDays,
        daysInMonth: run.daysInMonth,
        rows: Array.from({ length: rows }).map((_, i) => ({
          earning: p.earnings[i]?.name || '',
          earningAmount: p.earnings[i] ? inr(p.earnings[i].amount) : '',
          deduction: p.deductions[i]?.name || '',
          deductionAmount: p.deductions[i] ? inr(p.deductions[i].amount) : '',
        })),
        gross: inr(p.gross),
        totalDeductions: inr(p.totalDeductions),
        net: inr(p.net),
        netWords: `RUPEES ${numberToIndianWords(Math.round(p.net))}`,
        employerPf: p.employerPf ? inr(p.employerPf) : '',
        employerEsi: p.employerEsi ? inr(p.employerEsi) : '',
        remarks: p.remarks,
      };
    }),
  };
  const pdf = await pdfGenerator.generatePDF('cpitl-payslip', data);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="payslips_${run.month}.pdf"`);
  return res.status(200).send(pdf);
});

const bankSheetXlsx = asyncHandler(async (req, res) => {
  const run = await loadRun(req.models, req.params.month);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Salary ${run.month}`);
  ws.columns = [
    { header: 'S.No', key: 'sno', width: 6 },
    { header: 'Employee ID', key: 'emp', width: 14 },
    { header: 'Name', key: 'name', width: 28 },
    { header: 'Bank', key: 'bank', width: 22 },
    { header: 'Account Number', key: 'acc', width: 22 },
    { header: 'IFSC', key: 'ifsc', width: 14 },
    { header: 'Net Pay (₹)', key: 'net', width: 14 },
  ];
  run.payslips.forEach((p, i) => ws.addRow({
    sno: i + 1,
    emp: p.snapshot?.employeeId || '',
    name: p.snapshot?.name || '',
    bank: p.snapshot?.bankName || '',
    acc: p.snapshot?.accountNumber || '',
    ifsc: p.snapshot?.ifscCode || '',
    net: p.net,
  }));
  ws.getColumn('acc').numFmt = '@';
  const total = ws.addRow({ name: 'Total', net: run.totals?.net || 0 });
  total.font = { bold: true };
  ws.getRow(1).font = { bold: true };
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="salary-bank-sheet_${run.month}.xlsx"`);
  await wb.xlsx.write(res);
  return res.end();
});

module.exports = {
  staffKeyFor,
  listComponents,
  saveComponent,
  archiveComponent,
  getPayrollSettings,
  updatePayrollSettings,
  listStaffSalaries,
  getStaffSalary,
  getSalarySummary,
  saveStaffSalary,
  bulkReviseSalaries,
  previewSalary,
  listRuns,
  createRun,
  getRun,
  updateRun,
  deleteRun,
  finalizeRun,
  payRun,
  reopenRun,
  payslipsPdf,
  bankSheetXlsx,
};
