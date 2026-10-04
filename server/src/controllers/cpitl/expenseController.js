const asyncHandler = require('../../middleware/asyncHandler');
const { httpError, getModel, auditUser } = require('../../modules/cpitl/feeService');
const { ensureExpenseCategories, assertEditableExpense } = require('../../modules/cpitl/expenseLedger');
const { projectNextYear, sessionMonthsElapsed, monthsCovered } = require('../../modules/cpitl/fuelAnalytics');
const { EXPENSE_KINDS, PAYMENT_MODES } = require('../../modules/cpitl/constants');
const { uploadDocumentToCloudinary } = require('../../config/cloudinary');

const ok = (res, data, extra = {}) => res.json({ success: true, data, ...extra });
const round = (v) => Math.round((Number(v) || 0) * 100) / 100;
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const pick = (body, fields) => fields.reduce((acc, f) => {
  if (body[f] !== undefined) acc[f] = body[f];
  return acc;
}, {});

const dateRange = (from, to) => {
  const range = {};
  if (from) range.$gte = new Date(from);
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }
  return Object.keys(range).length ? range : null;
};

// ── Categories ──────────────────────────────────────────────────────
const CATEGORY_FIELDS = ['name', 'icon', 'color', 'parentId', 'sortOrder'];

const listCategories = asyncHandler(async (req, res) => {
  await ensureExpenseCategories(req.models);
  const ExpenseCategory = getModel(req.models, 'ExpenseCategory');
  const filter = req.query.all === 'true' ? {} : { isActive: { $ne: false } };
  return ok(res, await ExpenseCategory.find(filter).sort({ sortOrder: 1, name: 1 }).lean());
});

const createCategory = asyncHandler(async (req, res) => {
  const ExpenseCategory = getModel(req.models, 'ExpenseCategory');
  const payload = pick(req.body, CATEGORY_FIELDS);
  if (!String(payload.name || '').trim()) throw httpError('Category name is required.');
  if (payload.parentId === '') payload.parentId = null;
  const last = await ExpenseCategory.findOne({}).sort({ sortOrder: -1 }).select('sortOrder').lean();
  const category = await ExpenseCategory.create({ sortOrder: (last?.sortOrder || 0) + 1, ...payload, createdBy: auditUser(req) });
  return res.status(201).json({ success: true, data: category, message: 'Category created.' });
});

const updateCategory = asyncHandler(async (req, res) => {
  const ExpenseCategory = getModel(req.models, 'ExpenseCategory');
  const payload = pick(req.body, [...CATEGORY_FIELDS, 'isActive']);
  if (payload.parentId === '') payload.parentId = null;
  if (payload.parentId && String(payload.parentId) === req.params.id) throw httpError('A category cannot be its own parent.');
  const category = await ExpenseCategory.findByIdAndUpdate(req.params.id, { ...payload, updatedBy: auditUser(req) }, { new: true, runValidators: true });
  if (!category) throw httpError('Category not found.', 404);
  return ok(res, category, { message: 'Category updated.' });
});

const archiveCategory = asyncHandler(async (req, res) => {
  const ExpenseCategory = getModel(req.models, 'ExpenseCategory');
  await ExpenseCategory.updateMany(
    { $or: [{ _id: req.params.id }, { parentId: req.params.id }] },
    { $set: { isActive: false, updatedBy: auditUser(req) } }
  );
  return ok(res, null, { message: 'Category archived. Past expenses keep their category.' });
});

// ── Expenses ────────────────────────────────────────────────────────
const EXPENSE_FIELDS = ['date', 'amount', 'mode', 'payee', 'reference', 'title', 'notes', 'categoryId', 'attachments'];

const validateExpense = (payload, { partial = false } = {}) => {
  if (!partial || payload.amount !== undefined) {
    const amount = Number(payload.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw httpError('Enter an amount greater than zero.');
    payload.amount = round(amount);
  }
  if (!partial || payload.date !== undefined) {
    const date = new Date(payload.date || Date.now());
    if (Number.isNaN(date.getTime())) throw httpError('Invalid date.');
    payload.date = date;
  }
  if (payload.mode && !PAYMENT_MODES.includes(payload.mode)) throw httpError('Invalid payment mode.');
  if (payload.categoryId === '') payload.categoryId = null;
  return payload;
};

const listExpenses = asyncHandler(async (req, res) => {
  const CapitalExpense = getModel(req.models, 'CapitalExpense');
  const { kind, categoryId, from, to, q, status } = req.query;
  const filter = {};
  if (kind) filter.kind = { $in: String(kind).split(',') };
  if (categoryId) {
    const ExpenseCategory = getModel(req.models, 'ExpenseCategory');
    const children = await ExpenseCategory.find({ parentId: categoryId }).select('_id').lean();
    filter.categoryId = { $in: [categoryId, ...children.map((c) => c._id)] };
  }
  filter.status = status === 'all' ? { $in: ['valid', 'void'] } : status || 'valid';
  const range = dateRange(from, to);
  if (range) filter.date = range;
  if (q && String(q).trim()) {
    const rx = { $regex: escapeRegex(String(q).trim()), $options: 'i' };
    filter.$and = [{ $or: [{ title: rx }, { payee: rx }, { notes: rx }, { reference: rx }] }];
  }
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const items = await CapitalExpense.find(filter).sort({ date: -1, createdAt: -1 }).limit(limit).lean();
  const valid = items.filter((e) => e.status === 'valid');
  return ok(res, items, { summary: { count: valid.length, total: round(valid.reduce((s, e) => s + e.amount, 0)) } });
});

/** Direct ledger entries: operating costs (and infra payments via the infra controller). */
const createExpense = asyncHandler(async (req, res) => {
  const CapitalExpense = getModel(req.models, 'CapitalExpense');
  const payload = validateExpense(pick(req.body, EXPENSE_FIELDS));
  if (!payload.categoryId) throw httpError('Pick a category.');
  const expense = await CapitalExpense.create({
    ...payload,
    kind: 'operating',
    createdBy: auditUser(req),
    ...(req.academicSession ? { academicSession: req.academicSession } : {}),
  });
  return res.status(201).json({ success: true, data: expense, message: 'Expense added.' });
});

const updateExpense = asyncHandler(async (req, res) => {
  const CapitalExpense = getModel(req.models, 'CapitalExpense');
  const expense = await CapitalExpense.findById(req.params.id);
  assertEditableExpense(expense);
  expense.set({ ...validateExpense(pick(req.body, EXPENSE_FIELDS), { partial: true }), updatedBy: auditUser(req) });
  await expense.save();
  return ok(res, expense, { message: 'Expense updated.' });
});

const voidExpense = asyncHandler(async (req, res) => {
  const CapitalExpense = getModel(req.models, 'CapitalExpense');
  const expense = await CapitalExpense.findById(req.params.id);
  assertEditableExpense(expense);
  const reason = String(req.body?.reason || '').trim();
  if (!reason) throw httpError('A reason is required to void an expense.');
  expense.set({ status: 'void', voidReason: reason, voidedAt: new Date(), updatedBy: auditUser(req) });
  await expense.save();
  return ok(res, expense, { message: 'Expense voided.' });
});

// ── Summary ─────────────────────────────────────────────────────────
const getSummary = asyncHandler(async (req, res) => {
  const CapitalExpense = getModel(req.models, 'CapitalExpense');
  const FeePayment = getModel(req.models, 'FeePayment');
  const ExpenseCategory = getModel(req.models, 'ExpenseCategory');
  const range = dateRange(req.query.from, req.query.to);
  const match = { status: 'valid', ...(range ? { date: range } : {}) };
  const monthExpr = { $dateToString: { format: '%Y-%m', date: '$date', timezone: 'Asia/Kolkata' } };

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [byKind, byMonthKind, byCategory, income, recent] = await Promise.all([
    CapitalExpense.aggregate([{ $match: match }, { $group: { _id: '$kind', amount: { $sum: '$amount' }, count: { $sum: 1 } } }]),
    CapitalExpense.aggregate([
      { $match: match },
      { $group: { _id: { month: monthExpr, kind: '$kind' }, amount: { $sum: '$amount' } } },
    ]),
    CapitalExpense.aggregate([
      { $match: { ...match, kind: 'operating' } },
      { $group: { _id: '$categoryId', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { amount: -1 } },
    ]),
    FeePayment.aggregate([
      { $match: { status: 'valid', ...(range ? { date: range } : {}) } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$date', timezone: 'Asia/Kolkata' } }, amount: { $sum: '$total' } } },
    ]),
    CapitalExpense.find(match).sort({ date: -1, createdAt: -1 }).limit(8).lean(),
  ]);

  const categories = await ExpenseCategory.find({ _id: { $in: byCategory.map((c) => c._id).filter(Boolean) } }).lean();
  const catById = new Map(categories.map((c) => [String(c._id), c]));

  const months = new Map();
  const ensureMonth = (m) => {
    if (!months.has(m)) months.set(m, { month: m, expense: 0, income: 0, byKind: {} });
    return months.get(m);
  };
  byMonthKind.forEach(({ _id, amount }) => {
    const row = ensureMonth(_id.month);
    row.expense = round(row.expense + amount);
    row.byKind[_id.kind] = round(amount);
  });
  income.forEach(({ _id, amount }) => {
    ensureMonth(_id).income = round(amount);
  });
  const byMonth = [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).map((m) => ({ ...m, net: round(m.income - m.expense) }));

  const totalExpense = round(byKind.reduce((s, k) => s + k.amount, 0));
  const totalIncome = round(income.reduce((s, m) => s + m.amount, 0));
  const monthRow = byMonth.find((m) => m.month === thisMonth);

  return ok(res, {
    totals: { expense: totalExpense, income: totalIncome, net: round(totalIncome - totalExpense), thisMonth: monthRow?.expense || 0 },
    byKind: EXPENSE_KINDS.map((kind) => {
      const row = byKind.find((k) => k._id === kind);
      return { kind, amount: round(row?.amount), count: row?.count || 0 };
    }),
    byMonth,
    byCategory: byCategory.map((c) => {
      const cat = catById.get(String(c._id));
      return { categoryId: c._id, name: cat?.name || 'Uncategorised', icon: cat?.icon || 'shapes', color: cat?.color || '#94a3b8', amount: round(c.amount), count: c.count };
    }),
    recent,
  });
});

// ── Attachments ─────────────────────────────────────────────────────
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/;

const uploadAttachment = asyncHandler(async (req, res) => {
  const file = req.files?.file;
  if (!file || Array.isArray(file)) throw httpError('Attach one file.');
  if (file.size > MAX_UPLOAD_BYTES) throw httpError('File is larger than 10 MB.');
  if (!ALLOWED_TYPES.test(file.mimetype)) throw httpError('Only images or PDF files are allowed.');
  const tenantSlug = req.tenant?.slug || 'tenant';
  const { url } = await uploadDocumentToCloudinary(file.tempFilePath || file.data, `cpitl/${tenantSlug}`, null);
  return res.status(201).json({ success: true, data: { name: file.name, url, mimeType: file.mimetype, size: file.size, uploadedAt: new Date() } });
});

// ── Budgets ─────────────────────────────────────────────────────────
/**
 * Actual spend per budget target for a session (or current context when sessionLabel omitted).
 * Returns Map<key, { amount, firstDate }> — firstDate lets projections annualise over the months
 * a head has actually been recorded, not the whole session.
 */
const actualsByTarget = async (models, sessionLabel) => {
  const CapitalExpense = getModel(models, 'CapitalExpense');
  const sessionMatch = sessionLabel ? { academicSession: sessionLabel } : {};
  const group = (id, dateField = '$date') => ({ $group: { _id: id, amount: { $sum: '$amount' }, firstDate: { $min: dateField } } });
  const [byKind, byCategory] = await Promise.all([
    CapitalExpense.aggregate([{ $match: { ...sessionMatch, status: 'valid' } }, group('$kind')]),
    CapitalExpense.aggregate([{ $match: { ...sessionMatch, status: 'valid', kind: 'operating' } }, group('$categoryId')]),
  ]);
  const map = new Map();
  const put = (key, row) => map.set(key, { amount: round(row.amount), firstDate: row.firstDate || null });
  byKind.forEach((k) => put(`${k._id}:all`, k));
  byCategory.forEach((c) => put(`operating:${c._id}`, c));

  if (models.FuelLog) {
    const fuel = await models.FuelLog.aggregate([{ $match: { ...sessionMatch, isActive: { $ne: false } } }, group('$vehicleId')]);
    fuel.forEach((f) => put(`fuel:${f._id}`, f));
  }
  if (models.ElectricityBill) {
    const bills = await models.ElectricityBill.aggregate([
      { $match: { ...sessionMatch, isActive: { $ne: false } } },
      group('$connectionId', { $dateFromString: { dateString: { $concat: ['$billMonth', '-01'] } } }),
    ]);
    bills.forEach((b) => put(`electricity:${b._id}`, b));
  }
  return map;
};

const budgetTargets = async (models) => {
  await ensureExpenseCategories(models);
  const targets = EXPENSE_KINDS.map((kind) => ({ kind, targetKey: 'all', targetLabel: 'Total', group: kind }));
  const categories = await getModel(models, 'ExpenseCategory').find({ isActive: { $ne: false }, parentId: null }).sort({ sortOrder: 1 }).lean();
  categories.forEach((c) => targets.push({ kind: 'operating', targetKey: String(c._id), targetLabel: c.name, icon: c.icon, color: c.color, group: 'operating' }));

  const vehicles = new Map();
  if (models.TransportVehicle) {
    (await models.TransportVehicle.find({ isActive: { $ne: false } }).select('busNo registrationNumber').lean())
      .forEach((v) => vehicles.set(String(v._id), `Bus ${v.busNo} · ${v.registrationNumber}`));
  }
  if (models.FuelLog) {
    (await models.FuelLog.aggregate([{ $group: { _id: '$vehicleId', snap: { $last: '$vehicleSnapshot' } } }]))
      .forEach((v) => {
        if (v._id && !vehicles.has(String(v._id))) vehicles.set(String(v._id), [v.snap?.busNo && `Bus ${v.snap.busNo}`, v.snap?.registrationNumber].filter(Boolean).join(' · '));
      });
  }
  vehicles.forEach((label, id) => targets.push({ kind: 'fuel', targetKey: id, targetLabel: label, group: 'fuel' }));

  if (models.ElectricityConnection) {
    (await models.ElectricityConnection.find({ isActive: { $ne: false } }).select('name').lean())
      .forEach((c) => targets.push({ kind: 'electricity', targetKey: String(c._id), targetLabel: c.name, group: 'electricity' }));
  }
  return targets;
};

const getBudgets = asyncHandler(async (req, res) => {
  const CapitalBudget = getModel(req.models, 'CapitalBudget');
  const [targets, budgets, actuals] = await Promise.all([
    budgetTargets(req.models),
    CapitalBudget.find({}).lean(),
    actualsByTarget(req.models),
  ]);
  const budgetMap = new Map(budgets.map((b) => [`${b.kind}:${b.targetKey}`, b.amount]));
  const monthsElapsed = sessionMonthsElapsed(req.academicSession);
  const growthPct = Number(req.query.growthPct) || 0;

  return ok(res, targets.map((t) => {
    const key = `${t.kind}:${t.targetKey}`;
    const row = actuals.get(key);
    const actual = row?.amount || 0;
    const budget = budgetMap.get(key) || 0;
    // Infra is lumpy project spend — never extrapolate it; plan it per project instead.
    const months = t.kind === 'infra' ? 12 : row?.firstDate ? Math.min(monthsElapsed, monthsCovered(row.firstDate)) : monthsElapsed;
    const { annualised, projected } = projectNextYear(actual, months, growthPct);
    return {
      ...t,
      budget,
      actual,
      monthsRecorded: actual && t.kind !== 'infra' ? months : 0,
      usedPct: budget > 0 ? round((actual / budget) * 100) : null,
      projectedYearEnd: annualised,
      nextYear: projected,
    };
  }), { meta: { monthsElapsed, growthPct } });
});

const saveBudgets = asyncHandler(async (req, res) => {
  const CapitalBudget = getModel(req.models, 'CapitalBudget');
  const rows = Array.isArray(req.body?.budgets) ? req.body.budgets : [];
  const ops = rows
    .filter((r) => EXPENSE_KINDS.includes(r.kind) && r.targetKey)
    .map((r) => ({
      updateOne: {
        filter: { academicSession: req.academicSession, kind: r.kind, targetKey: String(r.targetKey) },
        update: {
          $set: { amount: Math.max(0, round(r.amount)), targetLabel: r.targetLabel || '', updatedBy: auditUser(req), updatedAt: new Date() },
          $setOnInsert: { createdAt: new Date() },
        },
        upsert: true,
      },
    }));
  if (ops.length) await CapitalBudget.bulkWrite(ops, { ordered: false });
  return ok(res, { saved: ops.length }, { message: 'Budgets saved.' });
});

/** Seed this session's budgets from last session's actuals (+growth), falling back to this session's run-rate. */
const copyBudgetsFromActuals = asyncHandler(async (req, res) => {
  const CapitalBudget = getModel(req.models, 'CapitalBudget');
  const growthPct = Number(req.body?.growthPct) || 0;
  const start = Number(String(req.academicSession || '').slice(0, 4));
  const previous = start ? `${start - 1}-${start}` : null;
  const prevActuals = previous ? await actualsByTarget(req.models, previous) : new Map();
  const useRunRate = !prevActuals.size;
  const source = useRunRate ? await actualsByTarget(req.models) : prevActuals;
  const monthsElapsed = sessionMonthsElapsed(req.academicSession);
  const targets = await budgetTargets(req.models);

  const ops = targets.map((t) => {
    const row = source.get(`${t.kind}:${t.targetKey}`);
    const actual = row?.amount || 0;
    const months = t.kind === 'infra' ? 12 : row?.firstDate ? Math.min(monthsElapsed, monthsCovered(row.firstDate)) : monthsElapsed;
    const base = useRunRate ? projectNextYear(actual, months, 0).annualised : actual;
    return {
      updateOne: {
        filter: { academicSession: req.academicSession, kind: t.kind, targetKey: t.targetKey },
        update: { $set: { amount: Math.round(base * (1 + growthPct / 100)), targetLabel: t.targetLabel, updatedBy: auditUser(req), updatedAt: new Date() } },
        upsert: true,
      },
    };
  }).filter((op) => op.updateOne.update.$set.amount > 0);
  if (ops.length) await CapitalBudget.bulkWrite(ops, { ordered: false });
  return ok(res, { saved: ops.length, basis: useRunRate ? 'current_run_rate' : previous }, {
    message: useRunRate
      ? `No data for ${previous || 'last session'}; budgets set from this session's run-rate +${growthPct}%.`
      : `Budgets set from ${previous} actuals +${growthPct}%.`,
  });
});

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  archiveCategory,
  listExpenses,
  createExpense,
  updateExpense,
  voidExpense,
  getSummary,
  uploadAttachment,
  getBudgets,
  saveBudgets,
  copyBudgetsFromActuals,
  actualsByTarget,
};
