/**
 * Calendar background work over every active school:
 *  - every minute: publish events whose scheduled time has come;
 *  - every 15 minutes: send the reminders segments asked for (6 pm the day
 *    before, 7 am on the day), finish deliveries a restart left half-done,
 *    and publish anything the minute pass missed.
 *
 * Each pass runs under its own lease so only one server does it; everything it
 * sends is deduplicated per person, so a repeat is harmless anyway. Off with
 * CALENDAR_JOBS_ENABLED=false.
 */
const schoolDate = require('../../utils/schoolDate');
const { getPlatformModels } = require('../../tenancy/platformModels');
const { TENANT_STATUS } = require('../../models/platform/Tenant');
const { getActiveModelKeys } = require('../../constants/moduleModelKeys');
const { normalizeTenantFeatureToggles } = require('../../constants/tenantFeatures');
const { modelsFor } = require('../../notifications/send');
const schoolDays = require('./schoolDays');
const { occurrences } = require('./events');
const { logRun, runLogged, resumeStale } = require('./delivery');
const { REMINDER_PRESETS } = require('./constants');

const LEASE = 'calendar-jobs';
const PUBLISH_LEASE = 'calendar-publish';
const INTERVAL_MS = 15 * 60 * 1000;
const PUBLISH_INTERVAL_MS = 60 * 1000;

const zonedHour = (now, timeZone) => Number(new Intl.DateTimeFormat('en-US', {
  timeZone, hour: '2-digit', hourCycle: 'h23'
}).format(now));

/** Scheduled events whose publish time has passed: publish and announce. */
const publishDue = async (tenant, models, now) => {
  const { CalendarEvent } = models;
  const due = await CalendarEvent.find({ status: 'scheduled', publishAt: { $lte: now } }).select('_id revision').lean();
  let published = 0;
  // eslint-disable-next-line no-restricted-syntax
  for (const { _id } of due) {
    // The status condition makes this a claim: a second server finds nothing to update.
    // eslint-disable-next-line no-await-in-loop
    const event = await CalendarEvent.findOneAndUpdate(
      { _id, status: 'scheduled' },
      { $set: { status: 'published', publishedAt: now } },
      { new: true }
    ).lean();
    // eslint-disable-next-line no-continue
    if (!event) continue;
    // eslint-disable-next-line no-await-in-loop
    const runId = await logRun(models, event._id, { change: 'published', revision: event.revision });
    // eslint-disable-next-line no-await-in-loop
    await runLogged({ tenant, models, eventId: event._id, runId, opts: { change: 'published' } });
    published += 1;
  }
  return published;
};

/** Which reminder slots are open right now for which occurrence date. */
const openSlots = (today, hour) => Object.entries(REMINDER_PRESETS)
  .filter(([, preset]) => hour >= preset.hour && hour <= preset.lastHour)
  .map(([slot, preset]) => ({ slot, occurrence: schoolDate.addDays(today, -preset.dayOffset) }));

const reminders = async (tenant, models, now, timeZone) => {
  const today = schoolDate.dateKey(now, timeZone);
  const slots = openSlots(today, zonedHour(now, timeZone));
  if (!slots.length) return 0;
  const { CalendarEvent } = models;
  const last = slots.reduce((max, s) => (s.occurrence > max ? s.occurrence : max), today);
  const events = await CalendarEvent.find({
    status: 'published',
    'segments.reminders.0': { $exists: true },
    startDate: { $lte: last },
    $or: [{ endDate: { $gte: today } }, { 'recurrence.freq': { $in: ['daily', 'weekly', 'monthly'] } }]
  }).select('-targetKeys').lean();
  if (!events.length) return 0;

  const days = await schoolDays.range(models, today, last, null);
  const isWorking = (key) => (days[key] ? days[key].working : true);
  let sent = 0;
  // eslint-disable-next-line no-restricted-syntax
  for (const event of events) {
    const starts = new Set(occurrences(event, today, last, { isWorking }).map((occ) => occ.startDate));
    // eslint-disable-next-line no-restricted-syntax
    for (const { slot, occurrence } of slots) {
      const wanted = starts.has(occurrence)
        && event.segments.some((segment) => (segment.reminders || []).includes(slot));
      const done = (event.sendLog || []).some((run) => run.change === 'reminder' && run.slot === slot
        && run.occurrence === occurrence && run.status !== 'failed');
      // eslint-disable-next-line no-continue
      if (!wanted || done) continue;
      // eslint-disable-next-line no-await-in-loop
      const runId = await logRun(models, event._id, { change: 'reminder', revision: event.revision, occurrence, slot });
      // eslint-disable-next-line no-await-in-loop
      const result = await runLogged({
        tenant, models, eventId: event._id, runId, opts: { change: 'reminder', occurrence, slot }
      });
      sent += result?.notified || 0;
    }
  }
  return sent;
};

/** The tenant ref and models for a school with the calendar on, or null. */
const openTenant = (tenantDoc) => {
  const toggles = normalizeTenantFeatureToggles(tenantDoc.featureToggles);
  if (toggles.clndr_calendar === false) return null;
  const tenant = { dbName: tenantDoc.dbName, slug: tenantDoc.slug, id: String(tenantDoc._id) };
  return { tenant, models: modelsFor(tenant, getActiveModelKeys(toggles)) };
};

const activeTenants = () => getPlatformModels().Tenant.find({ status: TENANT_STATUS.ACTIVE })
  .select('_id slug dbName featureToggles').lean();

const runForTenant = async (tenantDoc, now = new Date()) => {
  const opened = openTenant(tenantDoc);
  if (!opened) return {};
  const { tenant, models } = opened;
  const profile = await models.SchoolProfile.findOne({}).select('timeZone').lean();
  const timeZone = schoolDate.timeZoneOf(profile);
  const result = {};
  const step = async (name, fn) => {
    try {
      result[name] = await fn();
    } catch (error) {
      console.error(`[clndr] ${name} failed for ${tenant.slug}: ${error.message}`);
    }
  };
  await step('published', () => publishDue(tenant, models, now));
  await step('reminders', () => reminders(tenant, models, now, timeZone));
  await step('resumed', () => resumeStale(tenant, models, now));
  return result;
};

const runOnce = async (now = new Date()) => {
  const tenants = await activeTenants();
  const summary = {};
  // eslint-disable-next-line no-restricted-syntax
  for (const tenant of tenants) {
    // eslint-disable-next-line no-await-in-loop
    summary[tenant.slug] = await runForTenant(tenant, now);
  }
  return summary;
};

/** The every-minute pass: only publishing, so a scheduled event goes out on time. */
const publishOnce = async (now = new Date()) => {
  const tenants = await activeTenants();
  const summary = {};
  // eslint-disable-next-line no-restricted-syntax
  for (const tenantDoc of tenants) {
    try {
      const opened = openTenant(tenantDoc);
      // eslint-disable-next-line no-await-in-loop
      if (opened) summary[tenantDoc.slug] = await publishDue(opened.tenant, opened.models, now);
    } catch (error) {
      console.error(`[clndr] publishing failed for ${tenantDoc.slug}: ${error.message}`);
    }
  }
  return summary;
};

let timers = [];
const running = new Set();

/** One pass under its lease; skipped while the last one is still going. */
const leased = (lease, minutes, work) => async () => {
  if (running.has(lease)) return;
  running.add(lease);
  try {
    // eslint-disable-next-line global-require
    const { acquireLease, releaseLease } = require('../dataLifecycle/lease');
    const held = await acquireLease(lease, minutes);
    if (!held) return;
    try {
      await work();
    } finally {
      await releaseLease(lease);
    }
  } catch (error) {
    console.error(`[clndr] ${lease} failed`, error.message);
  } finally {
    running.delete(lease);
  }
};

const tick = leased(LEASE, 14, () => runOnce());
const publishTick = leased(PUBLISH_LEASE, 5, () => publishOnce());

const start = ({
  intervalMs = INTERVAL_MS, publishIntervalMs = PUBLISH_INTERVAL_MS, initialDelayMs = 90 * 1000
} = {}) => {
  if (timers.length || String(process.env.CALENDAR_JOBS_ENABLED || 'true') !== 'true') return;
  setTimeout(tick, initialDelayMs).unref();
  timers = [setInterval(tick, intervalMs), setInterval(publishTick, publishIntervalMs)];
  timers.forEach((timer) => timer.unref());
};

const stop = () => {
  timers.forEach((timer) => clearInterval(timer));
  timers = [];
};

module.exports = {
  start, stop, runOnce, publishOnce, runForTenant, publishDue, reminders, openSlots
};
