const { reviseComponents, resolveEarnings, computePayslip } = require('../payroll');

const comp = (code, value, calc = 'fixed', type = 'earning') => ({ code, name: code, type, calc, value });
const gross = (components) => resolveEarnings(components).reduce((s, e) => s + e.amount, 0);
const byCode = (components, code) => components.find((c) => c.code === code);

describe('CPITL bulk salary revision', () => {
  const structure = [
    comp('BASIC', 20000),
    comp('HRA', 40, 'percent_of_basic'),
    comp('CONV', 1600),
    comp('LOAN', 500, 'fixed', 'deduction'),
  ];

  it('scales fixed earnings by the percentage and lands exactly on the target gross', () => {
    const before = gross(structure); // 20000 + 8000 + 1600
    expect(before).toBe(29600);
    const out = reviseComponents(structure, { mode: 'percent', value: 10 });
    expect(out.beforeGross).toBe(29600);
    expect(out.afterGross).toBe(32560);
    expect(gross(out.components)).toBe(32560);
    expect(byCode(out.components, 'BASIC').value).toBe(22000);
    // % of Basic is left as a percentage and follows Basic.
    expect(byCode(out.components, 'HRA')).toMatchObject({ calc: 'percent_of_basic', value: 40 });
  });

  it('applies a ₹ change to the gross, keeping the salary mix', () => {
    const out = reviseComponents(structure, { mode: 'amount', value: 1000 });
    expect(out.afterGross).toBe(30600);
    // Basic gets its proportional share (≈ 20000 × 30600 / 29600), not the whole ₹1,000.
    expect(byCode(out.components, 'BASIC').value).toBeGreaterThan(20000);
    expect(byCode(out.components, 'BASIC').value).toBeLessThan(21000);
  });

  it('closes per-line rounding gaps on the largest non-Basic fixed earning', () => {
    const s = [comp('BASIC', 12345), comp('DA', 3333), comp('SPECIAL', 777)];
    const out = reviseComponents(s, { mode: 'percent', value: 7.3 });
    expect(out.afterGross).toBe(Math.round(gross(s) * 1.073));
  });

  it('reaches the target with only Basic and % lines (amplified adjustments)', () => {
    const s = [comp('BASIC', 15001), comp('HRA', 50, 'percent_of_basic'), comp('DA', 60, 'percent_of_basic'), comp('SPL', 5, 'percent_of_gross')];
    const out = reviseComponents(s, { mode: 'amount', value: 999 });
    expect(Math.abs(out.afterGross - (gross(s) + 999))).toBeLessThanOrEqual(3);
  });

  it('handles decreases', () => {
    const out = reviseComponents(structure, { mode: 'percent', value: -10 });
    expect(out.afterGross).toBe(26640);
    const cut = reviseComponents(structure, { mode: 'amount', value: -600 });
    expect(cut.afterGross).toBe(29000);
  });

  it('keeps deductions and does not mutate the input', () => {
    const copy = JSON.parse(JSON.stringify(structure));
    const out = reviseComponents(structure, { mode: 'percent', value: 5 });
    expect(structure).toEqual(copy);
    expect(byCode(out.components, 'LOAN')).toEqual(comp('LOAN', 500, 'fixed', 'deduction'));
  });

  it('net follows through the normal payslip calculation (PF, ESI, deductions)', () => {
    const options = { pf: true, pfWageCap: true, esi: 'auto', tdsMonthly: 0 };
    const before = computePayslip({ components: structure, options }, { daysInMonth: 30 });
    const after = computePayslip({ components: reviseComponents(structure, { mode: 'percent', value: 10 }).components, options }, { daysInMonth: 30 });
    expect(after.gross).toBe(32560);
    expect(after.deductions.find((d) => d.code === 'LOAN').amount).toBe(500);
    expect(after.net).toBeGreaterThan(before.net);
  });

  it('rejects bad input', () => {
    expect(() => reviseComponents(structure, { mode: 'bonus', value: 5 })).toThrow();
    expect(() => reviseComponents(structure, { mode: 'percent', value: 0 })).toThrow('other than zero');
    expect(() => reviseComponents(structure, { mode: 'percent', value: NaN })).toThrow();
    expect(() => reviseComponents([comp('HRA', 40, 'percent_of_basic')], { mode: 'percent', value: 5 })).toThrow('Current gross is zero');
    expect(() => reviseComponents(structure, { mode: 'amount', value: -29600 })).toThrow('zero or less');
  });
});
