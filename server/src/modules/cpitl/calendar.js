/**
 * Fee due dates on the calendar. A parent sees only their own children's
 * instalments that still have a balance; staff with finance access see one
 * total per day (never a list of families).
 */
const schoolDate = require('../../utils/schoolDate');
const { item, dateFieldRange } = require('../clndr/providers');
const { withEffectiveDueDates, dueDateOf } = require('./dueDates');

const OPEN = { status: { $in: ['due', 'partial'] }, balance: { $gt: 0 } };

const fees = {
  key: 'cpitl.fees',
  layer: 'fees',
  features: ['cpitl_fees'],
  audiences: ['staff', 'parent'],
  list: async ({ models, viewer, rbac, from, to, timeZone, portal, portalSections = [] }) => {
    const { FeeDemand, StudentFeeAccount } = models;
    if (!FeeDemand) return [];
    const dueDate = dateFieldRange(from, to, timeZone);
    // Look a little earlier too: a due date on a holiday may have moved into this range.
    const widened = (range) => ({ ...range, $gte: new Date(range.$gte.getTime() - 120 * 86400000) });
    const inRange = (demand) => {
      const key = schoolDate.dateKey(dueDateOf(demand), timeZone);
      return key >= from && key <= to;
    };

    if (viewer.kind === 'parent') {
      if (portal && !portalSections.includes('fees')) return [];
      if (!StudentFeeAccount || !viewer.children.length) return [];
      const accounts = await StudentFeeAccount.find({ student: { $in: viewer.children.map((c) => c.studentId) } })
        .select('student').lean();
      const childByAccount = new Map(accounts.map((account) => [
        String(account._id), viewer.children.find((c) => c.studentId === String(account.student))
      ]));
      if (!accounts.length) return [];
      const demands = await withEffectiveDueDates(models, await FeeDemand.find({
        ...OPEN, accountId: { $in: accounts.map((a) => a._id) }, dueDate: widened(dueDate)
      }).select('accountId label periodKey dueDate balance').lean());
      return demands.filter((demand) => inRange(demand)).map((demand) => {
        const child = childByAccount.get(String(demand.accountId));
        return item({
          id: `fee:${demand._id}`,
          title: `Fee due: ${demand.label || demand.periodKey}`,
          startDate: schoolDate.dateKey(dueDateOf(demand), timeZone),
          detail: [
            `Balance ₹${Number(demand.balance || 0).toLocaleString('en-IN')}`,
            demand.dueDateMovedFrom ? `moved from ${demand.dueDateMovedFrom} (school holiday)` : ''
          ].filter(Boolean).join(', '),
          link: '/portal/fees',
          child: child ? { studentId: child.studentId, name: child.name } : null
        });
      });
    }

    if (viewer.kind !== 'staff' || !rbac?.has('cpitl.finance.view')) return [];
    const demands = await withEffectiveDueDates(models, await FeeDemand.find({ ...OPEN, dueDate: widened(dueDate) })
      .select('dueDate balance').lean());
    const byDay = new Map();
    demands.filter((demand) => inRange(demand)).forEach((demand) => {
      const day = schoolDate.dateKey(dueDateOf(demand), timeZone);
      const entry = byDay.get(day) || { count: 0, balance: 0 };
      entry.count += 1;
      entry.balance += Number(demand.balance || 0);
      byDay.set(day, entry);
    });
    return [...byDay.entries()].map(([day, { count, balance }]) => item({
      id: `fees:${day}`,
      title: `${count} fee instalment${count === 1 ? '' : 's'} due`,
      startDate: day,
      detail: `₹${Math.round(balance).toLocaleString('en-IN')} outstanding`,
      link: '/cpitl/collection'
    }));
  }
};

module.exports = [fees];
