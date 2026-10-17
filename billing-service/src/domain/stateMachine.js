// Subscription lifecycle. Pure functions over a subscription row; callers persist and audit.
const { SUBSCRIPTION_STATES: S, ACCESS_MODES, LEGACY_STATE_ALIASES } = require('./constants');

const DAY_MS = 24 * 60 * 60 * 1000;

const graceDays = () => Number.parseInt(process.env.BILLING_GRACE_DAYS || '7', 10);

const addDays = (date, days) => new Date(new Date(date).getTime() + days * DAY_MS);

/** Add one billing interval, clamping month-ends (31 Jan + 1 month = 28/29 Feb). */
function addInterval(date, interval, count = 1) {
  const d = new Date(date);
  const months = interval === 'year' ? 12 * count : count;
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1,
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

const normalizeState = (state) => LEGACY_STATE_ALIASES[state] || state;

function accessModeFor(state) {
  switch (normalizeState(state)) {
    case S.SUSPENDED_READ_ONLY:
    case S.CANCELED:
      return ACCESS_MODES.READ_ONLY;
    default:
      return ACCESS_MODES.FULL;
  }
}

/** One time-driven step, or null when nothing is due. */
function step(sub, now) {
  const state = normalizeState(sub.state);
  const passed = (date) => date && new Date(date) <= now;

  if (state === S.TRIALING && passed(sub.trialEndsAt)) {
    if (sub.cancelAtPeriodEnd) {
      return { state: S.CANCELED, canceledAt: new Date(sub.trialEndsAt), reason: 'trial_ended_canceled' };
    }
    return { state: S.PAST_DUE_GRACE, graceEndsAt: addDays(sub.trialEndsAt, graceDays()), reason: 'trial_ended_unpaid' };
  }
  if (state === S.ACTIVE && passed(sub.currentPeriodEnd)) {
    if (sub.cancelAtPeriodEnd) {
      return { state: S.CANCELED, canceledAt: new Date(sub.currentPeriodEnd), reason: 'canceled_at_period_end' };
    }
    return { state: S.PAST_DUE_GRACE, graceEndsAt: addDays(sub.currentPeriodEnd, graceDays()), reason: 'renewal_unpaid' };
  }
  if (state === S.GRANDFATHERED && passed(sub.grandfatherEndsAt)) {
    return { state: S.PAST_DUE_GRACE, graceEndsAt: addDays(sub.grandfatherEndsAt, graceDays()), reason: 'grandfather_ended' };
  }
  if (state === S.PAST_DUE_GRACE && passed(sub.graceEndsAt)) {
    if (sub.cancelAtPeriodEnd) {
      return { state: S.CANCELED, canceledAt: new Date(sub.graceEndsAt), reason: 'canceled_while_unpaid' };
    }
    return { state: S.SUSPENDED_READ_ONLY, reason: 'grace_ended' };
  }
  if (state !== sub.state) return { state, reason: 'legacy_state_renamed' };
  return null;
}

/**
 * Apply every transition that time has made due. Returns the changes to write
 * (empty when nothing changed) and the reasons in order.
 */
function advance(sub, now = new Date()) {
  let current = { ...sub };
  const changes = {};
  const reasons = [];
  for (let i = 0; i < 6; i += 1) {
    const next = step(current, now);
    if (!next) break;
    const { reason, ...fields } = next;
    reasons.push(reason);
    Object.assign(changes, fields);
    current = { ...current, ...fields };
  }
  return { changes, reasons, state: current.state };
}

/** Fields to set when an invoice covering [periodStart, periodEnd) is paid in full. */
function onInvoicePaid(sub, invoice) {
  const changes = { state: S.ACTIVE, graceEndsAt: null };
  if (invoice.periodStart && invoice.periodEnd) {
    const coversNewPeriod = !sub.currentPeriodEnd || new Date(invoice.periodEnd) > new Date(sub.currentPeriodEnd);
    if (coversNewPeriod) {
      changes.currentPeriodStart = new Date(invoice.periodStart);
      changes.currentPeriodEnd = new Date(invoice.periodEnd);
    }
  }
  return changes;
}

/** Push the relevant deadline out by `days` (platform admin "grant extension"). */
function extend(sub, days, now = new Date()) {
  const state = normalizeState(sub.state);
  const from = (date) => (date && new Date(date) > now ? new Date(date) : now);
  switch (state) {
    case S.TRIALING:
      return { trialEndsAt: addDays(from(sub.trialEndsAt), days) };
    case S.PAST_DUE_GRACE:
      return { graceEndsAt: addDays(from(sub.graceEndsAt), days) };
    case S.SUSPENDED_READ_ONLY:
      return { state: S.PAST_DUE_GRACE, graceEndsAt: addDays(now, days) };
    case S.GRANDFATHERED:
      return { grandfatherEndsAt: addDays(from(sub.grandfatherEndsAt), days) };
    case S.ACTIVE:
      return { currentPeriodEnd: addDays(from(sub.currentPeriodEnd), days) };
    default:
      throw Object.assign(new Error('A canceled subscription cannot be extended'), { statusCode: 409 });
  }
}

/** Which date the school is working towards, for banners and the entitlement payload. */
function nextDeadline(sub) {
  switch (normalizeState(sub.state)) {
    case S.TRIALING: return sub.trialEndsAt;
    case S.ACTIVE: return sub.currentPeriodEnd;
    case S.PAST_DUE_GRACE: return sub.graceEndsAt;
    case S.GRANDFATHERED: return sub.grandfatherEndsAt;
    default: return null;
  }
}

module.exports = {
  addDays,
  addInterval,
  normalizeState,
  accessModeFor,
  advance,
  onInvoicePaid,
  extend,
  nextDeadline,
};
