/**
 * APPNT domain rules: appointment statuses, allowed transitions and slot maths.
 * Pure functions only, so they can be unit tested without a database.
 */
const APPOINTMENT_STATUSES = Object.freeze(['requested', 'confirmed', 'checked_in', 'completed', 'declined', 'cancelled', 'no_show']);
const ACTIVE_STATUSES = Object.freeze(['requested', 'confirmed', 'checked_in']);
const VISITOR_TYPES = Object.freeze(['parent', 'visitor', 'staff', 'vendor', 'other']);
const APPOINTMENT_SOURCES = Object.freeze(['front_desk', 'host', 'portal', 'walk_in']);
const APPOINTMENT_MODES = Object.freeze(['in_person', 'phone', 'video']);
const DEFAULT_PURPOSES = Object.freeze(['Academic progress', 'Fees', 'Admission', 'Discipline', 'Transport', 'General']);

const TRANSITIONS = Object.freeze({
  requested: ['confirmed', 'declined', 'cancelled'],
  confirmed: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['completed'],
  completed: [],
  declined: [],
  cancelled: [],
  no_show: []
});

// Status an action moves an appointment to.
const ACTION_STATUS = Object.freeze({
  confirm: 'confirmed',
  decline: 'declined',
  'check-in': 'checked_in',
  complete: 'completed',
  'no-show': 'no_show',
  cancel: 'cancelled'
});

const SCHOOL_TIME_ZONE = 'Asia/Kolkata';

const error = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

const assertTransition = (from, to) => {
  if (!TRANSITIONS[from]?.includes(to)) {
    throw error(`This appointment is ${from.replace('_', ' ')} and can't be moved to ${to.replace('_', ' ')}.`, 409);
  }
};

const isActive = (status) => ACTIVE_STATUSES.includes(status);

const toMinutes = (time) => {
  const [h, m] = String(time || '').split(':').map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return NaN;
  return h * 60 + m;
};

const toTime = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

const slotKeyFor = (hostId, date, startTime) => `${hostId}|${date}|${startTime}`;

// "Now" in the school's time zone as { date: 'YYYY-MM-DD', minutes }.
const schoolNow = (now = new Date()) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: SCHOOL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
};

const dayOfWeek = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();

const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

/**
 * Builds the bookable slots for one host on one date.
 *
 * Each slot is { start, end, state, reason } where state is:
 *   free      — can be booked
 *   taken     — another active appointment holds it
 *   teaching  — overlaps a timetabled period (staff may override)
 *   past      — inside the notice window or already over
 *
 * Returns { slots, closed, reason } — closed when the host isn't available that day at all.
 */
const buildSlots = ({ host, date, appointments = [], busyPeriods = [], now = new Date(), minNoticeHours = 0, maxAdvanceDays = 365 }) => {
  if (!host || host.isActive === false) return { slots: [], closed: true, reason: 'This person is not taking appointments.' };
  const blocked = (host.blockedDates || []).find((row) => row.date === date);
  if (blocked) return { slots: [], closed: true, reason: blocked.reason || 'Not available on this date.' };

  const today = schoolNow(now);
  const ahead = daysBetween(today.date, date);
  if (ahead < 0) return { slots: [], closed: true, reason: 'This date has passed.' };
  if (ahead > maxAdvanceDays) return { slots: [], closed: true, reason: `Appointments open ${maxAdvanceDays} days ahead.` };

  const windows = (host.weeklyAvailability || []).filter((row) => row.day === dayOfWeek(date));
  if (!windows.length) return { slots: [], closed: true, reason: 'Not available on this day of the week.' };

  const length = Math.max(5, Number(host.slotMinutes) || 15);
  const step = length + Math.max(0, Number(host.bufferMinutes) || 0);
  // Minutes from today's midnight before which nothing can be booked.
  const earliest = today.minutes + Math.max(0, Number(minNoticeHours) || 0) * 60;

  const active = appointments.filter((row) => isActive(row.status));
  const dayFull = Number(host.maxPerDay) > 0 && active.length >= Number(host.maxPerDay);

  const slots = [];
  windows
    .map((row) => [toMinutes(row.start), toMinutes(row.end)])
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start)
    .sort((a, b) => a[0] - b[0])
    .forEach(([windowStart, windowEnd]) => {
      for (let start = windowStart; start + length <= windowEnd; start += step) {
        const end = start + length;
        const slot = { start: toTime(start), end: toTime(end), state: 'free', reason: '' };
        const tooSoon = ahead * 1440 + start < earliest;
        const holder = active.find((row) => overlaps(start, end, toMinutes(row.startTime), toMinutes(row.endTime)));
        const lesson = busyPeriods.find((row) => overlaps(start, end, toMinutes(row.start), toMinutes(row.end)));
        if (tooSoon) Object.assign(slot, { state: 'past', reason: 'Too soon to book' });
        else if (holder) Object.assign(slot, { state: 'taken', reason: 'Booked' });
        else if (dayFull) Object.assign(slot, { state: 'taken', reason: 'Day is fully booked' });
        else if (lesson) Object.assign(slot, { state: 'teaching', reason: lesson.label || 'Teaching' });
        slots.push(slot);
      }
    });
  return { slots, closed: false, reason: '' };
};

module.exports = {
  APPOINTMENT_STATUSES,
  ACTIVE_STATUSES,
  VISITOR_TYPES,
  APPOINTMENT_SOURCES,
  APPOINTMENT_MODES,
  DEFAULT_PURPOSES,
  ACTION_STATUS,
  SCHOOL_TIME_ZONE,
  assertTransition,
  isActive,
  toMinutes,
  toTime,
  overlaps,
  slotKeyFor,
  schoolNow,
  dayOfWeek,
  buildSlots
};
