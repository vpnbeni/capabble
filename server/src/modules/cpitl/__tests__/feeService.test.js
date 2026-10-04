const { planAccountDemands } = require('../feeService');

const structure = {
  components: [
    { feeHead: 'h-tuition', name: 'Tuition', amount: 1000, frequency: 'quarterly' },
  ],
  installmentPlan: { quarterlyMonths: [4, 7, 10, 1], dueDay: 10 },
};
const account = { _id: 'acc1', student: 'stu1', studentSnapshot: { class: '4th', section: 'A' }, concessions: [], optedOptionalHeads: [] };

describe('CPITL planAccountDemands', () => {
  it('creates one insert per installment for a fresh account', () => {
    const plan = planAccountDemands(account, structure, '2026-2027', []);
    expect(plan.created).toBe(4);
    expect(plan.ops.every((op) => op.insertOne)).toBe(true);
    expect(plan.ops[0].insertOne.document).toMatchObject({ periodKey: '2026-04', class: '4th', section: 'A', total: 1000, academicSession: '2026-2027' });
    expect(plan.totals).toMatchObject({ demanded: 4000, balance: 4000, paid: 0 });
  });

  it('keeps paid installments, updates unpaid ones and removes stale unpaid ones', () => {
    const existing = [
      { _id: 'd-apr', periodKey: '2026-04', paid: 1000, total: 1000, balance: 0, gross: 1000, concession: 0, status: 'paid' },
      { _id: 'd-jul', periodKey: '2026-07', paid: 0, total: 900, balance: 900, gross: 900, concession: 0, status: 'due' },
      { _id: 'd-may', periodKey: '2026-05', paid: 0, total: 500, balance: 500, gross: 500, concession: 0, status: 'due' },
    ];
    const plan = planAccountDemands(account, structure, '2026-2027', existing);
    expect(plan.updated).toBe(1);
    expect(plan.created).toBe(2);
    expect(plan.removed).toBe(1);
    expect(plan.ops.find((op) => op.updateOne)?.updateOne.filter._id).toBe('d-jul');
    expect(plan.ops.find((op) => op.deleteMany)?.deleteMany.filter._id.$in).toEqual(['d-may']);
    expect(plan.totals).toMatchObject({ demanded: 4000, paid: 1000, balance: 3000 });
  });

  it('adds an opening-balance installment for arrears', () => {
    const plan = planAccountDemands({ ...account, openingBalance: 2500 }, structure, '2026-2027', []);
    const opening = plan.ops[0].insertOne.document;
    expect(opening.periodKey).toBe('OPENING');
    expect(opening.total).toBe(2500);
    expect(plan.totals.demanded).toBe(6500);
  });
});
