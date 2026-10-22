/**
 * Notification copy for calendar events (merged into notifications/templates.js).
 *
 * The text is built per person from the segments that reach them, so a parent
 * reads the parents' instructions (per child) and a teacher on duty reads the
 * duty note. Voice: plain English, sentence case, no exclamation marks.
 */

const dateLabel = (key) => {
  if (!key) return '';
  const date = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(key);
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
};
const timeLabel = (hhmm) => {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  if (!Number.isFinite(h)) return '';
  return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};
const firstName = (name) => String(name || '').trim().split(/\s+/)[0];

/** "Fri 14 Nov, 9:00 am" / "Fri 14 Nov – Sat 15 Nov". */
const whenLabel = (event, occurrence) => {
  const start = occurrence || event.startDate;
  const span = event.endDate && event.endDate !== event.startDate;
  if (span && !occurrence) return `${dateLabel(event.startDate)} – ${dateLabel(event.endDate)}`;
  return event.allDay || !event.startTime ? dateLabel(start) : `${dateLabel(start)}, ${timeLabel(event.startTime)}`;
};

/** Instructions for this person, each labelled with who it is for. */
const partsText = (parts = []) => parts
  .filter((part) => part.instructions)
  .map((part) => {
    const forWhom = part.children?.length ? `For ${part.children.map(firstName).join(' and ')}` : part.label;
    return forWhom ? `${forWhom}: ${part.instructions}` : part.instructions;
  })
  .join(' ');

const FIELD_NAMES = {
  title: 'name',
  startDate: 'date',
  endDate: 'end date',
  startTime: 'time',
  endTime: 'end time',
  allDay: 'time',
  venue: 'venue',
  recurrence: 'repeat'
};

const changedText = (changes = []) => {
  const names = [...new Set(changes.map((field) => FIELD_NAMES[field]).filter(Boolean))];
  return names.length ? `The ${names.join(', ')} changed. ` : '';
};

const reasonText = (reason) => (reason ? ` ${reason}` : '');

const childLine = (parts = []) => {
  const names = [...new Set(parts.flatMap((part) => part.children || []))].map(firstName);
  return names.length ? ` For ${names.join(' and ')}.` : '';
};

const linkFor = (event, occurrence, portal) => `${portal ? '/portal/calendar' : '/calendar'}?event=${event.id}`
  + `&date=${occurrence || event.startDate}`;

module.exports = {
  'calendar.event': {
    module: 'clndr',
    section: 'calendar',
    dedupeKey: (data) => {
      if (data.change === 'reminder') return `${data.event.id}:${data.occurrence}:${data.slot}`;
      // At most one "please reply" nudge a day.
      if (data.change === 'response_reminder') return `${data.event.id}:reply:${data.slot}`;
      return `${data.event.id}:r${data.event.revision}:${data.change}`;
    },
    build: (data, user) => {
      const { event, change } = data;
      const parts = data.parts?.[String(user._id)] || [];
      const when = whenLabel(event, data.occurrence);
      const venue = event.venue ? ` at ${event.venue}` : '';
      const notes = partsText(parts);
      const copy = {
        published: [`New: ${event.title}`, `${when}${venue}. ${notes}`],
        added: [`New: ${event.title}`, `${when}${venue}. ${notes}`],
        changed: [`Changed: ${event.title}`, `${changedText(data.changes)}Now ${when}${venue}. ${notes}`],
        cancelled: [`Cancelled: ${event.title}`, `${event.title} on ${when} is cancelled.${reasonText(data.reason)}`],
        removed: [`No longer for you: ${event.title}`, `You're no longer part of ${event.title} on ${when}.`],
        reminder: [
          `${data.slot === 'morning_07' ? 'Today' : 'Tomorrow'}: ${event.title}`,
          `${when}${venue}. ${notes}`
        ],
        response_reminder: [
          `Reply needed: ${event.title}`,
          `The school is waiting for your reply about ${event.title} (${when}). Open it to answer.${childLine(parts)}`
        ]
      }[change];
      if (!copy) return null;
      let tone = event.critical ? 'warning' : 'info';
      if (change === 'cancelled' || change === 'removed') tone = 'danger';
      return {
        title: copy[0],
        body: copy[1].trim(),
        tone,
        link: linkFor(event, data.occurrence, false),
        portalLink: linkFor(event, data.occurrence, true)
      };
    }
  },
  'calendar.approval_requested': {
    module: 'clndr',
    audience: 'staff',
    tone: 'info',
    dedupeKey: (data) => `${data.event.id}:r${data.event.revision}:approval`,
    build: (data) => ({
      title: 'Event waiting for your approval',
      body: `${data.byName || 'A teacher'} wants to send "${data.event.title}" (${whenLabel(data.event)}) to families.`,
      link: `/calendar/events?status=pending_approval&event=${data.event.id}`
    })
  },
  'calendar.approval_decided': {
    module: 'clndr',
    audience: 'staff',
    dedupeKey: (data) => `${data.event.id}:r${data.event.revision}:${data.decision}`,
    build: (data) => (data.decision === 'approved'
      ? {
        title: 'Event approved',
        body: `"${data.event.title}" was approved and sent.`,
        tone: 'success',
        link: linkFor(data.event, null, false)
      }
      : {
        title: 'Event sent back',
        body: `"${data.event.title}" needs changes before it goes out.${data.note ? ` Note: ${data.note}` : ''}`,
        tone: 'warning',
        link: `/calendar/events?event=${data.event.id}`
      })
  }
};

module.exports.helpers = { whenLabel, partsText, dateLabel, timeLabel };
