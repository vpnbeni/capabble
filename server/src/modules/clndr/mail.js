/**
 * Calendar emails: one per person for the segments that asked for email, built
 * from that person's own parts, with an .ics file so it can go in their phone's
 * calendar. Written to the school's mail outbox (src/mail/outbox.js), which
 * sends them in the background from the school's own account or events@.
 */
const schoolDate = require('../../utils/schoolDate');
const { buildIcs } = require('../../utils/ics');
const templates = require('../../mail/templates');
const { enqueue, notifyQueued } = require('../../mail/outbox');
const { unsubscribeUrl } = require('../../mail/unsubscribe');
const { hasEmail } = require('./audience');
const { helpers } = require('./notificationTemplates');

const appUrl = () => String(process.env.CLIENT_URL || 'https://school.capabble.cloud').replace(/\/+$/, '');

const CHANGED_FIELDS = {
  title: 'name',
  startDate: 'date',
  endDate: 'end date',
  startTime: 'time',
  endTime: 'time',
  allDay: 'time',
  venue: 'venue',
  recurrence: 'repeat'
};
const changedText = (changes = []) => {
  const names = [...new Set(changes.map((field) => CHANGED_FIELDS[field]).filter(Boolean))];
  return names.length ? `The ${names.join(', ')} changed.` : '';
};

const firstName = (name) => String(name || '').trim().split(/\s+/)[0];

const icsMethodFor = (change, occurrence) => {
  if (change === 'reminder' || change === 'response_reminder') return '';
  if (change === 'cancelled' || change === 'removed') return occurrence ? '' : 'CANCEL';
  return 'PUBLISH';
};

/**
 * Queue emails for `users` about `data.change` on `event`.
 * Skips people with no real email address and people who turned calendar emails off
 * (unless the event is marked critical). Returns how many were queued.
 */
const queueEventEmails = async ({ tenant, models, event, users, data }) => {
  const [profile, settings] = await Promise.all([
    models.SchoolProfile ? models.SchoolProfile.findOne({}).select('schoolName timeZone email').lean() : null,
    models.SchoolMailSettings
      ? models.SchoolMailSettings.findOne({ key: 'default' }).select('enabled replyTo').lean()
      : null
  ]);
  const timeZone = schoolDate.timeZoneOf(profile);
  const schoolName = profile?.schoolName || '';
  const replyToSchool = Boolean(settings?.enabled ? settings.replyTo || true : profile?.email);
  const { change, occurrence, slot } = data;
  const method = icsMethodFor(change, occurrence);
  const ics = method ? buildIcs({ ...event, recurrence: event.recurrence?.freq ? event.recurrence : null }, {
    method,
    timeZone,
    organizerName: schoolName,
    url: `${appUrl()}/?tenant=${encodeURIComponent(tenant.slug)}`
  }) : '';

  const rows = users
    .filter((user) => hasEmail(user))
    .filter((user) => event.critical || !(user.emailOptOut || []).includes('calendar'))
    .map((user) => {
      const id = String(user._id);
      const portal = user.kind === 'parent' || user.kind === 'student';
      const parts = (data.parts?.[id] || [])
        .filter((part) => part.instructions)
        .map((part) => ({
          forWhom: part.children?.length
            ? `For ${part.children.map(firstName).join(' and ')}`
            : part.label || 'For you',
          instructions: part.instructions
        }));
      const date = occurrence || event.startDate;
      const url = `${appUrl()}/?tenant=${encodeURIComponent(tenant.slug)}#${portal ? '/portal/calendar' : '/calendar'}`
        + `?event=${event._id}&date=${date}`;
      const unsubscribe = unsubscribeUrl({ slug: tenant.slug, userId: id, category: 'calendar' });
      const mail = templates.calendarEvent({
        schoolName,
        change,
        title: event.title,
        when: helpers.whenLabel(event, occurrence),
        venue: event.venue,
        description: event.description,
        parts,
        changedText: changedText(data.changes),
        reason: data.reason,
        url,
        unsubscribeUrl: unsubscribe,
        replyToSchool
      });
      let step = `r${event.revision}:${change}${occurrence ? `:${occurrence}` : ''}`;
      if (change === 'reminder') step = `${occurrence}:${slot}`;
      if (change === 'response_reminder') step = `reply:${slot}`;
      return {
        dedupeKey: `calendar:${event._id}:${step}:${id}`,
        category: 'calendar',
        to: String(user.email).toLowerCase(),
        toName: user.name || '',
        userId: user._id,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        ics,
        icsMethod: method,
        unsubscribeUrl: unsubscribe,
        entity: { type: 'calendar_event', id: String(event._id) }
      };
    });

  const queued = await enqueue(models, rows);
  if (queued) notifyQueued(tenant.dbName);
  return queued;
};

module.exports = { queueEventEmails, icsMethodFor };
