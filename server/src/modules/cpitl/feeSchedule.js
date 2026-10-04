/**
 * CPITL fee maths — pure functions (no DB access) so they stay unit-testable.
 *
 * Conventions:
 * - Academic session runs April → March ("2025-2026" starts April 2025).
 * - A component's `amount` is the charge per occurrence (e.g. tuition 2000/month).
 * - Demands are grouped by calendar month: every head falling due in the same
 *   month lands on one demand (a "monthly challan"), which is how most Indian
 *   schools issue fee slips.
 */

const FEE_FREQUENCIES = Object.freeze(['one_time', 'monthly', 'quarterly', 'half_yearly', 'annual']);

const FREQUENCY_LABELS = Object.freeze({
  one_time: 'One-time',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  half_yearly: 'Half-yearly',
  annual: 'Annual',
});

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Session month order, April first.
const SESSION_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];

const DEFAULT_INSTALLMENT_PLAN = Object.freeze({
  dueDay: 10,
  oneTimeMonth: 4,
  annualMonth: 4,
  halfYearlyMonths: [4, 10],
  quarterlyMonths: [4, 7, 10, 1],
});

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const parseSessionStartYear = (sessionLabel) => {
  const match = /^(\d{4})-(\d{4})$/.exec(String(sessionLabel || '').trim());
  if (match) return Number(match[1]);
  const now = new Date();
  return now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
};

const normalizePlan = (plan = {}) => {
  const merged = { ...DEFAULT_INSTALLMENT_PLAN, ...(plan || {}) };
  const clampMonth = (m, fallback) => {
    const n = Number(m);
    return Number.isInteger(n) && n >= 1 && n <= 12 ? n : fallback;
  };
  const monthList = (list, fallback) => {
    const cleaned = (Array.isArray(list) ? list : []).map((m) => clampMonth(m, null)).filter(Boolean);
    return cleaned.length ? [...new Set(cleaned)] : fallback;
  };
  const dueDay = Number(merged.dueDay);
  return {
    dueDay: Number.isInteger(dueDay) && dueDay >= 1 && dueDay <= 28 ? dueDay : DEFAULT_INSTALLMENT_PLAN.dueDay,
    oneTimeMonth: clampMonth(merged.oneTimeMonth, DEFAULT_INSTALLMENT_PLAN.oneTimeMonth),
    annualMonth: clampMonth(merged.annualMonth, DEFAULT_INSTALLMENT_PLAN.annualMonth),
    halfYearlyMonths: monthList(merged.halfYearlyMonths, DEFAULT_INSTALLMENT_PLAN.halfYearlyMonths),
    quarterlyMonths: monthList(merged.quarterlyMonths, DEFAULT_INSTALLMENT_PLAN.quarterlyMonths),
  };
};

/** Calendar months (1-12) in which a head of the given frequency falls due. */
const monthsForFrequency = (frequency, plan) => {
  const p = normalizePlan(plan);
  switch (frequency) {
    case 'one_time': return [p.oneTimeMonth];
    case 'annual': return [p.annualMonth];
    case 'half_yearly': return p.halfYearlyMonths;
    case 'quarterly': return p.quarterlyMonths;
    case 'monthly': return [...SESSION_MONTHS];
    default: return [];
  }
};

const occurrencesPerYear = (frequency, plan) => monthsForFrequency(frequency, plan).length;

/** Year for a calendar month within the session (Jan–Mar belong to the second year). */
const yearForMonth = (month, startYear) => (month >= 4 ? startYear : startYear + 1);

const periodKeyFor = (month, startYear) => `${yearForMonth(month, startYear)}-${String(month).padStart(2, '0')}`;

const periodLabelFor = (month, startYear) => `${MONTH_NAMES[month - 1]} ${yearForMonth(month, startYear)}`;

/** Due date as a UTC-midnight Date to keep comparisons timezone-stable. */
const dueDateFor = (month, startYear, dueDay) => new Date(Date.UTC(yearForMonth(month, startYear), month - 1, dueDay));

/**
 * Concession for a single line. Rules: [{ feeHead: id|null, type: 'percent'|'flat', value }]
 * A rule with no feeHead applies to every head. Concession never exceeds gross.
 */
const computeConcession = (gross, feeHeadId, rules = []) => {
  let total = 0;
  (rules || []).forEach((rule) => {
    if (!rule) return;
    const ruleHead = rule.feeHead ? String(rule.feeHead) : null;
    if (ruleHead && ruleHead !== String(feeHeadId)) return;
    const value = Number(rule.value) || 0;
    if (value <= 0) return;
    total += rule.type === 'percent' ? (gross * Math.min(value, 100)) / 100 : value;
  });
  return round2(Math.min(total, gross));
};

/**
 * Build the demand schedule for one student.
 *
 * @param {object} args
 * @param {Array<{feeHead, name, code, amount, frequency, isOptional}>} args.components
 * @param {object} args.installmentPlan
 * @param {string} args.sessionLabel
 * @param {string[]} [args.optedOptionalHeads]  head ids the student opted into
 * @param {Array} [args.concessions]             concession rules for the student
 * @returns {Array<{periodKey, label, dueDate, lines, gross, concession, total}>} sorted by dueDate
 */
const buildDemandSchedule = ({ components = [], installmentPlan, sessionLabel, optedOptionalHeads = [], concessions = [] }) => {
  const plan = normalizePlan(installmentPlan);
  const startYear = parseSessionStartYear(sessionLabel);
  const opted = new Set((optedOptionalHeads || []).map(String));
  const byPeriod = new Map();

  components.forEach((component) => {
    const amount = round2(component.amount);
    if (amount <= 0) return;
    const headId = String(component.feeHead);
    if (component.isOptional && !opted.has(headId)) return;

    monthsForFrequency(component.frequency, plan).forEach((month) => {
      const periodKey = periodKeyFor(month, startYear);
      if (!byPeriod.has(periodKey)) {
        byPeriod.set(periodKey, {
          periodKey,
          label: periodLabelFor(month, startYear),
          dueDate: dueDateFor(month, startYear, plan.dueDay),
          lines: [],
        });
      }
      const concession = computeConcession(amount, headId, concessions);
      byPeriod.get(periodKey).lines.push({
        feeHead: component.feeHead,
        name: component.name || '',
        code: component.code || '',
        frequency: component.frequency,
        gross: amount,
        concession,
        net: round2(amount - concession),
        paid: 0,
      });
    });
  });

  return [...byPeriod.values()]
    .map((demand) => {
      const gross = round2(demand.lines.reduce((s, l) => s + l.gross, 0));
      const concession = round2(demand.lines.reduce((s, l) => s + l.concession, 0));
      return { ...demand, gross, concession, total: round2(gross - concession) };
    })
    .sort((a, b) => a.dueDate - b.dueDate);
};

/** Annual per-student total for a structure (before concessions, optional heads excluded unless flagged). */
const annualTotal = (components = [], installmentPlan, { includeOptional = false } = {}) => round2(
  components.reduce((sum, c) => {
    if (c.isOptional && !includeOptional) return sum;
    return sum + round2(c.amount) * occurrencesPerYear(c.frequency, installmentPlan);
  }, 0)
);

/**
 * Late fee for an unpaid demand as of a date.
 * rule: { type: 'none'|'flat'|'per_day', amount, graceDays, cap }
 */
const computeLateFee = (demand, rule, asOf = new Date()) => {
  if (!demand || !rule || rule.type === 'none' || !rule.type) return 0;
  if (round2(demand.balance) <= 0) return 0;
  const amount = Number(rule.amount) || 0;
  if (amount <= 0) return 0;
  const graceMs = (Number(rule.graceDays) || 0) * 86400000;
  const due = new Date(demand.dueDate).getTime();
  const lateMs = new Date(asOf).getTime() - (due + graceMs);
  if (lateMs <= 0) return 0;
  let fee = rule.type === 'per_day' ? amount * Math.ceil(lateMs / 86400000) : amount;
  const cap = Number(rule.cap) || 0;
  if (cap > 0) fee = Math.min(fee, cap);
  return round2(fee);
};

/** Late fee still owed on a demand after any late fee already collected against it. */
const outstandingLateFee = (demand, rule, asOf = new Date()) =>
  Math.max(0, round2(computeLateFee(demand, rule, asOf) - (Number(demand?.lateFeePaid) || 0)));

/**
 * Spread a collected late fee over open demands in due order, up to what each owes.
 * Anything beyond the computed dues (a manual fine) lands on the first demand.
 */
const allocateLateFee = (demands = [], rule, amount, asOf = new Date()) => {
  const sorted = [...demands].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  const allocations = [];
  let left = round2(amount);
  sorted.forEach((demand) => {
    if (left <= 0) return;
    const take = round2(Math.min(left, outstandingLateFee(demand, rule, asOf)));
    if (take <= 0) return;
    allocations.push({ demandId: demand._id, amount: take });
    left = round2(left - take);
  });
  if (left > 0 && sorted.length) {
    const first = allocations.find((a) => String(a.demandId) === String(sorted[0]._id));
    if (first) first.amount = round2(first.amount + left);
    else allocations.unshift({ demandId: sorted[0]._id, amount: left });
  }
  return allocations;
};

/**
 * Allocate a payment across open demands, oldest due first, line by line.
 *
 * @param {Array<{_id, dueDate, lines:[{feeHead, net, paid}]}>} demands
 * @param {number} amount
 * @param {Array<{demandId, amount}>} [manual]  optional per-demand amounts (must sum to amount)
 * @returns {{ allocations: Array<{demandId, lineIndex, feeHead, name, amount}>, unallocated: number }}
 */
const allocatePayment = (demands = [], amount, manual = null) => {
  const allocations = [];
  const sorted = [...demands].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  const fillDemand = (demand, budget) => {
    let left = round2(budget);
    (demand.lines || []).forEach((line, lineIndex) => {
      if (left <= 0) return;
      const open = round2((line.net || 0) - (line.paid || 0));
      if (open <= 0) return;
      const take = round2(Math.min(open, left));
      allocations.push({ demandId: demand._id, lineIndex, feeHead: line.feeHead, name: line.name || '', amount: take });
      left = round2(left - take);
    });
    return left;
  };

  if (Array.isArray(manual) && manual.length) {
    let unallocated = 0;
    manual.forEach((entry) => {
      const demand = sorted.find((d) => String(d._id) === String(entry.demandId));
      if (!demand) {
        unallocated = round2(unallocated + (Number(entry.amount) || 0));
        return;
      }
      unallocated = round2(unallocated + fillDemand(demand, Number(entry.amount) || 0));
    });
    return { allocations, unallocated };
  }

  let left = round2(amount);
  sorted.forEach((demand) => {
    if (left > 0) left = fillDemand(demand, left);
  });
  return { allocations, unallocated: left };
};

/** Sum outstanding balance of demands. */
const outstandingOf = (demands = []) => round2(demands.reduce((s, d) => s + Math.max(0, round2(d.balance)), 0));

/** Derive status from paid vs total. */
const demandStatus = (total, paid) => {
  if (round2(total) <= 0) return 'paid';
  if (round2(paid) <= 0) return 'due';
  if (round2(paid) >= round2(total)) return 'paid';
  return 'partial';
};

/**
 * Diff two component lists for revision history.
 * Components are matched by feeHead id.
 */
const diffComponents = (before = [], after = []) => {
  const key = (c) => String(c.feeHead);
  const beforeMap = new Map(before.map((c) => [key(c), c]));
  const afterMap = new Map(after.map((c) => [key(c), c]));
  const added = [];
  const removed = [];
  const changed = [];

  afterMap.forEach((c, k) => {
    const prev = beforeMap.get(k);
    if (!prev) {
      added.push({ feeHead: c.feeHead, name: c.name, amount: round2(c.amount), frequency: c.frequency });
      return;
    }
    const fields = [];
    if (round2(prev.amount) !== round2(c.amount)) fields.push({ field: 'amount', from: round2(prev.amount), to: round2(c.amount) });
    if (prev.frequency !== c.frequency) fields.push({ field: 'frequency', from: prev.frequency, to: c.frequency });
    if (Boolean(prev.isOptional) !== Boolean(c.isOptional)) fields.push({ field: 'isOptional', from: Boolean(prev.isOptional), to: Boolean(c.isOptional) });
    if (fields.length) changed.push({ feeHead: c.feeHead, name: c.name || prev.name, changes: fields });
  });
  beforeMap.forEach((c, k) => {
    if (!afterMap.has(k)) removed.push({ feeHead: c.feeHead, name: c.name, amount: round2(c.amount), frequency: c.frequency });
  });

  return { added, removed, changed, isEmpty: !added.length && !removed.length && !changed.length };
};

module.exports = {
  FEE_FREQUENCIES,
  FREQUENCY_LABELS,
  MONTH_NAMES,
  DEFAULT_INSTALLMENT_PLAN,
  round2,
  parseSessionStartYear,
  normalizePlan,
  monthsForFrequency,
  occurrencesPerYear,
  computeConcession,
  buildDemandSchedule,
  annualTotal,
  computeLateFee,
  outstandingLateFee,
  allocateLateFee,
  allocatePayment,
  outstandingOf,
  demandStatus,
  diffComponents,
};
