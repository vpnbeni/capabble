const { computePayslip, daysInMonth, attendanceLop, professionalTax, resolveEarnings } = require('../payroll');

const comp = (code, value, calc = 'fixed', type = 'earning') => ({ code, name: code, type, calc, value });

describe('CPITL payroll', () => {
  it('knows days in month', () => {
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2026-10')).toBe(31);
  });

  it('resolves percent-of-basic and percent-of-gross earnings', () => {
    const earnings = resolveEarnings([comp('BASIC', 20000), comp('HRA', 40, 'percent_of_basic'), comp('SPECIAL', 10, 'percent_of_gross')]);
    expect(earnings).toEqual([
      { code: 'BASIC', name: 'BASIC', amount: 20000 },
      { code: 'HRA', name: 'HRA', amount: 8000 },
      { code: 'SPECIAL', name: 'SPECIAL', amount: 2800 },
    ]);
  });

  it('caps PF wage at ₹15,000 and skips ESI above ₹21,000 gross', () => {
    const slip = computePayslip({ components: [comp('BASIC', 30000), comp('HRA', 12000)] }, { daysInMonth: 30 });
    expect(slip.gross).toBe(42000);
    expect(slip.deductions).toEqual([{ code: 'PF', name: 'Provident Fund', amount: 1800 }]);
    expect(slip.employerPf).toBe(1800);
    expect(slip.employerEsi).toBe(0);
    expect(slip.net).toBe(40200);
  });

  it('uses full Basic+DA for PF when the cap is off', () => {
    const slip = computePayslip({ components: [comp('BASIC', 20000), comp('DA', 5000)], options: { pfWageCap: false } }, { daysInMonth: 30 });
    expect(slip.deductions.find((d) => d.code === 'PF').amount).toBe(3000);
  });

  it('applies ESI at exactly the ₹21,000 limit', () => {
    const slip = computePayslip({ components: [comp('BASIC', 12000), comp('HRA', 9000)] }, { daysInMonth: 30 });
    expect(slip.fullGross).toBe(21000);
    expect(slip.deductions.find((d) => d.code === 'ESI').amount).toBe(158); // ceil(157.5)
    expect(slip.employerEsi).toBe(683); // ceil(682.5)
  });

  it('does not apply ESI at ₹21,001', () => {
    const slip = computePayslip({ components: [comp('BASIC', 12000), comp('HRA', 9001)] }, { daysInMonth: 30 });
    expect(slip.deductions.find((d) => d.code === 'ESI')).toBeUndefined();
  });

  it('prorates for loss-of-pay days and adds arrears unprorated', () => {
    const slip = computePayslip(
      { components: [comp('BASIC', 30000)], options: { pf: false, esi: 'off' } },
      { daysInMonth: 30, lopDays: 3, arrears: 1000 }
    );
    expect(slip.paidDays).toBe(27);
    expect(slip.earnings).toEqual([
      { code: 'BASIC', name: 'BASIC', amount: 27000 },
      { code: 'ARREARS', name: 'Arrears', amount: 1000 },
    ]);
    expect(slip.net).toBe(28000);
  });

  it('applies PT slabs, TDS, fixed deductions and other deductions', () => {
    const slabs = [{ min: 0, max: 14999, amount: 0 }, { min: 15000, max: null, amount: 200 }];
    expect(professionalTax(14999, slabs)).toBe(0);
    expect(professionalTax(15000, slabs)).toBe(200);
    const slip = computePayslip(
      { components: [comp('BASIC', 40000), comp('LOAN', 2000, 'fixed', 'deduction')], options: { pf: false, tdsMonthly: 1500 } },
      { daysInMonth: 30, otherDeduction: 300 },
      { ptSlabs: slabs }
    );
    expect(slip.deductions.map((d) => d.code)).toEqual(['PT', 'TDS', 'LOAN', 'OTHER']);
    expect(slip.totalDeductions).toBe(200 + 1500 + 2000 + 300);
    expect(slip.net).toBe(40000 - 4000);
  });

  it('counts LOP from attendance (A = 1, HD = 0.5)', () => {
    expect(attendanceLop([
      { staffId: 's1', status: 'A' },
      { staffId: 's1', status: 'HD' },
      { staffId: 's1', status: 'P' },
      { staffId: 's2', status: 'HD' },
    ])).toEqual({ s1: 1.5, s2: 0.5 });
  });
});
