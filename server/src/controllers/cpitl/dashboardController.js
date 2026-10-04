const asyncHandler = require('../../middleware/asyncHandler');
const { getModel } = require('../../modules/cpitl/feeService');
const { round2 } = require('../../modules/cpitl/feeSchedule');

const sortClassValue = (value) => {
  const numeric = parseInt(String(value || '').replace(/\D/g, ''), 10);
  return Number.isNaN(numeric) ? Number.MAX_SAFE_INTEGER : numeric;
};

const sumFields = {
  expected: { $sum: '$total' },
  gross: { $sum: '$gross' },
  concession: { $sum: '$concession' },
  collected: { $sum: '$paid' },
  pending: { $sum: '$balance' },
};

const roundAll = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === 'number' ? round2(v) : v]));

const getDashboard = asyncHandler(async (req, res) => {
  const FeeDemand = getModel(req.models, 'FeeDemand');
  const FeePayment = getModel(req.models, 'FeePayment');
  const StudentFeeAccount = getModel(req.models, 'StudentFeeAccount');
  const Student = getModel(req.models, 'Student');

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const overdueExpr = { $cond: [{ $lt: ['$dueDate', now] }, '$balance', 0] };
  const dueSoFarExpr = { $cond: [{ $lte: ['$dueDate', now] }, '$total', 0] };

  const [totalsRow, classRows, paymentTotals, byMonth, byMode, defaulterRows, accountCount, studentCount] = await Promise.all([
    FeeDemand.aggregate([
      { $match: { status: { $ne: 'waived' } } },
      { $group: { _id: null, ...sumFields, overdue: { $sum: overdueExpr }, dueSoFar: { $sum: dueSoFarExpr } } },
    ]),
    FeeDemand.aggregate([
      { $match: { status: { $ne: 'waived' } } },
      {
        $group: {
          _id: { class: '$class', section: '$section' },
          ...sumFields,
          overdue: { $sum: overdueExpr },
          dueSoFar: { $sum: dueSoFarExpr },
          students: { $addToSet: '$accountId' },
          defaulters: { $addToSet: { $cond: [{ $and: [{ $lt: ['$dueDate', now] }, { $gt: ['$balance', 0] }] }, '$accountId', '$$REMOVE'] } },
        },
      },
    ]),
    FeePayment.aggregate([
      { $match: { status: 'valid' } },
      {
        $group: {
          _id: null,
          total: { $sum: '$total' },
          lateFee: { $sum: '$lateFeeCollected' },
          count: { $sum: 1 },
          today: { $sum: { $cond: [{ $gte: ['$date', startOfToday] }, '$total', 0] } },
          todayCount: { $sum: { $cond: [{ $gte: ['$date', startOfToday] }, 1, 0] } },
        },
      },
    ]),
    FeePayment.aggregate([
      { $match: { status: 'valid' } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$date', timezone: 'Asia/Kolkata' } }, amount: { $sum: '$total' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    FeePayment.aggregate([
      { $match: { status: 'valid' } },
      { $group: { _id: '$mode', amount: { $sum: '$total' }, count: { $sum: 1 } } },
      { $sort: { amount: -1 } },
    ]),
    FeeDemand.aggregate([
      { $match: { status: { $in: ['due', 'partial'] }, dueDate: { $lt: now }, balance: { $gt: 0 } } },
      { $group: { _id: '$accountId', overdue: { $sum: '$balance' }, installments: { $sum: 1 }, oldestDue: { $min: '$dueDate' } } },
      { $sort: { overdue: -1 } },
      { $limit: 15 },
    ]),
    StudentFeeAccount.countDocuments({ structureId: { $ne: null } }),
    Student.countDocuments({ isActive: { $ne: false } }),
  ]);

  const accounts = await StudentFeeAccount.find({ _id: { $in: defaulterRows.map((d) => d._id) } })
    .select('student studentSnapshot')
    .lean();
  const accountById = new Map(accounts.map((a) => [String(a._id), a]));

  const classMap = new Map();
  classRows.forEach((row) => {
    const cls = row._id?.class || '—';
    const section = row._id?.section || '';
    const sectionRow = roundAll({
      section,
      expected: row.expected,
      concession: row.concession,
      collected: row.collected,
      pending: row.pending,
      overdue: row.overdue,
      dueSoFar: row.dueSoFar,
      students: row.students.length,
      defaulters: row.defaulters.length,
    });
    if (!classMap.has(cls)) {
      classMap.set(cls, { class: cls, expected: 0, concession: 0, collected: 0, pending: 0, overdue: 0, dueSoFar: 0, students: 0, defaulters: 0, sections: [] });
    }
    const entry = classMap.get(cls);
    ['expected', 'concession', 'collected', 'pending', 'overdue', 'dueSoFar', 'students', 'defaulters'].forEach((k) => { entry[k] += sectionRow[k]; });
    entry.sections.push(sectionRow);
  });
  const byClass = [...classMap.values()]
    .map((entry) => ({
      ...roundAll(entry),
      collectionRate: entry.expected > 0 ? round2((entry.collected / entry.expected) * 100) : 0,
      sections: entry.sections.sort((a, b) => a.section.localeCompare(b.section)),
    }))
    .sort((a, b) => sortClassValue(a.class) - sortClassValue(b.class) || a.class.localeCompare(b.class));

  const totals = roundAll(totalsRow[0] || { expected: 0, gross: 0, concession: 0, collected: 0, pending: 0, overdue: 0, dueSoFar: 0 });
  delete totals._id;
  const payments = roundAll(paymentTotals[0] || { total: 0, lateFee: 0, count: 0, today: 0, todayCount: 0 });
  delete payments._id;

  return res.json({
    success: true,
    data: {
      totals: {
        ...totals,
        collectionRate: totals.expected > 0 ? round2((totals.collected / totals.expected) * 100) : 0,
        dueSoFarRate: totals.dueSoFar > 0 ? round2(Math.min(100, (totals.collected / totals.dueSoFar) * 100)) : 0,
      },
      payments,
      coverage: { studentsWithStructure: accountCount, activeStudents: studentCount },
      byClass,
      byMonth: byMonth.map((m) => ({ month: m._id, amount: round2(m.amount), count: m.count })),
      byMode: byMode.map((m) => ({ mode: m._id, amount: round2(m.amount), count: m.count })),
      defaulters: defaulterRows.map((row) => {
        const account = accountById.get(String(row._id));
        return {
          accountId: row._id,
          studentId: account?.student || null,
          ...(account?.studentSnapshot || {}),
          overdue: round2(row.overdue),
          installments: row.installments,
          oldestDue: row.oldestDue,
        };
      }),
    },
  });
});

module.exports = { getDashboard };
