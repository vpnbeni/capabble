/**
 * Telling people about calendar events.
 *
 * deliver() resolves who a change reaches (audience.resolveRecipients), builds
 * each person's parts (the segments that reach them, per child) and writes one
 * in-app notification each through notifications/send.js. Segments marked
 * `silent` are shown on the calendar but never ping. Emails for segments that
 * ask for them go to the mail outbox (see ./mail.js).
 *
 * Runs are logged on the event (`sendLog`). deliverLater() answers the request
 * first and sends in the background; the scheduler re-runs any run left queued
 * by a restart. Re-running is safe: notifications dedupe per person and the
 * outbox dedupes per email.
 */
const { send } = require('../../notifications/send');
const { resolveRecipients } = require('./audience');

const LOG_LIMIT = 30;
const STALE_MS = 10 * 60 * 1000;
const SENDING_STALE_MS = 45 * 60 * 1000;
// Runs for a hand-picked list of people (not stored) can't be re-run safely.
const NOT_RESUMABLE = new Set(['removed', 'response_reminder']);

let mail = null;
const mailer = () => {
  // eslint-disable-next-line global-require
  if (mail === null) mail = require('./mail');
  return mail;
};

/** The event fields notification copy needs. */
const summary = (event) => ({
  id: String(event._id),
  uid: event.uid,
  revision: event.revision,
  title: event.title,
  description: event.description || '',
  startDate: event.startDate,
  endDate: event.endDate,
  startTime: event.startTime || null,
  endTime: event.endTime || null,
  allDay: event.allDay,
  venue: event.venue || '',
  critical: Boolean(event.critical),
  status: event.status,
  recurrence: event.recurrence?.freq ? event.recurrence : null
});

/**
 * Notify the people an event reaches.
 * opts: { change, onlySegments, changes, reason, occurrence, slot, extraUsers }
 *  - change: published | changed | cancelled | removed | added | reminder
 *  - extraUsers: [{ user, segments }] reached outside the current audience (e.g. removed people)
 * Returns { recipients, notified, emailsQueued, stats }.
 */
const deliver = async ({ tenant, models, event, ...opts }) => {
  const { change } = opts;
  const { recipients, stats } = opts.extraUsers
    ? { recipients: new Map(opts.extraUsers.map((entry) => [String(entry.user._id), entry])), stats: [] }
    : await resolveRecipients(models, event, { onlySegments: opts.onlySegments || null });
  const segments = new Map((event.segments || []).map((segment) => [segment.key, segment]));

  const parts = {};
  const users = [];
  const emailTo = [];
  recipients.forEach(({ user, segments: reached }, id) => {
    const loud = reached
      .map((entry) => ({ entry, segment: segments.get(entry.key) }))
      .filter(({ segment }) => !segment || segment.notify !== 'silent')
      .filter(({ segment }) => change !== 'reminder' || (segment?.reminders || []).includes(opts.slot));
    if (!loud.length) return;
    parts[id] = loud.map(({ entry, segment }) => ({
      key: entry.key,
      label: segment?.label || '',
      role: segment?.role || '',
      instructions: segment?.instructions || '',
      children: entry.children || []
    }));
    users.push(user);
    const wantsEmail = loud.some(({ segment }) => segment && segment.notify === 'now' && segment.email);
    // Reminders go by email only for critical events; everything else that asked for email does.
    if (wantsEmail && (change !== 'reminder' || event.critical)) emailTo.push(user);
  });

  const data = {
    event: summary(event),
    change,
    parts,
    changes: opts.changes || [],
    reason: opts.reason || '',
    occurrence: opts.occurrence,
    slot: opts.slot,
    entity: { type: 'calendar_event', id: String(event._id) }
  };
  const notified = users.length ? await send(tenant, users, 'calendar.event', data) : 0;
  let emailsQueued = 0;
  if (emailTo.length) {
    try {
      emailsQueued = await mailer().queueEventEmails({ tenant, models, event, users: emailTo, data });
    } catch (error) {
      console.error(`[clndr] emails for ${event._id} not queued: ${error.message}`);
    }
  }
  return { recipients: users.length, notified, emailsQueued, stats };
};

const tenantRefOf = (req) => ({
  dbName: req.tenant?.dbName, slug: req.tenant?.slug, id: String(req.tenant?.id || req.tenant?._id || '')
});

/** Add a queued run to the event's log and return its id. */
const logRun = async (models, eventId, entry) => {
  const { CalendarEvent } = models;
  const doc = await CalendarEvent.findByIdAndUpdate(
    eventId,
    { $push: { sendLog: { $each: [{ ...entry, status: 'queued', at: new Date() }], $slice: -LOG_LIMIT } } },
    { new: true }
  ).select('sendLog').lean();
  return doc?.sendLog?.[doc.sendLog.length - 1]?._id;
};

const finishRun = (models, eventId, runId, fields) => models.CalendarEvent.updateOne(
  { _id: eventId, 'sendLog._id': runId },
  { $set: Object.fromEntries(Object.entries(fields).map(([key, value]) => [`sendLog.$.${key}`, value])) }
);

/** Run one logged delivery now, recording the outcome on the event. */
const runLogged = async ({ tenant, models, eventId, runId, opts }) => {
  const event = await models.CalendarEvent.findById(eventId).lean();
  if (!event) return null;
  await finishRun(models, eventId, runId, { status: 'sending', at: new Date() });
  try {
    const result = await deliver({ tenant, models, event, ...opts });
    await finishRun(models, eventId, runId, {
      status: 'sent',
      finishedAt: new Date(),
      recipients: result.recipients,
      notified: result.notified,
      emailsQueued: result.emailsQueued,
      stats: result.stats
    });
    return result;
  } catch (error) {
    console.error(`[clndr] delivery for ${eventId} failed: ${error.message}`);
    await finishRun(models, eventId, runId, {
      status: 'failed', finishedAt: new Date(), error: error.message.slice(0, 300)
    });
    return null;
  }
};

/**
 * Log a run and send it after the response. `opts.extraUsers` is not stored, so
 * runs that need it are sent before the response returns instead.
 */
const deliverLater = async (req, event, opts) => {
  const tenant = tenantRefOf(req);
  const { models } = req;
  const runId = await logRun(models, event._id, {
    change: opts.change,
    revision: event.revision,
    occurrence: opts.occurrence,
    slot: opts.slot,
    by: req.user?._id || null,
    stats: { onlySegments: opts.onlySegments || null, changes: opts.changes || [], reason: opts.reason || '' }
  });
  if (opts.extraUsers) return runLogged({ tenant, models, eventId: event._id, runId, opts });
  setImmediate(() => {
    runLogged({ tenant, models, eventId: event._id, runId, opts }).catch(() => {});
  });
  return runId;
};

/** Re-run deliveries a restart left queued or half-sent (called by the scheduler). */
const resumeStale = async (tenant, models, now = new Date()) => {
  const { CalendarEvent } = models;
  if (!CalendarEvent) return 0;
  const before = new Date(now.getTime() - STALE_MS);
  const sendingBefore = new Date(now.getTime() - SENDING_STALE_MS);
  const stale = (run) => (run.status === 'queued' && run.at < before)
    || (run.status === 'sending' && run.at < sendingBefore);
  const events = await CalendarEvent.find({
    sendLog: { $elemMatch: { status: { $in: ['queued', 'sending'] }, at: { $lt: before } } }
  }).select('sendLog').lean();
  let resumed = 0;
  // eslint-disable-next-line no-restricted-syntax
  for (const event of events) {
    const runs = (event.sendLog || []).filter(stale);
    // eslint-disable-next-line no-restricted-syntax
    for (const run of runs) {
      if (NOT_RESUMABLE.has(run.change)) {
        // eslint-disable-next-line no-await-in-loop
        await finishRun(models, event._id, run._id, {
          status: 'failed', finishedAt: now, error: 'Stopped by a restart; send it again'
        });
        continue; // eslint-disable-line no-continue
      }
      const opts = {
        change: run.change,
        occurrence: run.occurrence,
        slot: run.slot,
        onlySegments: run.stats?.onlySegments || null,
        changes: run.stats?.changes || [],
        reason: run.stats?.reason || ''
      };
      // eslint-disable-next-line no-await-in-loop
      await runLogged({ tenant, models, eventId: event._id, runId: run._id, opts });
      resumed += 1;
    }
  }
  return resumed;
};

module.exports = {
  deliver, deliverLater, runLogged, resumeStale, summary, tenantRefOf, logRun
};
