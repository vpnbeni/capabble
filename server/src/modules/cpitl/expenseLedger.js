/**
 * CapitalExpense is the single expense ledger every overview and budget reads.
 * Source records (fuel logs, paid bills, payroll runs, infra payments) never write
 * to it directly — they go through these helpers so the mapping stays in one place.
 */
const { getModel, httpError } = require('./feeService');
const { DEFAULT_EXPENSE_CATEGORIES } = require('./constants');

// Ledger rows owned by another record; edit/void them from that record. Infra payments
// point at their project but are plain ledger rows, so they stay editable here.
const MANAGED_SOURCES = new Set(['FuelLog', 'ElectricityBill', 'PayrollRun']);

/** Map a source record to ledger fields. Pure — unit-tested. */
const ledgerFieldsFor = (kind, source = {}) => {
  switch (kind) {
    case 'fuel': {
      const v = source.vehicleSnapshot || {};
      return {
        date: source.date,
        amount: source.amount,
        mode: source.mode || 'cash',
        payee: source.station || '',
        reference: source.billNo || '',
        title: `Fuel — ${[v.busNo && `Bus ${v.busNo}`, v.registrationNumber].filter(Boolean).join(' · ') || 'Vehicle'}`,
        notes: `${source.litres || 0} L${source.ratePerLitre ? ` @ ₹${source.ratePerLitre}` : ''}${source.odometer ? ` · odo ${source.odometer}` : ''}`,
        attachments: source.attachments || [],
      };
    }
    case 'electricity': {
      const c = source.connectionSnapshot || {};
      return {
        date: source.paidOn || source.dueDate || new Date(),
        amount: source.amount,
        mode: source.mode || '',
        payee: c.name || '',
        reference: source.reference || source.billNo || '',
        title: `Electricity — ${c.name || 'Connection'} (${source.billMonth})`,
        notes: source.units ? `${source.units} units` : '',
        attachments: source.attachments || [],
      };
    }
    case 'salary': {
      const t = source.totals || {};
      return {
        date: source.paidOn || new Date(),
        amount: Math.round((t.net || 0) + (t.employerPf || 0) + (t.employerEsi || 0)),
        mode: source.paymentMode || 'bank_transfer',
        payee: `${t.staff || 0} staff`,
        reference: source.reference || '',
        title: `Salary — ${source.month}`,
        notes: `Net ₹${Math.round(t.net || 0)} + employer PF ₹${Math.round(t.employerPf || 0)} + ESI ₹${Math.round(t.employerEsi || 0)}`,
        attachments: [],
      };
    }
    default:
      throw new Error(`No ledger mapping for kind "${kind}"`);
  }
};

/** Create or refresh the ledger row for a source record. */
const upsertForSource = async (models, { kind, sourceModel, source, sessionLabel, user }) => {
  const CapitalExpense = getModel(models, 'CapitalExpense');
  const fields = ledgerFieldsFor(kind, source);
  const existing = await CapitalExpense.findOne({ 'sourceRef.id': source._id });
  if (existing) {
    existing.set({ ...fields, status: 'valid', voidReason: '', voidedAt: null, updatedBy: user });
    await existing.save();
    return existing;
  }
  return CapitalExpense.create({
    ...fields,
    kind,
    sourceRef: { model: sourceModel, id: source._id },
    createdBy: user,
    ...(sessionLabel ? { academicSession: sessionLabel } : {}),
  });
};

const voidForSource = async (models, sourceId, reason, user) => {
  const CapitalExpense = getModel(models, 'CapitalExpense');
  await CapitalExpense.updateMany(
    { 'sourceRef.id': sourceId, status: 'valid' },
    { $set: { status: 'void', voidReason: reason || 'Source removed', voidedAt: new Date(), updatedBy: user } }
  );
};

// Upsert by name so concurrent first requests can't seed the defaults twice.
const ensureExpenseCategories = async (models) => {
  const ExpenseCategory = getModel(models, 'ExpenseCategory');
  if (await ExpenseCategory.countDocuments({})) return;
  await ExpenseCategory.bulkWrite(DEFAULT_EXPENSE_CATEGORIES.map((c, i) => ({
    updateOne: {
      filter: { name: c.name, isSystem: true, parentId: null },
      update: { $setOnInsert: { ...c, isSystem: true, parentId: null, sortOrder: i + 1, isActive: true } },
      upsert: true,
    },
  })), { ordered: false });
};

const assertEditableExpense = (expense) => {
  if (!expense) throw httpError('Expense not found.', 404);
  if (expense.status === 'void') throw httpError('This expense is void.', 400);
  if (MANAGED_SOURCES.has(expense.sourceRef?.model)) {
    throw httpError(`This expense is managed from the ${expense.kind} page.`, 400);
  }
};

module.exports = {
  ledgerFieldsFor,
  upsertForSource,
  voidForSource,
  ensureExpenseCategories,
  assertEditableExpense,
};
