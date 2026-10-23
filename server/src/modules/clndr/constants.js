/** Shared values for the calendar (CLNDR): school-day rules and calendar events. */

const RULE_KINDS = Object.freeze(['weekly_off', 'holiday', 'vacation', 'half_day', 'closure', 'working_day']);
const HOLIDAY_CATEGORIES = Object.freeze(['national', 'state', 'school', 'religious', 'other']);
const CLOSURE_MODES = Object.freeze(['closed', 'online', 'hybrid']);

const EVENT_CATEGORIES = Object.freeze([
  'exam', 'holiday', 'ptm', 'celebration', 'sports', 'trip', 'meeting', 'duty', 'health', 'deadline', 'other'
]);
const EVENT_STATUSES = Object.freeze(['draft', 'pending_approval', 'scheduled', 'published', 'cancelled']);
const VISIBILITY = Object.freeze(['segments', 'all_staff', 'whole_school']);
const PERSON_TYPES = Object.freeze(['parent', 'student', 'staff']);
// Who a segment is about. Family types (parent, student) use the student's class,
// section, house, route or admission number; staff use role, sections they teach,
// class-teacher sections or their bus route. `user` is one named login of any kind.
const SCOPE_TYPES = Object.freeze({
  parent: ['all', 'class', 'section', 'house', 'route', 'student', 'user'],
  student: ['all', 'class', 'section', 'house', 'route', 'student', 'user'],
  staff: ['all', 'role', 'class', 'section', 'classteacher', 'route', 'user']
});
const EVENT_ROLES = Object.freeze(['incharge', 'duty', 'participant', 'attendee', 'fyi']);
// now: in-app + email when the segment asks for it; in_app: bell only; silent: on the calendar, no ping.
const NOTIFY_LEVELS = Object.freeze(['now', 'in_app', 'silent']);
const REMINDER_PRESETS = Object.freeze({
  day_before_18: { label: '6 pm the day before', dayOffset: -1, hour: 18, lastHour: 23 },
  morning_07: { label: '7 am on the day', dayOffset: 0, hour: 7, lastHour: 11 }
});
const RESPONSE_TYPES = Object.freeze(['none', 'acknowledge', 'rsvp', 'consent']);
// What each response type accepts.
const RESPONSE_VALUES = Object.freeze(['acknowledged', 'yes', 'no', 'maybe', 'given', 'declined']);
const VALUES_FOR = Object.freeze({
  acknowledge: ['acknowledged'],
  rsvp: ['yes', 'no', 'maybe'],
  consent: ['given', 'declined']
});
const RECURRENCE_FREQS = Object.freeze(['daily', 'weekly', 'monthly']);

// Calendar layers: each item belongs to one, shown with a fixed tone and label.
const LAYERS = Object.freeze({
  school_days: { label: 'Holidays and closures', tone: 'danger' },
  events: { label: 'School events', tone: 'primary' },
  exams: { label: 'Exams', tone: 'warning' },
  duties: { label: 'My duties', tone: 'info' },
  fees: { label: 'Fees', tone: 'success' },
  appointments: { label: 'Appointments', tone: 'info' },
  activities: { label: 'Activities', tone: 'primary' }
});

module.exports = {
  RULE_KINDS,
  HOLIDAY_CATEGORIES,
  CLOSURE_MODES,
  EVENT_CATEGORIES,
  EVENT_STATUSES,
  VISIBILITY,
  PERSON_TYPES,
  SCOPE_TYPES,
  EVENT_ROLES,
  NOTIFY_LEVELS,
  REMINDER_PRESETS,
  RESPONSE_TYPES,
  RESPONSE_VALUES,
  VALUES_FOR,
  RECURRENCE_FREQS,
  LAYERS
};
