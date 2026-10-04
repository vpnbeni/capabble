/**
 * CPITL fee persistence helpers. All functions take `models` (req.models) so
 * they work with the tenant-scoped connection resolved by tenantContextMiddleware.
 */
const {
  round2,
  buildDemandSchedule,
  allocatePayment,
  allocateLateFee,
  demandStatus,
  parseSessionStartYear,
  diffComponents,
} = require('./feeSchedule');
const { DEFAULT_FEE_HEADS, DEFAULT_CONCESSION_PRESETS } = require('./constants');
const { numberToIndianWords } = require('../../utils/numberToIndianWords');

const OPENING_PERIOD_KEY = 'OPENING';

const httpError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const getModel = (models, key) => {
  const Model = models?.[key];
  if (!Model) throw httpError(`${key} is not available for this tenant. Enable the CPITL module.`, 500);
  return Model;
};

const auditUser = (req) => ({
  userId: req.user?._id || null,
  name: req.user?.name || '',
  email: req.user?.email || '',
});

const sessionShort = (sessionLabel) => {
  const start = parseSessionStartYear(sessionLabel);
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
};

const ensureFeeHeads = async (models) => {
  const FeeHead = getModel(models, 'FeeHead');
  const count = await FeeHead.countDocuments({});
  if (count > 0) return;
  await FeeHead.insertMany(DEFAULT_FEE_HEADS.map((head) => ({ ...head })), { ordered: false }).catch(() => {});
};

const getSettings = async (models) => {
  const CapitalSettings = getModel(models, 'CapitalSettings');
  const settings = await CapitalSettings.findOne({ key: 'default' });
  if (settings) return settings;
  // Atomic upsert: concurrent first requests must not race into a duplicate-key error.
  return CapitalSettings.findOneAndUpdate(
    { key: 'default' },
    { $setOnInsert: { key: 'default', concessionPresets: DEFAULT_CONCESSION_PRESETS.map((p) => ({ ...p })) } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
};

const nextReceiptNo = async (models, sessionLabel, prefix = 'RCPT') => {
  const CapitalCounter = getModel(models, 'CapitalCounter');
  const short = sessionShort(sessionLabel);
  const counter = await CapitalCounter.findOneAndUpdate(
    { key: `receipt:${short}` },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return `${prefix || 'RCPT'}/${short}/${String(counter.seq).padStart(5, '0')}`;
};

const snapshotStudent = (student) => ({
  name: student?.name || '',
  rollNumber: student?.rollNumber || '',
  class: student?.class || '',
  section: student?.section || '',
  fatherName: student?.fatherName || '',
  guardianPhone: student?.guardianPhone || '',
});

const refreshDemandTotals = (demand) => {
  const lines = demand.lines || [];
  demand.gross = round2(lines.reduce((s, l) => s + (l.gross || 0), 0));
  demand.concession = round2(lines.reduce((s, l) => s + (l.concession || 0), 0));
  demand.total = round2(lines.reduce((s, l) => s + (l.net || 0), 0));
  demand.paid = round2(lines.reduce((s, l) => s + (l.paid || 0), 0));
  demand.balance = round2(demand.total - demand.paid);
  if (demand.status !== 'waived') demand.status = demandStatus(demand.total, demand.paid);
  return demand;
};

const sumDemandTotals = (demands) => {
  const totals = demands.filter((d) => d.status !== 'waived').reduce((acc, d) => {
    acc.gross += d.gross || 0;
    acc.concession += d.concession || 0;
    acc.demanded += d.total || 0;
    acc.paid += d.paid || 0;
    acc.balance += d.balance || 0;
    return acc;
  }, { gross: 0, concession: 0, demanded: 0, paid: 0, balance: 0 });
  Object.keys(totals).forEach((k) => { totals[k] = round2(totals[k]); });
  return totals;
};

const recomputeAccountTotals = async (models, accountId) => {
  const FeeDemand = getModel(models, 'FeeDemand');
  const StudentFeeAccount = getModel(models, 'StudentFeeAccount');
  const demands = await FeeDemand.find({ accountId }).lean();
  const totals = sumDemandTotals(demands);
  await StudentFeeAccount.updateOne({ _id: accountId }, { $set: { totals } });
  return totals;
};

/**
 * Plan the demand changes for one account (no I/O).
 * Demands that already carry a payment are left untouched so receipts stay valid.
 */
const planAccountDemands = (account, structure, sessionLabel, existing = []) => {
  const existingByKey = new Map(existing.map((d) => [d.periodKey, d]));
  const startYear = parseSessionStartYear(sessionLabel);

  const schedule = structure
    ? buildDemandSchedule({
      components: structure.components,
      installmentPlan: structure.installmentPlan,
      sessionLabel,
      optedOptionalHeads: account.optedOptionalHeads,
      concessions: account.concessions,
    })
    : [];

  const opening = round2(account.openingBalance);
  if (opening > 0) {
    schedule.unshift({
      periodKey: OPENING_PERIOD_KEY,
      label: 'Previous dues',
      dueDate: new Date(Date.UTC(startYear, 3, 1)),
      lines: [{ feeHead: null, name: 'Previous session arrears', code: 'ARREARS', frequency: 'one_time', gross: opening, concession: 0, net: opening, paid: 0 }],
    });
  }

  const scheduledKeys = new Set();
  const snapshot = account.studentSnapshot || {};
  const ops = [];
  const finalDemands = [];
  let created = 0;
  let updated = 0;

  schedule.forEach((entry) => {
    scheduledKeys.add(entry.periodKey);
    const current = existingByKey.get(entry.periodKey);
    if (current && round2(current.paid) > 0) {
      finalDemands.push(current);
      return;
    }
    const fields = refreshDemandTotals({
      label: entry.label,
      dueDate: entry.dueDate,
      lines: entry.lines,
      class: snapshot.class,
      section: snapshot.section,
      status: current?.status === 'waived' ? 'waived' : 'due',
    });
    finalDemands.push(fields);
    if (current) {
      ops.push({ updateOne: { filter: { _id: current._id }, update: { $set: fields } } });
      updated += 1;
    } else {
      ops.push({
        insertOne: {
          document: {
            ...fields,
            accountId: account._id,
            student: account.student,
            periodKey: entry.periodKey,
            lateFeePaid: 0,
            ...(sessionLabel ? { academicSession: sessionLabel } : {}),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      });
      created += 1;
    }
  });

  // Demands that dropped out of the schedule and carry no payment are removed.
  const stale = existing.filter((d) => !scheduledKeys.has(d.periodKey) && round2(d.paid) <= 0);
  existing
    .filter((d) => !scheduledKeys.has(d.periodKey) && round2(d.paid) > 0)
    .forEach((d) => finalDemands.push(d));
  if (stale.length) ops.push({ deleteMany: { filter: { _id: { $in: stale.map((d) => d._id) } } } });

  return { ops, totals: sumDemandTotals(finalDemands), created, updated, removed: stale.length };
};

/**
 * Regenerate unpaid demands for many accounts in a handful of round trips:
 * one read of existing demands, one demand bulkWrite, one account bulkWrite.
 * Accounts must already be saved (have an _id).
 */
const syncDemandsForAccounts = async (models, accounts, structureFor, sessionLabel) => {
  const FeeDemand = getModel(models, 'FeeDemand');
  const StudentFeeAccount = getModel(models, 'StudentFeeAccount');
  const summary = { created: 0, updated: 0, removed: 0 };
  if (!accounts.length) return summary;

  const existing = await FeeDemand.find({ accountId: { $in: accounts.map((a) => a._id) } }).lean();
  const existingByAccount = existing.reduce((map, d) => {
    const key = String(d.accountId);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(d);
    return map;
  }, new Map());

  const demandOps = [];
  const accountOps = [];
  accounts.forEach((account) => {
    const plan = planAccountDemands(account, structureFor(account), sessionLabel, existingByAccount.get(String(account._id)) || []);
    demandOps.push(...plan.ops);
    accountOps.push({ updateOne: { filter: { _id: account._id }, update: { $set: { totals: plan.totals } } } });
    summary.created += plan.created;
    summary.updated += plan.updated;
    summary.removed += plan.removed;
    if (accounts.length === 1) summary.totals = plan.totals;
  });

  if (demandOps.length) await FeeDemand.bulkWrite(demandOps, { ordered: false });
  if (accountOps.length) await StudentFeeAccount.bulkWrite(accountOps, { ordered: false });
  return summary;
};

const syncAccountDemands = (models, account, structure, sessionLabel) =>
  syncDemandsForAccounts(models, [account], () => structure, sessionLabel);

/** Assign a structure to students matched by class/section or explicit ids. */
const assignStructure = async (models, structure, { classes = [], sections = [], studentIds = [] }, sessionLabel, user) => {
  const Student = getModel(models, 'Student');
  const StudentFeeAccount = getModel(models, 'StudentFeeAccount');

  const query = { isActive: { $ne: false } };
  if (studentIds.length) {
    query._id = { $in: studentIds };
  } else {
    const targetClasses = classes.length ? classes : structure.applicableClasses;
    if (!targetClasses?.length) throw httpError('Select at least one class or student to assign.');
    query.class = { $in: targetClasses };
    if (sections.length) query.section = { $in: sections };
  }

  const students = await Student.find(query).select('name rollNumber class section fatherName guardianPhone').lean();
  const existingAccounts = await StudentFeeAccount.find({ student: { $in: students.map((s) => s._id) } }).lean();
  const accountByStudent = new Map(existingAccounts.map((a) => [String(a.student), a]));

  const accountOps = [];
  const accounts = students.map((student) => {
    const existingAccount = accountByStudent.get(String(student._id));
    const fields = {
      studentSnapshot: snapshotStudent(student),
      structureId: structure._id,
      structureVersion: structure.version,
      updatedBy: user,
      updatedAt: new Date(),
    };
    if (existingAccount) {
      accountOps.push({ updateOne: { filter: { _id: existingAccount._id }, update: { $set: fields } } });
      return { ...existingAccount, ...fields };
    }
    const doc = new StudentFeeAccount({
      ...fields,
      student: student._id,
      academicSession: sessionLabel || undefined,
      createdBy: user,
    }).toObject();
    accountOps.push({ insertOne: { document: doc } });
    return doc;
  });

  if (accountOps.length) await StudentFeeAccount.bulkWrite(accountOps, { ordered: false });
  const result = await syncDemandsForAccounts(models, accounts, () => structure, sessionLabel);

  return {
    students: students.length,
    accountsCreated: students.length - existingAccounts.length,
    demandsCreated: result.created,
    demandsUpdated: result.updated,
  };
};

/** Record a revision snapshot for a structure. */
const recordRevision = async (models, structure, previousComponents, changeNote, user) => {
  const FeeStructureRevision = getModel(models, 'FeeStructureRevision');
  const plain = typeof structure.toObject === 'function' ? structure.toObject() : structure;
  const diff = diffComponents(previousComponents || [], plain.components || []);
  return FeeStructureRevision.create({
    structureId: plain._id,
    version: plain.version,
    changeNote: changeNote || '',
    changedBy: user,
    snapshot: {
      name: plain.name,
      description: plain.description,
      applicableClasses: plain.applicableClasses,
      components: plain.components,
      installmentPlan: plain.installmentPlan,
      lateFee: plain.lateFee,
      status: plain.status,
    },
    diff,
    academicSession: plain.academicSession || undefined,
  });
};

/**
 * Record a fee payment against an account.
 * payload: { amount, lateFee, mode, reference, date, remarks, cheque, allocations? }
 */
const recordPayment = async (models, account, payload, sessionLabel, user) => {
  const FeeDemand = getModel(models, 'FeeDemand');
  const FeePayment = getModel(models, 'FeePayment');

  const amount = round2(payload.amount);
  const lateFee = round2(payload.lateFee);
  if (amount < 0 || lateFee < 0) throw httpError('Amounts cannot be negative.');
  if (amount + lateFee <= 0) throw httpError('Enter an amount to collect.');

  const openDemands = await FeeDemand.find({ accountId: account._id, status: { $in: ['due', 'partial'] } }).sort({ dueDate: 1 });
  const outstanding = round2(openDemands.reduce((s, d) => s + d.balance, 0));
  if (amount > outstanding) {
    throw httpError(`Amount exceeds outstanding dues (₹${outstanding.toLocaleString('en-IN')}).`);
  }

  const { allocations, unallocated } = allocatePayment(
    openDemands.map((d) => d.toObject()),
    amount,
    Array.isArray(payload.allocations) && payload.allocations.length ? payload.allocations : null
  );
  if (unallocated > 0) throw httpError('Allocation exceeds the open balance of the selected installments.');

  const structure = account.structureId ? await getModel(models, 'FeeStructure').findById(account.structureId).select('lateFee').lean() : null;
  const lateFeeAllocations = lateFee > 0
    ? allocateLateFee(openDemands.map((d) => d.toObject()), structure?.lateFee, lateFee, payload.date ? new Date(payload.date) : new Date())
    : [];

  const settings = await getSettings(models);
  const receiptNo = await nextReceiptNo(models, sessionLabel, settings.receiptPrefix);
  const demandById = new Map(openDemands.map((d) => [String(d._id), d]));
  const total = round2(amount + lateFee);

  const payment = await FeePayment.create({
    receiptNo,
    accountId: account._id,
    student: account.student,
    studentSnapshot: account.studentSnapshot,
    date: payload.date ? new Date(payload.date) : new Date(),
    mode: payload.mode || 'cash',
    reference: payload.reference || '',
    cheque: payload.mode === 'cheque' || payload.mode === 'dd'
      ? { ...(payload.cheque || {}), status: payload.cheque?.status || 'pending' }
      : undefined,
    allocations: allocations.map((a) => ({ ...a, periodLabel: demandById.get(String(a.demandId))?.label || '' })),
    feeAmount: amount,
    lateFeeCollected: lateFee,
    lateFeeAllocations,
    total,
    amountInWords: `RUPEES ${numberToIndianWords(Math.round(total))}`,
    remarks: payload.remarks || '',
    collectedBy: user,
    academicSession: sessionLabel || undefined,
  });

  const touched = new Set();
  allocations.forEach((a) => {
    const demand = demandById.get(String(a.demandId));
    const line = demand?.lines?.[a.lineIndex];
    if (!line) return;
    line.paid = round2((line.paid || 0) + a.amount);
    touched.add(String(a.demandId));
  });
  lateFeeAllocations.forEach((a) => {
    const demand = demandById.get(String(a.demandId));
    if (!demand) return;
    demand.lateFeePaid = round2((demand.lateFeePaid || 0) + a.amount);
    touched.add(String(a.demandId));
  });
  for (const id of touched) {
    const demand = demandById.get(id);
    demand.markModified('lines');
    refreshDemandTotals(demand);
    await demand.save();
  }

  await recomputeAccountTotals(models, account._id);
  return payment;
};

const cancelPayment = async (models, payment, reason, user) => {
  const FeeDemand = getModel(models, 'FeeDemand');
  if (payment.status === 'cancelled') throw httpError('Receipt is already cancelled.');
  if (!String(reason || '').trim()) throw httpError('A reason is required to cancel a receipt.');

  const demandIds = [...new Set([
    ...payment.allocations.map((a) => String(a.demandId)),
    ...(payment.lateFeeAllocations || []).map((a) => String(a.demandId)),
  ])];
  const demands = await FeeDemand.find({ _id: { $in: demandIds } });
  const byId = new Map(demands.map((d) => [String(d._id), d]));

  payment.allocations.forEach((a) => {
    const line = byId.get(String(a.demandId))?.lines?.[a.lineIndex];
    if (line) line.paid = Math.max(0, round2((line.paid || 0) - a.amount));
  });
  (payment.lateFeeAllocations || []).forEach((a) => {
    const demand = byId.get(String(a.demandId));
    if (demand) demand.lateFeePaid = Math.max(0, round2((demand.lateFeePaid || 0) - a.amount));
  });
  for (const demand of demands) {
    demand.markModified('lines');
    refreshDemandTotals(demand);
    await demand.save();
  }

  payment.status = 'cancelled';
  payment.cancellation = { reason: String(reason).trim(), at: new Date(), by: user };
  await payment.save();
  await recomputeAccountTotals(models, payment.accountId);
  return payment;
};

module.exports = {
  OPENING_PERIOD_KEY,
  httpError,
  getModel,
  auditUser,
  sessionShort,
  ensureFeeHeads,
  getSettings,
  nextReceiptNo,
  snapshotStudent,
  refreshDemandTotals,
  recomputeAccountTotals,
  planAccountDemands,
  syncDemandsForAccounts,
  syncAccountDemands,
  assignStructure,
  recordRevision,
  recordPayment,
  cancelPayment,
};
