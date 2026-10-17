const { applyBps, allocate, rupees } = require('../src/domain/money');
const { priceModule, prorationFactor, buildLines, couponIsUsable } = require('../src/domain/pricing');
const { applyGst, placeOfSupply, isValidGstin } = require('../src/domain/gst');
const { financialYearOf, formatNumber } = require('../src/domain/numbering');
const sm = require('../src/domain/stateMachine');

const HSN = '998314';
const attnd = { code: 'attnd', name: 'Attendance', price: { basePaise: 150000, includedStudents: 500, perStudentPaise: 300 } };
const appnt = { code: 'appnt', name: 'Appointments', price: { basePaise: 100000, includedStudents: 500, perStudentPaise: 200 } };

describe('money', () => {
  test('applyBps rounds half up in integer paise', () => {
    expect(applyBps(1000, 1800)).toBe(180);
    expect(applyBps(5, 900)).toBe(0); // 0.45 -> 0
    expect(applyBps(6, 900)).toBe(1); // 0.54 -> 1
    expect(applyBps(50, 900)).toBe(5); // 4.5 -> 5
  });
  test('allocate always sums to the total', () => {
    const parts = allocate(1000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b)).toBe(1000);
    expect(parts).toEqual([334, 333, 333]);
  });
  test('rejects fractional paise', () => {
    expect(() => applyBps(10.5, 100)).toThrow(/integer/);
  });
  test('rupees formats Indian grouping', () => {
    expect(rupees(12345678)).toBe('₹1,23,456.78');
  });
});

describe('pricing: module × student band', () => {
  test('base covers up to the included students', () => {
    expect(priceModule(attnd.price, 500).amountPaise).toBe(150000);
    expect(priceModule(attnd.price, 120).amountPaise).toBe(150000);
  });
  test('each student above the band pays the per-student rate', () => {
    const p = priceModule(attnd.price, 750);
    expect(p.extraStudents).toBe(250);
    expect(p.overagePaise).toBe(75000);
    expect(p.amountPaise).toBe(225000);
  });

  test('lines: base and overage per module, no discount', () => {
    const lines = buildLines({ modules: [attnd], students: 600, hsnSac: HSN });
    expect(lines.map((l) => [l.kind, l.quantity, l.unitPaise, l.amountPaise])).toEqual([
      ['module', 1, 150000, 150000],
      ['overage', 100, 300, 30000],
    ]);
    expect(lines.every((l) => l.taxablePaise === l.amountPaise)).toBe(true);
  });

  test('bundle discount applies only to bundle modules', () => {
    const lines = buildLines({
      modules: [attnd, appnt],
      students: 500,
      bundle: { code: 'ops', discountBps: 1000, moduleCodes: ['attnd'] },
      hsnSac: HSN,
    });
    const byCode = Object.fromEntries(lines.map((l) => [l.moduleCode, l]));
    expect(byCode.attnd.discountPaise).toBe(15000);
    expect(byCode.appnt.discountPaise).toBe(0);
  });

  test('percent coupon stacks after the bundle discount', () => {
    const lines = buildLines({
      modules: [attnd],
      students: 500,
      bundle: { code: 'ops', discountBps: 1000, moduleCodes: ['attnd'] },
      coupon: { code: 'WELCOME10', percentBps: 1000 },
      hsnSac: HSN,
    });
    // 150000 - 15000 = 135000; 10% of that = 13500
    expect(lines[0].discountPaise).toBe(28500);
    expect(lines[0].taxablePaise).toBe(121500);
  });

  test('fixed coupon is split across eligible lines and capped', () => {
    const lines = buildLines({ modules: [attnd, appnt], students: 500, coupon: { code: 'FLAT', fixedPaise: 50000 }, hsnSac: HSN });
    expect(lines.reduce((a, l) => a + l.discountPaise, 0)).toBe(50000);
    const capped = buildLines({ modules: [appnt], students: 0, coupon: { code: 'BIG', fixedPaise: 999999 }, hsnSac: HSN });
    expect(capped[0].taxablePaise).toBe(0);
  });

  test('coupon limited to a module ignores other modules', () => {
    const lines = buildLines({ modules: [attnd, appnt], students: 500, coupon: { code: 'APPT', percentBps: 5000, moduleCodes: ['appnt'] }, hsnSac: HSN });
    const byCode = Object.fromEntries(lines.map((l) => [l.moduleCode, l]));
    expect(byCode.appnt.discountPaise).toBe(50000);
    expect(byCode.attnd.discountPaise).toBe(0);
  });

  test('add-ons are lines of their own', () => {
    const lines = buildLines({ modules: [], addons: [{ code: 'sms', name: 'SMS pack', amountPaise: 20000, quantity: 3, cycle: 'month' }], hsnSac: HSN });
    expect(lines[0]).toMatchObject({ kind: 'addon', quantity: 3, unitPaise: 20000, amountPaise: 60000 });
  });

  test('proration charges the remaining days only', () => {
    const start = new Date('2026-04-01T00:00:00Z');
    const end = new Date('2026-05-01T00:00:00Z');
    const factor = prorationFactor(new Date('2026-04-16T00:00:00Z'), start, end);
    expect(factor).toEqual({ remainingDays: 15, totalDays: 30 });
    const lines = buildLines({ modules: [attnd], students: 500, proration: factor, hsnSac: HSN });
    expect(lines[0]).toMatchObject({ kind: 'proration', amountPaise: 75000 });
  });

  test('coupon usability: expiry, once, repeating', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    expect(couponIsUsable({ duration: 'once', expiresAt: '2026-05-01T00:00:00Z' }, { now })).toBe(false);
    expect(couponIsUsable({ duration: 'once' }, { now, cyclesUsed: 1 })).toBe(false);
    expect(couponIsUsable({ duration: 'repeating', durationCycles: 3 }, { now, cyclesUsed: 2 })).toBe(true);
    expect(couponIsUsable({ duration: 'repeating', durationCycles: 3 }, { now, cyclesUsed: 3 })).toBe(false);
    expect(couponIsUsable({ duration: 'forever', maxRedemptions: 1, redeemedCount: 1 }, { now })).toBe(false);
  });
});

describe('GST', () => {
  const lines = [
    { amountPaise: 150000, discountPaise: 0, taxablePaise: 150000 },
    { amountPaise: 30001, discountPaise: 0, taxablePaise: 30001 },
  ];

  test('same state: CGST 9% + SGST 9%', () => {
    const { totals, intraState } = applyGst(lines, { supplierStateCode: '07', placeOfSupply: '07' });
    expect(intraState).toBe(true);
    expect(totals.igstPaise).toBe(0);
    expect(totals.cgstPaise).toBe(13500 + 2700); // 2700.09 -> 2700
    expect(totals.sgstPaise).toBe(totals.cgstPaise);
    expect(totals.totalPaise).toBe(180001 + 2 * 16200);
  });

  test('different state: IGST 18%', () => {
    const { totals, intraState } = applyGst(lines, { supplierStateCode: '07', placeOfSupply: '27' });
    expect(intraState).toBe(false);
    expect(totals.cgstPaise + totals.sgstPaise).toBe(0);
    expect(totals.igstPaise).toBe(27000 + 5400);
    expect(totals.totalPaise).toBe(totals.taxablePaise + totals.igstPaise);
  });

  test('totals equal the sum of lines', () => {
    const { lines: taxed, totals } = applyGst(lines, { supplierStateCode: '07', placeOfSupply: '07' });
    expect(taxed.reduce((a, l) => a + l.cgstPaise, 0)).toBe(totals.cgstPaise);
  });

  test('place of supply: GSTIN state, then address state, then supplier', () => {
    expect(placeOfSupply({ buyerGstin: '27AAPFU0939F1ZV', buyerStateCode: '07', supplierStateCode: '07' })).toBe('27');
    expect(placeOfSupply({ buyerGstin: '', buyerStateCode: '29', supplierStateCode: '07' })).toBe('29');
    expect(placeOfSupply({ supplierStateCode: '07' })).toBe('07');
  });

  test('GSTIN validation', () => {
    expect(isValidGstin('27AAPFU0939F1ZV')).toBe(true);
    expect(isValidGstin('99AAPFU0939F1ZV')).toBe(false);
    expect(isValidGstin('27AAPFU0939F1Z')).toBe(false);
  });
});

describe('numbering', () => {
  test('financial year turns over on 1 April IST', () => {
    expect(financialYearOf(new Date('2027-03-31T18:29:59Z'), 'Asia/Kolkata')).toBe('2026-27'); // 23:59:59 IST
    expect(financialYearOf(new Date('2027-03-31T18:30:00Z'), 'Asia/Kolkata')).toBe('2027-28'); // 00:00 IST 1 Apr
    expect(financialYearOf(new Date('2026-10-17T10:00:00Z'), 'Asia/Kolkata')).toBe('2026-27');
  });
  test('number format fits the 16-character GST limit', () => {
    const n = formatNumber('INV', '2026-27', 123);
    expect(n).toBe('CB2627-000123');
    expect(n.length).toBeLessThanOrEqual(16);
    expect(formatNumber('CN', '2099-00', 1)).toBe('CN9900-000001');
  });
});

describe('subscription state machine', () => {
  const now = new Date('2026-10-17T00:00:00Z');
  const past = (days) => sm.addDays(now, -days);
  const future = (days) => sm.addDays(now, days);

  test('trial ending unpaid moves to grace', () => {
    const r = sm.advance({ state: 'trialing', trialEndsAt: past(1) }, now);
    expect(r.state).toBe('past_due_grace');
    expect(r.changes.graceEndsAt).toEqual(sm.addDays(past(1), 7));
  });

  test('long-unpaid trial ends up read-only in one pass', () => {
    const r = sm.advance({ state: 'trialing', trialEndsAt: past(30) }, now);
    expect(r.state).toBe('suspended_read_only');
    expect(r.reasons).toEqual(['trial_ended_unpaid', 'grace_ended']);
  });

  test('active past period end moves to grace; canceled-at-period-end cancels', () => {
    expect(sm.advance({ state: 'active', currentPeriodEnd: past(1) }, now).state).toBe('past_due_grace');
    expect(sm.advance({ state: 'active', currentPeriodEnd: past(1), cancelAtPeriodEnd: true }, now).state).toBe('canceled');
    expect(sm.advance({ state: 'active', currentPeriodEnd: future(1) }, now).reasons).toEqual([]);
  });

  test('grandfathered expires into grace', () => {
    expect(sm.advance({ state: 'grandfathered', grandfatherEndsAt: past(1) }, now).state).toBe('past_due_grace');
  });

  test('legacy trialing_core is renamed', () => {
    const r = sm.advance({ state: 'trialing_core', trialEndsAt: future(3) }, now);
    expect(r.changes).toEqual({ state: 'trialing' });
  });

  test('access modes', () => {
    expect(sm.accessModeFor('trialing')).toBe('full');
    expect(sm.accessModeFor('trialing_core')).toBe('full');
    expect(sm.accessModeFor('past_due_grace')).toBe('full');
    expect(sm.accessModeFor('suspended_read_only')).toBe('read_only');
    expect(sm.accessModeFor('canceled')).toBe('read_only');
  });

  test('payment activates and adopts the paid period', () => {
    const start = new Date('2026-10-17T00:00:00Z');
    const end = sm.addInterval(start, 'year');
    const changes = sm.onInvoicePaid({ state: 'suspended_read_only', graceEndsAt: past(2) }, { periodStart: start, periodEnd: end });
    expect(changes).toMatchObject({ state: 'active', graceEndsAt: null, currentPeriodStart: start, currentPeriodEnd: end });
  });

  test('extensions push the right deadline', () => {
    expect(sm.extend({ state: 'trialing', trialEndsAt: future(2) }, 10, now).trialEndsAt).toEqual(future(12));
    expect(sm.extend({ state: 'suspended_read_only' }, 5, now)).toMatchObject({ state: 'past_due_grace', graceEndsAt: future(5) });
    expect(() => sm.extend({ state: 'canceled' }, 5, now)).toThrow(/canceled/);
  });

  test('addInterval clamps month ends', () => {
    expect(sm.addInterval(new Date('2026-01-31T00:00:00Z'), 'month').toISOString()).toBe('2026-02-28T00:00:00.000Z');
    expect(sm.addInterval(new Date('2028-02-29T00:00:00Z'), 'year').toISOString()).toBe('2029-02-28T00:00:00.000Z');
  });
});

describe('overdue invoices', () => {
  test('an active subscription with an overdue invoice moves to grace', () => {
    const now = new Date('2026-10-17T00:00:00Z');
    const r = sm.advance(
      { state: 'active', currentPeriodEnd: sm.addDays(now, 100) },
      now,
      { unpaidDueAt: sm.addDays(now, -2) },
    );
    expect(r.state).toBe('past_due_grace');
    expect(r.reasons).toEqual(['invoice_overdue']);
  });
});

describe('billing calendar (Asia/Kolkata)', () => {
  test('periods start at local midnight and months clamp on the local calendar', () => {
    const start = sm.startOfDay(new Date('2026-10-31T17:13:00Z'), 'Asia/Kolkata'); // 31 Oct, 22:43 IST
    expect(start.toISOString()).toBe('2026-10-30T18:30:00.000Z'); // 31 Oct 00:00 IST
    expect(sm.addInterval(start, 'month', 1, 'Asia/Kolkata').toISOString()).toBe('2026-11-29T18:30:00.000Z'); // 30 Nov IST
    expect(sm.addInterval(start, 'year', 1, 'Asia/Kolkata').toISOString()).toBe('2027-10-30T18:30:00.000Z'); // 31 Oct 2027 IST
  });
});
