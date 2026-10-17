// Subscription lifecycle. Pure functions over a subscription row; callers persist and audit.
const { SUBSCRIPTION_STATES: S, ACCESS_MODES, LEGACY_STATE_ALIASES } = require('./constants');

const DAY_MS = 24 * 60 * 60 * 1000;

const graceDays = () => Number.parseInt(process.env.BILLING_GRACE_DAYS || '7', 10);

const addDays = (date, days) => new Date(new Date(date).getTime() + days * DAY_MS);

const zone = () => process.env.BILLING_TIMEZONE || 'Asia/Kolkata';

function localParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

// Minutes the zone is ahead of UTC at `date`.
function offsetMinutes(date, timeZone) {
  const p = localParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

function localMidnight(year, month, day, timeZone) {
  const guess = new Date(Date.UTC(year, month - 1, day));
  return new Date(guess.getTime() - offsetMinutes(guess, timeZone) * 60000);
}

/** Midnight at the start of `date`'s day in the billing time zone. */
function startOfDay(date, timeZone = zone()) {
  const p = localParts(new Date(date), timeZone);
  return localMidnight(p.year, p.month, p.day, timeZone);
}

/**
 * Add billing intervals on the local calendar, clamping month ends
 * (31 Jan + 1 month = 28/29 Feb). The time of day is kept.
 */
function addInterval(date, interval, count = 1, timeZone = zone()) {
  const d = new Date(date);
  const months = interval === 'year' ? 12 * count : count;
  const p = localParts(d, timeZone);
  const sinceMidnight = d.getTime() - localMidnight(p.year, p.month, p.day, timeZone).getTime();
  const monthIndex = p.month - 1 + months;
  const year = p.year + Math.floor(monthIndex / 12);
  const month = (((monthIndex % 12) + 12) % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(localMidnight(year, month, Math.min(p.day, lastDay), timeZone).getTime() + sinceMidnight);
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

/**
 * One time-driven step, or null when nothing is due.
 * `unpaidDueAt` is the due date of the oldest unpaid invoice, if any.
 */
function step(sub, now, unpaidDueAt = null) {
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
  if (state === S.ACTIVE && passed(unpaidDueAt)) {
    return { state: S.PAST_DUE_GRACE, graceEndsAt: addDays(unpaidDueAt, graceDays()), reason: 'invoice_overdue' };
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
function advance(sub, now = new Date(), { unpaidDueAt = null } = {}) {
  let current = { ...sub };
  const changes = {};
  const reasons = [];
  for (let i = 0; i < 6; i += 1) {
    const next = step(current, now, unpaidDueAt);
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
  startOfDay,
  normalizeState,
  accessModeFor,
  advance,
  onInvoicePaid,
  extend,
  nextDeadline,
};
