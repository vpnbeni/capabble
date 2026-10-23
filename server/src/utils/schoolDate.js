/**
 * School-local calendar days.
 *
 * A calendar day is a 'YYYY-MM-DD' key in the school's time zone (default
 * Asia/Kolkata), never the server's local day or the UTC day. Build keys with
 * dateKey(), do arithmetic on keys, and turn a key back into an instant only
 * with startOfDay(). The academic session runs 1 April to 31 March.
 */

const DEFAULT_TIME_ZONE = 'Asia/Kolkata';
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const SESSION_LABEL_PATTERN = /^(\d{4})-(\d{4})$/;
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_MS = 24 * 60 * 60 * 1000;

const isValidTimeZone = (timeZone) => {
  if (!timeZone || typeof timeZone !== 'string') return false;
  try {
    Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch (error) {
    return false;
  }
};

/** The time zone a school profile asks for, or the default when it is missing or invalid. */
const timeZoneOf = (profile) => (isValidTimeZone(profile?.timeZone) ? profile.timeZone : DEFAULT_TIME_ZONE);

const formatters = new Map();
const partsFormatter = (timeZone) => {
  if (!formatters.has(timeZone)) {
    formatters.set(timeZone, new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }));
  }
  return formatters.get(timeZone);
};

const zonedParts = (date, timeZone) => Object.fromEntries(
  partsFormatter(timeZone).formatToParts(date)
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, Number(part.value)])
);

/** True for a real calendar day written as 'YYYY-MM-DD'. */
const isDateKey = (value) => {
  const match = typeof value === 'string' && value.match(DATE_KEY_PATTERN);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
};

/**
 * The school-local day of an instant. A value that is already a day key is
 * returned unchanged; anything unparseable gives ''.
 */
const dateKey = (value = new Date(), timeZone = DEFAULT_TIME_ZONE) => {
  if (isDateKey(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
};

/** Today in the school's time zone. */
const today = (timeZone = DEFAULT_TIME_ZONE) => dateKey(new Date(), timeZone);

const keyToUtcDate = (key) => {
  if (!isDateKey(key)) throw new Error(`Invalid date key "${key}"`);
  return new Date(`${key}T00:00:00.000Z`);
};

/** The day key `days` days after (or before, when negative) `key`. */
const addDays = (key, days) => new Date(keyToUtcDate(key).getTime() + days * DAY_MS).toISOString().slice(0, 10);

/** Whole days from `fromKey` to `toKey` (negative when `toKey` is earlier). */
const daysBetween = (fromKey, toKey) => Math.round((keyToUtcDate(toKey) - keyToUtcDate(fromKey)) / DAY_MS);

/** 0 = Sunday … 6 = Saturday. */
const weekday = (key) => keyToUtcDate(key).getUTCDay();

const weekdayName = (key) => WEEKDAY_NAMES[weekday(key)];

/** Which occurrence of its weekday in the month the day is (1st Saturday = 1, 2nd = 2 …). */
const weekOfMonth = (key) => Math.ceil(Number(key.slice(8, 10)) / 7);

/** The instant the school day `key` starts, in the school's time zone. */
const startOfDay = (key, timeZone = DEFAULT_TIME_ZONE) => {
  const guess = keyToUtcDate(key).getTime();
  const offsetAt = (instant) => {
    const p = zonedParts(new Date(instant), timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - instant;
  };
  const first = guess - offsetAt(guess);
  // Re-check at the result so a zone whose offset changes that day still lands on local midnight.
  return new Date(guess - offsetAt(first));
};

/** Academic session label ('2026-2027') a school day belongs to. */
const sessionLabelFor = (key) => {
  if (!isDateKey(key)) return '';
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const startYear = month <= 3 ? year - 1 : year;
  return `${startYear}-${startYear + 1}`;
};

/** First and last school day of a session label: 1 April to 31 March. */
const sessionDates = (label) => {
  const match = typeof label === 'string' && label.match(SESSION_LABEL_PATTERN);
  if (!match) return null;
  return { startDate: `${match[1]}-04-01`, endDate: `${match[2]}-03-31` };
};

module.exports = {
  DEFAULT_TIME_ZONE,
  WEEKDAY_NAMES,
  isValidTimeZone,
  timeZoneOf,
  isDateKey,
  dateKey,
  today,
  addDays,
  daysBetween,
  weekday,
  weekdayName,
  weekOfMonth,
  startOfDay,
  sessionLabelFor,
  sessionDates
};
