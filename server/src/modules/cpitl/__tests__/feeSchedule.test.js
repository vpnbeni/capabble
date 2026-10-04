const {
  monthsForFrequency,
  computeConcession,
  buildDemandSchedule,
  annualTotal,
  computeLateFee,
  allocatePayment,
  demandStatus,
  diffComponents,
  parseSessionStartYear,
} = require('../feeSchedule');
const { roleHasPermission, CPITL_PERMISSIONS } = require('../constants');

const TUITION = 'h-tuition';
const ANNUAL = 'h-annual';
const TRANSPORT = 'h-transport';
const LAB = 'h-lab';

const components = [
  { feeHead: TUITION, name: 'Tuition Fee', amount: 2000, frequency: 'monthly' },
  { feeHead: ANNUAL, name: 'Annual Charges', amount: 6000, frequency: 'annual' },
  { feeHead: LAB, name: 'Lab Fee', amount: 900, frequency: 'quarterly' },
  { feeHead: TRANSPORT, name: 'Transport', amount: 1500, frequency: 'monthly', isOptional: true },
];

describe('CPITL fee schedule', () => {
  it('parses the session start year', () => {
    expect(parseSessionStartYear('2025-2026')).toBe(2025);
  });

  it('maps frequencies to session months', () => {
    expect(monthsForFrequency('monthly')).toHaveLength(12);
    expect(monthsForFrequency('quarterly')).toEqual([4, 7, 10, 1]);
    expect(monthsForFrequency('half_yearly')).toEqual([4, 10]);
    expect(monthsForFrequency('annual')).toEqual([4]);
    expect(monthsForFrequency('one_time', { oneTimeMonth: 6 })).toEqual([6]);
  });

  it('builds one demand per month, combining heads, in due order', () => {
    const schedule = buildDemandSchedule({ components, sessionLabel: '2025-2026' });
    expect(schedule).toHaveLength(12);
    expect(schedule[0].periodKey).toBe('2025-04');
    expect(schedule[0].label).toBe('Apr 2025');
    // April: tuition + annual + lab
    expect(schedule[0].total).toBe(2000 + 6000 + 900);
    // January falls in the second calendar year
    const jan = schedule.find((d) => d.periodKey === '2026-01');
    expect(jan.total).toBe(2000 + 900);
    expect(jan.dueDate.toISOString().slice(0, 10)).toBe('2026-01-10');
    expect(schedule[schedule.length - 1].periodKey).toBe('2026-03');
  });

  it('includes optional heads only when opted', () => {
    const without = buildDemandSchedule({ components, sessionLabel: '2025-2026' });
    const withTransport = buildDemandSchedule({ components, sessionLabel: '2025-2026', optedOptionalHeads: [TRANSPORT] });
    const sum = (s) => s.reduce((t, d) => t + d.total, 0);
    expect(sum(withTransport) - sum(without)).toBe(1500 * 12);
  });

  it('computes the annual total', () => {
    expect(annualTotal(components)).toBe(2000 * 12 + 6000 + 900 * 4);
    expect(annualTotal(components, undefined, { includeOptional: true })).toBe(2000 * 12 + 6000 + 900 * 4 + 1500 * 12);
  });

  it('applies head-specific and global concessions, capped at gross', () => {
    expect(computeConcession(2000, TUITION, [{ feeHead: TUITION, type: 'percent', value: 10 }])).toBe(200);
    expect(computeConcession(6000, ANNUAL, [{ feeHead: TUITION, type: 'percent', value: 10 }])).toBe(0);
    expect(computeConcession(2000, TUITION, [{ feeHead: null, type: 'flat', value: 500 }])).toBe(500);
    expect(computeConcession(2000, TUITION, [{ type: 'percent', value: 100 }, { type: 'flat', value: 300 }])).toBe(2000);

    const schedule = buildDemandSchedule({
      components,
      sessionLabel: '2025-2026',
      concessions: [{ feeHead: TUITION, type: 'percent', value: 50 }],
    });
    expect(schedule[0].concession).toBe(1000);
    expect(schedule[0].total).toBe(1000 + 6000 + 900);
  });

  it('computes late fees after the grace period', () => {
    const demand = { dueDate: new Date('2025-04-10T00:00:00Z'), balance: 500 };
    const asOf = new Date('2025-04-20T00:00:00Z');
    expect(computeLateFee(demand, { type: 'flat', amount: 100, graceDays: 5 }, asOf)).toBe(100);
    expect(computeLateFee(demand, { type: 'flat', amount: 100, graceDays: 15 }, asOf)).toBe(0);
    expect(computeLateFee(demand, { type: 'per_day', amount: 10, graceDays: 0 }, asOf)).toBe(100);
    expect(computeLateFee(demand, { type: 'per_day', amount: 10, graceDays: 0, cap: 50 }, asOf)).toBe(50);
    expect(computeLateFee({ ...demand, balance: 0 }, { type: 'flat', amount: 100 }, asOf)).toBe(0);
    expect(computeLateFee(demand, { type: 'none', amount: 100 }, asOf)).toBe(0);
  });

  it('allocates payments oldest-first, line by line', () => {
    const demands = [
      { _id: 'd2', dueDate: '2025-05-10', lines: [{ feeHead: TUITION, name: 'Tuition', net: 2000, paid: 0 }] },
      { _id: 'd1', dueDate: '2025-04-10', lines: [{ feeHead: TUITION, name: 'Tuition', net: 2000, paid: 1500 }, { feeHead: ANNUAL, name: 'Annual', net: 6000, paid: 0 }] },
    ];
    const { allocations, unallocated } = allocatePayment(demands, 7000);
    expect(unallocated).toBe(0);
    expect(allocations).toEqual([
      { demandId: 'd1', lineIndex: 0, feeHead: TUITION, name: 'Tuition', amount: 500 },
      { demandId: 'd1', lineIndex: 1, feeHead: ANNUAL, name: 'Annual', amount: 6000 },
      { demandId: 'd2', lineIndex: 0, feeHead: TUITION, name: 'Tuition', amount: 500 },
    ]);
  });

  it('reports unallocated money when paying more than dues', () => {
    const demands = [{ _id: 'd1', dueDate: '2025-04-10', lines: [{ feeHead: TUITION, net: 1000, paid: 0 }] }];
    expect(allocatePayment(demands, 1200).unallocated).toBe(200);
  });

  it('supports manual allocation to a chosen installment', () => {
    const demands = [
      { _id: 'd1', dueDate: '2025-04-10', lines: [{ feeHead: TUITION, net: 1000, paid: 0 }] },
      { _id: 'd2', dueDate: '2025-05-10', lines: [{ feeHead: TUITION, net: 1000, paid: 0 }] },
    ];
    const { allocations, unallocated } = allocatePayment(demands, 1000, [{ demandId: 'd2', amount: 1000 }]);
    expect(unallocated).toBe(0);
    expect(allocations).toHaveLength(1);
    expect(allocations[0].demandId).toBe('d2');
  });

  it('derives demand status', () => {
    expect(demandStatus(1000, 0)).toBe('due');
    expect(demandStatus(1000, 400)).toBe('partial');
    expect(demandStatus(1000, 1000)).toBe('paid');
    expect(demandStatus(0, 0)).toBe('paid');
  });

  it('diffs structure components for revision history', () => {
    const before = [
      { feeHead: TUITION, name: 'Tuition', amount: 2000, frequency: 'monthly' },
      { feeHead: LAB, name: 'Lab', amount: 900, frequency: 'quarterly' },
    ];
    const after = [
      { feeHead: TUITION, name: 'Tuition', amount: 2200, frequency: 'monthly' },
      { feeHead: ANNUAL, name: 'Annual', amount: 6000, frequency: 'annual' },
    ];
    const diff = diffComponents(before, after);
    expect(diff.added.map((c) => c.feeHead)).toEqual([ANNUAL]);
    expect(diff.removed.map((c) => c.feeHead)).toEqual([LAB]);
    expect(diff.changed).toEqual([{ feeHead: TUITION, name: 'Tuition', changes: [{ field: 'amount', from: 2000, to: 2200 }] }]);
    expect(diffComponents(before, before).isEmpty).toBe(true);
  });

  it('limits operators to viewing and collecting', () => {
    expect(roleHasPermission('data_entry_operator', CPITL_PERMISSIONS.COLLECT)).toBe(true);
    expect(roleHasPermission('data_entry_operator', CPITL_PERMISSIONS.MANAGE_STRUCTURES)).toBe(false);
    expect(roleHasPermission('data_entry_operator', CPITL_PERMISSIONS.CANCEL_RECEIPT)).toBe(false);
    expect(roleHasPermission('admin', CPITL_PERMISSIONS.CANCEL_RECEIPT)).toBe(true);
  });
});

describe('CPITL late fee allocation', () => {
  const { allocateLateFee, outstandingLateFee } = require('../feeSchedule');
  const rule = { type: 'flat', amount: 100, graceDays: 0 };
  const asOf = new Date('2026-10-04T00:00:00Z');
  const demands = [
    { _id: 'may', dueDate: '2026-05-10', balance: 900, lateFeePaid: 0 },
    { _id: 'apr', dueDate: '2026-04-10', balance: 8900, lateFeePaid: 0 },
    { _id: 'oct', dueDate: '2026-10-10', balance: 2900, lateFeePaid: 0 },
  ];

  it('nets late fee already collected', () => {
    expect(outstandingLateFee({ ...demands[0], lateFeePaid: 100 }, rule, asOf)).toBe(0);
    expect(outstandingLateFee(demands[0], rule, asOf)).toBe(100);
  });

  it('spreads collected late fee across overdue installments, oldest first', () => {
    expect(allocateLateFee(demands, rule, 150, asOf)).toEqual([
      { demandId: 'apr', amount: 100 },
      { demandId: 'may', amount: 50 },
    ]);
  });

  it('puts any extra manual fine on the oldest installment', () => {
    expect(allocateLateFee(demands, rule, 250, asOf)).toEqual([
      { demandId: 'apr', amount: 150 },
      { demandId: 'may', amount: 100 },
    ]);
  });
});
