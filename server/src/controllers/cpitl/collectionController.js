const asyncHandler = require('../../middleware/asyncHandler');
const pdfGenerator = require('../../utils/pdfGenerator');
const {
  httpError,
  getModel,
  auditUser,
  getSettings,
  snapshotStudent,
  syncAccountDemands,
  recomputeAccountTotals,
  recordPayment,
  cancelPayment,
} = require('../../modules/cpitl/feeService');
const { outstandingLateFee, round2 } = require('../../modules/cpitl/feeSchedule');

const ok = (res, data, extra = {}) => res.json({ success: true, data, ...extra });

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const formatINR = (value) => Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const MODE_LABELS = { cash: 'Cash', upi: 'UPI', cheque: 'Cheque', dd: 'Demand Draft', bank_transfer: 'Bank Transfer', card: 'Card' };

const withLateFee = (demands, lateFeeRule, asOf = new Date()) => demands.map((d) => ({
  ...d,
  lateFeeDue: outstandingLateFee(d, lateFeeRule, asOf),
  isOverdue: round2(d.balance) > 0 && new Date(d.dueDate) < asOf,
}));

// ── Student search & ledger ─────────────────────────────────────────
const searchStudents = asyncHandler(async (req, res) => {
  const Student = getModel(req.models, 'Student');
  const StudentFeeAccount = getModel(req.models, 'StudentFeeAccount');
  const { q, class: cls, section } = req.query;
  const filter = { isActive: { $ne: false } };
  if (cls) filter.class = cls;
  if (section) filter.section = section;
  if (q && String(q).trim()) {
    const rx = { $regex: escapeRegex(String(q).trim()), $options: 'i' };
    filter.$and = [{ $or: [{ name: rx }, { rollNumber: rx }, { fatherName: rx }, { guardianPhone: rx }] }];
  }
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const students = await Student.find(filter)
    .select('name rollNumber class section fatherName guardianPhone')
    .sort({ class: 1, section: 1, name: 1 })
    .limit(limit)
    .lean();
  const accounts = await StudentFeeAccount.find({ student: { $in: students.map((s) => s._id) } })
    .select('student structureId totals')
    .lean();
  const byStudent = new Map(accounts.map((a) => [String(a.student), a]));
  return ok(res, students.map((s) => {
    const account = byStudent.get(String(s._id));
    return { ...s, accountId: account?._id || null, structureId: account?.structureId || null, totals: account?.totals || null };
  }));
});

const loadAccountForStudent = async (models, studentId, { create = false, sessionLabel, user } = {}) => {
  const StudentFeeAccount = getModel(models, 'StudentFeeAccount');
  const Student = getModel(models, 'Student');
  let account = await StudentFeeAccount.findOne({ student: studentId });
  if (account || !create) return account;
  const student = await Student.findById(studentId).lean();
  if (!student) throw httpError('Student not found.', 404);
  account = await StudentFeeAccount.create({
    student: student._id,
    studentSnapshot: snapshotStudent(student),
    academicSession: sessionLabel || undefined,
    createdBy: user,
  });
  return account;
};

const getStudentAccount = asyncHandler(async (req, res) => {
  const Student = getModel(req.models, 'Student');
  const FeeDemand = getModel(req.models, 'FeeDemand');
  const FeePayment = getModel(req.models, 'FeePayment');
  const FeeStructure = getModel(req.models, 'FeeStructure');

  const student = await Student.findById(req.params.studentId)
    .select('name rollNumber class section fatherName motherName guardianPhone busNo category profileImage')
    .lean();
  if (!student) throw httpError('Student not found.', 404);

  const account = await loadAccountForStudent(req.models, student._id);
  if (!account) return ok(res, { student, account: null, structure: null, demands: [], payments: [] });

  const structure = account.structureId ? await FeeStructure.findById(account.structureId).lean() : null;
  const demands = await FeeDemand.find({ accountId: account._id }).sort({ dueDate: 1 }).lean();
  const payments = await FeePayment.find({ accountId: account._id }).sort({ date: -1, createdAt: -1 }).lean();
  const lateFeeRule = structure?.lateFee;

  return ok(res, {
    student,
    account,
    structure: structure ? {
      _id: structure._id,
      name: structure.name,
      version: structure.version,
      status: structure.status,
      lateFee: structure.lateFee,
      optionalHeads: structure.components.filter((c) => c.isOptional),
      isOutdated: account.structureVersion < structure.version,
    } : null,
    demands: withLateFee(demands, lateFeeRule),
    payments,
  });
});

/** Update concessions / optional heads / opening balance and regenerate unpaid dues. */
const updateStudentAccount = asyncHandler(async (req, res) => {
  const FeeStructure = getModel(req.models, 'FeeStructure');
  const Student = getModel(req.models, 'Student');
  const account = await loadAccountForStudent(req.models, req.params.studentId, {
    create: true,
    sessionLabel: req.academicSession,
    user: auditUser(req),
  });

  const { concessions, optedOptionalHeads, openingBalance, structureId } = req.body;
  if (Array.isArray(concessions)) account.concessions = concessions;
  if (Array.isArray(optedOptionalHeads)) account.optedOptionalHeads = optedOptionalHeads;
  if (openingBalance !== undefined) {
    const value = Number(openingBalance);
    if (!Number.isFinite(value) || value < 0) throw httpError('Opening balance must be zero or more.');
    account.openingBalance = value;
  }
  if (structureId !== undefined && String(structureId || '') !== String(account.structureId || '')) {
    if (structureId) {
      const next = await FeeStructure.findById(structureId).select('status').lean();
      if (!next) throw httpError('Fee structure not found.', 404);
      if (next.status === 'archived') throw httpError('Archived structures cannot be assigned. Restore it first.', 400);
    }
    account.structureId = structureId || null;
  }

  const student = await Student.findById(account.student).lean();
  if (student) account.studentSnapshot = snapshotStudent(student);

  const structure = account.structureId ? await FeeStructure.findById(account.structureId) : null;
  if (structure) account.structureVersion = structure.version;
  account.updatedBy = auditUser(req);
  await account.save();
  const result = await syncAccountDemands(req.models, account, structure, req.academicSession);
  return ok(res, { account, ...result }, { message: 'Fee account updated.' });
});

const waiveDemand = asyncHandler(async (req, res) => {
  const FeeDemand = getModel(req.models, 'FeeDemand');
  const demand = await FeeDemand.findById(req.params.demandId);
  if (!demand) throw httpError('Installment not found.', 404);
  if (round2(demand.paid) > 0) throw httpError('Installments with payments cannot be waived.', 400);
  demand.status = req.body?.waive === false ? 'due' : 'waived';
  await demand.save();
  await recomputeAccountTotals(req.models, demand.accountId);
  return ok(res, demand, { message: demand.status === 'waived' ? 'Installment waived.' : 'Installment restored.' });
});

// ── Payments ────────────────────────────────────────────────────────
const createPayment = asyncHandler(async (req, res) => {
  const account = await loadAccountForStudent(req.models, req.params.studentId);
  if (!account) throw httpError('No fee account found for this student. Assign a fee structure first.', 404);
  const payment = await recordPayment(req.models, account, req.body || {}, req.academicSession, auditUser(req));
  return res.status(201).json({ success: true, data: payment, message: `Receipt ${payment.receiptNo} generated.` });
});

const listPayments = asyncHandler(async (req, res) => {
  const FeePayment = getModel(req.models, 'FeePayment');
  const { from, to, mode, class: cls, section, status, q } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (mode) filter.mode = mode;
  if (cls) filter['studentSnapshot.class'] = cls;
  if (section) filter['studentSnapshot.section'] = section;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      filter.date.$lte = end;
    }
  }
  if (q && String(q).trim()) {
    const rx = { $regex: escapeRegex(String(q).trim()), $options: 'i' };
    filter.$and = [{ $or: [{ receiptNo: rx }, { 'studentSnapshot.name': rx }, { 'studentSnapshot.rollNumber': rx }, { reference: rx }] }];
  }
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const payments = await FeePayment.find(filter).sort({ date: -1, createdAt: -1 }).limit(limit).lean();
  const valid = payments.filter((p) => p.status === 'valid');
  return ok(res, payments, { summary: { count: valid.length, total: round2(valid.reduce((s, p) => s + p.total, 0)) } });
});

const cancelPaymentHandler = asyncHandler(async (req, res) => {
  const FeePayment = getModel(req.models, 'FeePayment');
  const payment = await FeePayment.findById(req.params.id);
  if (!payment) throw httpError('Receipt not found.', 404);
  await cancelPayment(req.models, payment, req.body?.reason, auditUser(req));
  return ok(res, payment, { message: `Receipt ${payment.receiptNo} cancelled.` });
});

const updateChequeStatus = asyncHandler(async (req, res) => {
  const FeePayment = getModel(req.models, 'FeePayment');
  const payment = await FeePayment.findById(req.params.id);
  if (!payment) throw httpError('Receipt not found.', 404);
  const status = req.body?.status;
  if (!['pending', 'cleared', 'bounced'].includes(status)) throw httpError('Invalid cheque status.');
  if (status === 'bounced' && payment.status === 'valid') {
    await cancelPayment(req.models, payment, `Cheque bounced${req.body?.note ? `: ${req.body.note}` : ''}`, auditUser(req));
  }
  payment.cheque.status = status;
  await payment.save();
  return ok(res, payment, { message: `Cheque marked ${status}.` });
});

// ── PDFs ────────────────────────────────────────────────────────────
const loadSchool = async (models) => {
  const profile = models?.SchoolProfile ? await models.SchoolProfile.findOne({}).lean() : null;
  return {
    name: profile?.schoolName || 'School',
    address: profile?.address || '',
    contact: profile?.contact || '',
    email: profile?.email || '',
    logoUrl: profile?.logoUrl || '',
    affiliationNo: profile?.affiliationNo || '',
    schoolCode: profile?.schoolCode || '',
  };
};

const sendPdf = (res, buffer, filename) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  return res.status(200).send(buffer);
};

const receiptPdf = asyncHandler(async (req, res) => {
  const FeePayment = getModel(req.models, 'FeePayment');
  const payment = await FeePayment.findById(req.params.id).lean();
  if (!payment) throw httpError('Receipt not found.', 404);
  const [school, settings] = await Promise.all([loadSchool(req.models), getSettings(req.models)]);

  // Group allocation lines by installment for a readable receipt.
  const groups = new Map();
  payment.allocations.forEach((a) => {
    const key = a.periodLabel || 'Fees';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ name: a.name, amount: formatINR(a.amount) });
  });

  const data = {
    school,
    settings: { gstin: settings.gstin, pan: settings.pan, footer: settings.slipFooterNote },
    receipt: {
      no: payment.receiptNo,
      date: formatDate(payment.date),
      mode: MODE_LABELS[payment.mode] || payment.mode,
      reference: payment.reference || payment.cheque?.number || '',
      chequeBank: payment.cheque?.bank || '',
      feeAmount: formatINR(payment.feeAmount),
      lateFee: payment.lateFeeCollected > 0 ? formatINR(payment.lateFeeCollected) : '',
      total: formatINR(payment.total),
      words: payment.amountInWords,
      collectedBy: payment.collectedBy?.name || '',
      remarks: payment.remarks,
      cancelled: payment.status === 'cancelled',
      cancelReason: payment.cancellation?.reason || '',
      session: payment.academicSession || req.academicSession || '',
    },
    student: payment.studentSnapshot,
    groups: [...groups.entries()].map(([label, lines]) => ({ label, lines })),
    copies: [{ title: 'Parent Copy' }, { title: 'School Copy' }],
  };
  const pdf = await pdfGenerator.generatePDF('cpitl-fee-receipt', data);
  return sendPdf(res, pdf, `receipt_${payment.receiptNo.replace(/\//g, '-')}.pdf`);
});

/** Build slip data for one account: open demands up to `uptoPeriodKey` (or all open). */
const buildSlipForAccount = (account, demands, structure, uptoDate) => {
  const asOf = new Date();
  const open = demands.filter((d) => d.status !== 'waived' && round2(d.balance) > 0 && (!uptoDate || new Date(d.dueDate) <= uptoDate));
  if (!open.length) return null;
  const rows = open.map((d) => {
    const lateFee = outstandingLateFee(d, structure?.lateFee, asOf);
    return {
      label: d.label,
      dueDate: formatDate(d.dueDate),
      lines: d.lines
        .filter((l) => round2(l.net - l.paid) > 0)
        .map((l) => ({ name: l.name, amount: formatINR(round2(l.net - l.paid)) })),
      lateFee: lateFee > 0 ? formatINR(lateFee) : '',
      amount: formatINR(d.balance),
      _balance: round2(d.balance),
      _lateFee: lateFee,
    };
  });
  const balance = round2(rows.reduce((s, r) => s + r._balance, 0));
  const lateFee = round2(rows.reduce((s, r) => s + r._lateFee, 0));
  return {
    student: account.studentSnapshot,
    rows,
    dueDate: rows[rows.length - 1].dueDate,
    balance: formatINR(balance),
    lateFee: lateFee > 0 ? formatINR(lateFee) : '',
    total: formatINR(balance + lateFee),
  };
};

const renderSlips = async (req, res, slips, filename) => {
  if (!slips.length) throw httpError('No pending dues found for the selection.', 404);
  const [school, settings] = await Promise.all([loadSchool(req.models), getSettings(req.models)]);
  const data = {
    school,
    settings: { footer: settings.slipFooterNote, bankDetails: settings.bankDetails },
    session: req.academicSession || '',
    generatedOn: formatDate(new Date()),
    slips: slips.map((slip) => ({ ...slip, copies: [{ title: 'Parent Copy' }, { title: 'School Copy' }] })),
  };
  const pdf = await pdfGenerator.generatePDF('cpitl-fee-slip', data);
  return sendPdf(res, pdf, filename);
};

/** Slips cover dues up to the given date, defaulting to the end of the current month. */
const parseUpto = (value) => {
  const date = value ? new Date(value) : null;
  if (date && !Number.isNaN(date.getTime())) {
    date.setHours(23, 59, 59, 999);
    return date;
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
};

const studentFeeSlipPdf = asyncHandler(async (req, res) => {
  const FeeDemand = getModel(req.models, 'FeeDemand');
  const FeeStructure = getModel(req.models, 'FeeStructure');
  const account = await loadAccountForStudent(req.models, req.params.studentId);
  if (!account) throw httpError('No fee account found for this student.', 404);
  const demands = await FeeDemand.find({ accountId: account._id }).sort({ dueDate: 1 }).lean();
  const structure = account.structureId ? await FeeStructure.findById(account.structureId).lean() : null;
  const slip = buildSlipForAccount(account, demands, structure, parseUpto(req.query.upto));
  return renderSlips(req, res, slip ? [slip] : [], `fee-slip_${account.studentSnapshot?.rollNumber || account._id}.pdf`);
});

const bulkFeeSlipsPdf = asyncHandler(async (req, res) => {
  const StudentFeeAccount = getModel(req.models, 'StudentFeeAccount');
  const FeeDemand = getModel(req.models, 'FeeDemand');
  const FeeStructure = getModel(req.models, 'FeeStructure');
  const { class: cls, section } = req.query;
  if (!cls) throw httpError('Select a class.');
  const filter = { 'studentSnapshot.class': cls };
  if (section) filter['studentSnapshot.section'] = section;
  const accounts = await StudentFeeAccount.find(filter).sort({ 'studentSnapshot.section': 1, 'studentSnapshot.name': 1 }).lean();
  if (accounts.length > 400) throw httpError('Too many students in one batch. Pick a section.');
  const demands = await FeeDemand.find({ accountId: { $in: accounts.map((a) => a._id) } }).sort({ dueDate: 1 }).lean();
  const structures = await FeeStructure.find({ _id: { $in: [...new Set(accounts.map((a) => String(a.structureId)).filter((id) => id !== 'null'))] } }).lean();
  const structureById = new Map(structures.map((s) => [String(s._id), s]));
  const demandsByAccount = demands.reduce((map, d) => {
    const key = String(d.accountId);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(d);
    return map;
  }, new Map());
  const upto = parseUpto(req.query.upto);
  const slips = accounts
    .map((a) => buildSlipForAccount(a, demandsByAccount.get(String(a._id)) || [], structureById.get(String(a.structureId)), upto))
    .filter(Boolean);
  return renderSlips(req, res, slips, `fee-slips_${cls}${section ? `-${section}` : ''}.pdf`);
});

module.exports = {
  searchStudents,
  getStudentAccount,
  updateStudentAccount,
  waiveDemand,
  createPayment,
  listPayments,
  cancelPaymentHandler,
  updateChequeStatus,
  receiptPdf,
  studentFeeSlipPdf,
  bulkFeeSlipsPdf,
};
