/**
 * iCalendar (RFC 5545) text for one calendar event, attached to emails so
 * people can add it to their own calendar with one tap.
 *
 *  - METHOD:PUBLISH announces (no RSVP buttons); METHOD:CANCEL with the same UID
 *    and a higher SEQUENCE removes it again.
 *  - All-day events are DATE values with an exclusive end; timed events carry the
 *    school's zone (TZID) with a VTIMEZONE block for India, which has no DST.
 *  - Lines are folded at 75 octets and text is escaped.
 */
const schoolDate = require('./schoolDate');

const CRLF = '\r\n';
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

const escapeText = (value) => String(value || '')
  .replace(/\\/g, '\\\\')
  .replace(/;/g, '\\;')
  .replace(/,/g, '\\,')
  .replace(/\r?\n/g, '\\n');

/** Fold a content line to 75 octets (continuation lines start with a space). */
const fold = (line) => {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Don't split a multi-byte character.
    while (end < bytes.length && (bytes[end] & 0xC0) === 0x80) end -= 1; // eslint-disable-line no-bitwise
    parts.push(bytes.slice(start, end).toString('utf8'));
    start = end;
    limit = 74;
  }
  return parts.join(`${CRLF} `);
};

const dateValue = (key) => key.replace(/-/g, '');
const dateTimeValue = (key, hhmm) => `${dateValue(key)}T${String(hhmm || '00:00').replace(':', '')}00`;
/** An hour later, for timed events with no end time (capped at 23:xx). */
const addHour = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return `${String(Math.min(23, h + 1)).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
};
const utcStamp = (date = new Date()) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

/** VTIMEZONE for a fixed-offset zone (India: +05:30, no daylight saving). */
const vtimezone = (timeZone) => {
  if (timeZone !== 'Asia/Kolkata') return [];
  return [
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Kolkata',
    'BEGIN:STANDARD',
    'DTSTART:19451015T000000',
    'TZOFFSETFROM:+0630',
    'TZOFFSETTO:+0530',
    'TZNAME:IST',
    'END:STANDARD',
    'END:VTIMEZONE'
  ];
};

const rrule = (recurrence) => {
  if (!recurrence?.freq) return null;
  const parts = [`FREQ=${String(recurrence.freq).toUpperCase()}`];
  if (recurrence.interval && recurrence.interval > 1) parts.push(`INTERVAL=${recurrence.interval}`);
  if (recurrence.freq === 'weekly' && recurrence.byDay?.length) {
    parts.push(`BYDAY=${recurrence.byDay.map((d) => WEEKDAYS[d]).join(',')}`);
  }
  if (recurrence.until) parts.push(`UNTIL=${dateValue(recurrence.until)}`);
  return `RRULE:${parts.join(';')}`;
};

/**
 * @param {object} event  { uid, revision, title, description, venue, allDay, startDate, endDate, startTime, endTime,
 *                          recurrence, status }
 * @param {object} opts   { method: 'PUBLISH' | 'CANCEL', timeZone, url, organizerName, organizerEmail, now }
 */
const buildIcs = (event, opts = {}) => {
  const method = opts.method === 'CANCEL' ? 'CANCEL' : 'PUBLISH';
  const timeZone = opts.timeZone || schoolDate.DEFAULT_TIME_ZONE;
  const endDate = event.endDate || event.startDate;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Capabble//School calendar//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`
  ];
  const timed = !event.allDay && event.startTime;
  if (timed) lines.push(...vtimezone(timeZone));
  lines.push(
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `SEQUENCE:${Math.max(0, Number(event.revision || 1) - 1)}`,
    `DTSTAMP:${utcStamp(opts.now)}`
  );
  if (timed) {
    const tz = timeZone === 'Asia/Kolkata' ? ';TZID=Asia/Kolkata' : '';
    lines.push(`DTSTART${tz}:${dateTimeValue(event.startDate, event.startTime)}`);
    const endTime = event.endTime || event.startTime;
    const sameInstant = endTime === event.startTime && endDate === event.startDate;
    lines.push(`DTEND${tz}:${dateTimeValue(endDate, sameInstant ? addHour(endTime) : endTime)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${dateValue(event.startDate)}`);
    lines.push(`DTEND;VALUE=DATE:${dateValue(schoolDate.addDays(endDate, 1))}`);
  }
  const rule = rrule(event.recurrence);
  if (rule) lines.push(rule);
  const tzParam = timeZone === 'Asia/Kolkata' ? ';TZID=Asia/Kolkata' : '';
  (event.recurrence?.exDates || []).forEach((key) => {
    lines.push(timed
      ? `EXDATE${tzParam}:${dateTimeValue(key, event.startTime)}`
      : `EXDATE;VALUE=DATE:${dateValue(key)}`);
  });
  lines.push(`SUMMARY:${escapeText(event.title)}`);
  if (event.venue) lines.push(`LOCATION:${escapeText(event.venue)}`);
  const description = [event.description, opts.url ? `Details: ${opts.url}` : ''].filter(Boolean).join('\n\n');
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  if (opts.url) lines.push(`URL:${opts.url}`);
  if (opts.organizerEmail) {
    lines.push(`ORGANIZER;CN=${escapeText(opts.organizerName || 'School')}:mailto:${opts.organizerEmail}`);
  }
  lines.push(`STATUS:${method === 'CANCEL' || event.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`);
  lines.push('TRANSP:TRANSPARENT', 'END:VEVENT', 'END:VCALENDAR');
  return lines.map(fold).join(CRLF) + CRLF;
};

module.exports = { buildIcs, escapeText, fold };
