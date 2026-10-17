// Turns a module selection into invoice lines (before tax). Pure: no I/O.
const { assertPaise, applyBps, allocate } = require('./money');

const DAY_MS = 24 * 60 * 60 * 1000;

/** Base price covers `includedStudents`; every student above that pays `perStudentPaise`. */
function priceModule(price, students) {
  assertPaise(price.basePaise, 'basePaise');
  assertPaise(price.perStudentPaise || 0, 'perStudentPaise');
  const count = Math.max(0, Math.trunc(students || 0));
  const included = Math.max(0, price.includedStudents ?? 500);
  const extraStudents = Math.max(0, count - included);
  const overagePaise = extraStudents * (price.perStudentPaise || 0);
  return {
    basePaise: price.basePaise,
    includedStudents: included,
    extraStudents,
    overagePaise,
    amountPaise: price.basePaise + overagePaise,
  };
}

/** Share of a period still to run from `from`, counted in whole days. */
function prorationFactor(from, periodStart, periodEnd) {
  const total = Math.round((periodEnd - periodStart) / DAY_MS);
  if (total <= 0) return { remainingDays: 0, totalDays: 0 };
  const remaining = Math.min(total, Math.max(0, Math.ceil((periodEnd - from) / DAY_MS)));
  return { remainingDays: remaining, totalDays: total };
}

function prorate(amountPaise, factor) {
  if (!factor.totalDays) return 0;
  return Math.round((amountPaise * factor.remainingDays) / factor.totalDays);
}

function couponIsUsable(coupon, { now = new Date(), cyclesUsed = 0 } = {}) {
  if (!coupon || coupon.active === false) return false;
  if (coupon.expiresAt && new Date(coupon.expiresAt) <= now) return false;
  if (coupon.maxRedemptions != null && coupon.redeemedCount >= coupon.maxRedemptions && cyclesUsed === 0) return false;
  if (coupon.duration === 'once' && cyclesUsed >= 1) return false;
  if (coupon.duration === 'repeating' && cyclesUsed >= (coupon.durationCycles || 0)) return false;
  return true;
}

/**
 * Build pre-tax lines for one billing period.
 *
 * @param {object} input
 * @param {Array<{code,name,price}>} input.modules  chargeable modules with their active price
 * @param {number} input.students                   students billed
 * @param {{code,name,discountBps,moduleCodes}} [input.bundle]
 * @param {object} [input.coupon]                   coupon row (already checked usable)
 * @param {Array<{code,name,amountPaise,quantity}>} [input.addons]
 * @param {{remainingDays,totalDays}} [input.proration] charge only part of the period
 * @param {string} input.intervalLabel              e.g. "Apr 2026 – Mar 2027"
 * @param {string} input.hsnSac
 */
function buildLines({
  modules = [],
  students = 0,
  bundle = null,
  coupon = null,
  addons = [],
  proration = null,
  intervalLabel = '',
  hsnSac,
}) {
  const lines = [];
  const scale = (amount) => (proration ? prorate(amount, proration) : amount);
  const suffix = intervalLabel ? ` (${intervalLabel})` : '';
  const prorationNote = proration ? `, ${proration.remainingDays}/${proration.totalDays} days` : '';

  const sorted = [...modules].sort((a, b) => a.code.localeCompare(b.code));
  for (const mod of sorted) {
    const p = priceModule(mod.price, students);
    const base = scale(p.basePaise);
    lines.push({
      kind: proration ? 'proration' : 'module',
      moduleCode: mod.code,
      description: `${mod.name}, up to ${p.includedStudents} students${suffix}${prorationNote}`,
      quantity: 1,
      unitPaise: base,
      amountPaise: base,
    });
    if (p.extraStudents > 0 && mod.price.perStudentPaise > 0) {
      const overage = scale(p.overagePaise);
      // Keep qty × unit = amount exact even when prorated.
      const exact = overage % p.extraStudents === 0;
      lines.push({
        kind: proration ? 'proration' : 'overage',
        moduleCode: mod.code,
        description: `${mod.name}, ${p.extraStudents} students above ${p.includedStudents}${suffix}${prorationNote}`,
        quantity: exact ? p.extraStudents : 1,
        unitPaise: exact ? overage / p.extraStudents : overage,
        amountPaise: overage,
      });
    }
  }

  for (const addon of addons) {
    const qty = Math.max(1, addon.quantity || 1);
    const unit = addon.cycle === 'one_time' ? addon.amountPaise : scale(addon.amountPaise);
    lines.push({
      kind: 'addon',
      addonCode: addon.code,
      description: `${addon.name}${addon.cycle === 'one_time' ? ' (one-time)' : suffix}`,
      quantity: qty,
      unitPaise: unit,
      amountPaise: unit * qty,
    });
  }

  lines.forEach((line) => { line.discountPaise = 0; });

  // Bundle discount: only on modules that belong to the bundle.
  if (bundle && bundle.discountBps > 0) {
    const inBundle = new Set(bundle.moduleCodes || []);
    for (const line of lines) {
      if (line.moduleCode && inBundle.has(line.moduleCode)) {
        line.discountPaise += applyBps(line.amountPaise, bundle.discountBps);
      }
    }
  }

  // Coupon: on what is left after the bundle, restricted to its modules if it lists any.
  if (coupon) {
    const limitTo = coupon.moduleCodes && coupon.moduleCodes.length ? new Set(coupon.moduleCodes) : null;
    const eligible = lines.filter((line) => (limitTo ? line.moduleCode && limitTo.has(line.moduleCode) : true));
    if (coupon.percentBps) {
      for (const line of eligible) {
        line.discountPaise += applyBps(line.amountPaise - line.discountPaise, coupon.percentBps);
      }
    } else if (coupon.fixedPaise) {
      const remaining = eligible.map((line) => line.amountPaise - line.discountPaise);
      const cap = Math.min(coupon.fixedPaise, remaining.reduce((a, b) => a + b, 0));
      allocate(cap, remaining).forEach((part, i) => { eligible[i].discountPaise += part; });
    }
  }

  return lines
    .filter((line) => line.amountPaise > 0)
    .map((line, index) => ({
      ...line,
      position: index + 1,
      hsnSac,
      discountPaise: Math.min(line.discountPaise, line.amountPaise),
      taxablePaise: line.amountPaise - Math.min(line.discountPaise, line.amountPaise),
    }));
}

module.exports = { priceModule, prorationFactor, prorate, couponIsUsable, buildLines };
