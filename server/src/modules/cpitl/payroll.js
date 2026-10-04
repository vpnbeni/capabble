/**
 * CPITL payroll maths — pure functions so statutory rules stay unit-testable.
 *
 * Indian statutory defaults (configurable via CapitalSettings.payroll):
 * - PF: 12% employee + 12% employer on Basic + DA, wage capped at ₹15,000 unless the cap is off.
 * - ESI: 0.75% employee + 3.25% employer on gross, only when full monthly gross ≤ ₹21,000.
 * - Professional Tax: state slabs on monthly gross (none by default — not every state levies it).
 * - TDS: fixed monthly amount entered per staff member.
 */

const DEFAULT_PAYROLL_SETTINGS = Object.freeze({
  pfRate: 12,
  pfWageCeiling: 15000,
  esiEmployee: 0.75,
  esiEmployer: 3.25,
  esiGrossLimit: 21000,
  ptSlabs: [],
});

const rupee = (value) => Math.round(Number(value) || 0);

const daysInMonth = (month) => {
  const [y, m] = String(month).split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

const findByCode = (components, code) => components.find((c) => String(c.code).toUpperCase() === code);

/**
 * Resolve the full-month (unprorated) earnings of a structure.
 * Components: [{ code, name, type: 'earning'|'deduction', calc, value }]
 *  - fixed            → value is ₹/month
 *  - percent_of_basic → value% of BASIC
 *  - percent_of_gross → value% of the sum of the other earnings (resolved last)
 */
const resolveEarnings = (components = []) => {
  const earnings = components.filter((c) => c.type === 'earning');
  const basicComp = findByCode(earnings, 'BASIC');
  const basic = basicComp ? rupee(basicComp.calc === 'fixed' ? basicComp.value : 0) : 0;
  const resolved = [];
  earnings.forEach((c) => {
    if (c.calc === 'percent_of_gross') return;
    const amount = c.calc === 'percent_of_basic' ? (basic * (Number(c.value) || 0)) / 100 : Number(c.value) || 0;
    resolved.push({ code: c.code, name: c.name, amount: rupee(amount) });
  });
  const subtotal = resolved.reduce((s, e) => s + e.amount, 0);
  earnings
    .filter((c) => c.calc === 'percent_of_gross')
    .forEach((c) => resolved.push({ code: c.code, name: c.name, amount: rupee((subtotal * (Number(c.value) || 0)) / 100) }));
  return resolved;
};

const professionalTax = (gross, slabs = []) => {
  const slab = (slabs || []).find((s) => gross >= (Number(s.min) || 0) && (s.max === null || s.max === undefined || s.max === '' || gross <= Number(s.max)));
  return slab ? rupee(slab.amount) : 0;
};

/**
 * Compute one payslip.
 *
 * @param {object} structure  { components, options: { pf, pfWageCap, esi: 'auto'|'off', tdsMonthly } }
 * @param {object} period     { daysInMonth, lopDays, arrears, otherDeduction }
 * @param {object} settings   payroll settings (defaults above)
 */
const computePayslip = (structure = {}, period = {}, settings = {}) => {
  const cfg = { ...DEFAULT_PAYROLL_SETTINGS, ...(settings || {}) };
  const options = { pf: true, pfWageCap: true, esi: 'auto', tdsMonthly: 0, ...(structure.options || {}) };
  const totalDays = Number(period.daysInMonth) || 30;
  const lopDays = Math.min(totalDays, Math.max(0, Number(period.lopDays) || 0));
  const paidDays = totalDays - lopDays;
  const ratio = totalDays > 0 ? paidDays / totalDays : 0;

  const fullEarnings = resolveEarnings(structure.components || []);
  const fullGross = fullEarnings.reduce((s, e) => s + e.amount, 0);
  const earnings = fullEarnings.map((e) => ({ ...e, amount: rupee(e.amount * ratio) }));
  const arrears = rupee(period.arrears);
  if (arrears > 0) earnings.push({ code: 'ARREARS', name: 'Arrears', amount: arrears });
  const gross = earnings.reduce((s, e) => s + e.amount, 0);

  const deductions = [];
  let employerPf = 0;
  let employerEsi = 0;

  if (options.pf) {
    const basicDa = earnings.filter((e) => ['BASIC', 'DA'].includes(String(e.code).toUpperCase())).reduce((s, e) => s + e.amount, 0);
    const pfWage = options.pfWageCap ? Math.min(basicDa, cfg.pfWageCeiling) : basicDa;
    const pf = rupee((pfWage * cfg.pfRate) / 100);
    if (pf > 0) deductions.push({ code: 'PF', name: 'Provident Fund', amount: pf });
    employerPf = pf;
  }

  if (options.esi !== 'off' && fullGross > 0 && fullGross <= cfg.esiGrossLimit) {
    const esi = Math.ceil((gross * cfg.esiEmployee) / 100);
    if (esi > 0) deductions.push({ code: 'ESI', name: 'ESI', amount: esi });
    employerEsi = Math.ceil((gross * cfg.esiEmployer) / 100);
  }

  const pt = professionalTax(gross, cfg.ptSlabs);
  if (pt > 0) deductions.push({ code: 'PT', name: 'Professional Tax', amount: pt });

  const tds = rupee(options.tdsMonthly);
  if (tds > 0) deductions.push({ code: 'TDS', name: 'TDS', amount: tds });

  // Fixed deductions defined on the structure (e.g. loan recovery).
  (structure.components || [])
    .filter((c) => c.type === 'deduction' && c.calc === 'fixed' && Number(c.value) > 0)
    .forEach((c) => deductions.push({ code: c.code, name: c.name, amount: rupee(c.value) }));

  const other = rupee(period.otherDeduction);
  if (other > 0) deductions.push({ code: 'OTHER', name: 'Other deduction', amount: other });

  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);
  return {
    daysInMonth: totalDays,
    lopDays,
    paidDays,
    earnings,
    deductions,
    fullGross,
    gross,
    totalDeductions,
    net: Math.max(0, gross - totalDeductions),
    employerPf,
    employerEsi,
    employerCost: gross + employerPf + employerEsi,
  };
};

/** LOP days per staff from attendance rows: A = 1, HD = 0.5. */
const attendanceLop = (records = []) => records.reduce((acc, r) => {
  const key = String(r.staffId);
  const add = r.status === 'A' ? 1 : r.status === 'HD' ? 0.5 : 0;
  if (add) acc[key] = (acc[key] || 0) + add;
  return acc;
}, {});

module.exports = {
  DEFAULT_PAYROLL_SETTINGS,
  daysInMonth,
  resolveEarnings,
  professionalTax,
  computePayslip,
  attendanceLop,
};
