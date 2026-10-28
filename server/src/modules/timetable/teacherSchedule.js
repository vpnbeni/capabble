/**
 * A teacher's teaching periods on a given date, from the published timetable.
 *
 * Owned by the timetable module so other modules (e.g. appointments) can ask
 * "when is this teacher in class?" without knowing the grid format.
 * Grid cells name the teacher, so the Teacher id is mapped to a name through
 * TimetableState.teachers. Days the school is closed have no teaching; on a
 * half day, periods after school ends are dropped (modules/clndr/schoolDays).
 */
const schoolDays = require('../clndr/schoolDays');

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** A grid cell names one teacher, or two for a shared period ("Ms Rao/Mr Sen"). */
const cellHasTeacher = (cellTeacher, name) => String(cellTeacher || '').split('/')
  .some((part) => part.trim().toLowerCase() === String(name).trim().toLowerCase());

const toMinutes = (time) => {
  const [h, m] = String(time || '08:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
const toTime = (total) => `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

/** Period rows with clock times, computed from bell timings. */
const periodTimes = (bellTimings) => {
  let cursor = toMinutes(bellTimings?.startTime);
  return (bellTimings?.rows || []).map((row) => {
    const entry = { id: row.id, type: row.type, label: row.label, start: toTime(cursor), end: toTime(cursor + (Number(row.duration) || 0)) };
    cursor += Number(row.duration) || 0;
    return entry;
  });
};

/**
 * Pure part: busy periods for one teacher name on one weekday.
 * @returns {{ start: string, end: string, label: string }[]}
 */
const busyPeriodsFromGrid = ({ grid, bellTimings, teacherName, dayName, classes = [] }) => {
  if (!teacherName || !grid) return [];
  // Cells are keyed by teachable-period index ("0", "1", …), as the generator
  // and the web timetable write them; older grids may use the bell row id.
  const teachable = periodTimes(bellTimings).filter((row) => row.type !== 'break');
  const periods = new Map([
    ...teachable.map((row) => [row.id, row]),
    ...teachable.map((row, index) => [String(index), row])
  ]);
  const busy = [];
  Object.entries(grid).forEach(([classId, days]) => {
    const cell = (days || {})[dayName] || {};
    Object.entries(cell).forEach(([periodId, slot]) => {
      if (!slot || !cellHasTeacher(slot.teacher, teacherName) || !periods.has(periodId)) return;
      const period = periods.get(periodId);
      const cls = classes.find((row) => row.id === classId);
      const className = cls ? [cls.className, cls.section].filter(Boolean).join(' ') : '';
      busy.push({ start: period.start, end: period.end, label: [period.label, slot.subject, className].filter(Boolean).join(' · ') });
    });
  });
  return busy.sort((a, b) => a.start.localeCompare(b.start));
};

/**
 * Busy periods for a teacher on a date ('YYYY-MM-DD'). Returns [] when the
 * timetable module isn't active for the tenant or nothing is timetabled.
 * @param {object} models   req.models
 * @param {string} teacherId Teacher _id
 */
const getTeacherBusyPeriods = async (models, teacherId, date) => {
  const State = models?.TimetableState;
  const Version = models?.TimetableVersion;
  if (!State || !teacherId || !date) return [];
  const state = await State.findOne({}).sort({ updatedAt: -1 }).select('teachers classes bellTimings timetableGrid').lean();
  if (!state) return [];
  const teacher = (state.teachers || []).find((row) => String(row.id) === String(teacherId));
  if (!teacher) return [];
  const published = Version ? await Version.findOne({ status: 'published' }).sort({ publishedAt: -1 }).select('grid').lean() : null;
  const grid = published?.grid || state.timetableGrid || {};
  const dayName = DAY_NAMES[new Date(`${date}T00:00:00Z`).getUTCDay()];
  const day = await schoolDays.dayInfo(models, date).catch(() => null);
  if (day && !day.working) return [];
  const busy = busyPeriodsFromGrid({
    grid, bellTimings: state.bellTimings, teacherName: teacher.name, dayName, classes: state.classes
  });
  return day?.halfDayEndTime ? busy.filter((period) => period.start < day.halfDayEndTime) : busy;
};

/**
 * Pure part: one teacher's whole day on a weekday, period by period, for the
 * phone's "Your periods": each bell row as a class (subject, class, section),
 * a free period or a break. A shared period names both classes' cells; the
 * first one wins.
 */
const teacherDayFromGrid = ({ grid, bellTimings, teacherName, dayName, classes = [] }) => {
  let teachable = 0;
  return periodTimes(bellTimings).map((row) => {
    const base = { id: row.id, label: row.label || '', start: row.start, end: row.end };
    if (row.type === 'break') return { ...base, kind: 'break' };
    const slot = String(teachable++);
    let found = null;
    Object.entries(grid || {}).some(([classId, days]) => {
      const cell = ((days || {})[dayName] || {});
      const entry = cell[slot] || cell[row.id];
      if (!entry || !teacherName || !cellHasTeacher(entry.teacher, teacherName)) return false;
      const cls = classes.find((item) => item.id === classId);
      found = { subject: entry.subject || '', className: cls?.className || '', section: cls?.section || '' };
      return true;
    });
    return found ? { ...base, kind: 'class', ...found } : { ...base, kind: 'free' };
  });
};

const MAX_DAYS = 14;

/**
 * A teacher's days from `from` to `to` ('YYYY-MM-DD', at most 14 days): school days
 * (closed days have no periods; half days drop periods after school ends) and
 * their periods from the published timetable of the session.
 * @param {object} models  req.models
 * @param {object} filter  session filter for TimetableState / TimetableVersion
 * @returns {{ teacher: {id, name}|null, publishedAt: Date|null, days: object[] }}
 */
const getTeacherDays = async (models, teacherId, { from, to, filter = {} }) => {
  const State = models?.TimetableState;
  const Version = models?.TimetableVersion;
  const schoolDayMap = await schoolDays.range(models, from, to);
  const keys = Object.keys(schoolDayMap).sort();
  if (keys.length > MAX_DAYS) {
    throw Object.assign(new Error(`Ask for at most ${MAX_DAYS} days at a time`), { status: 400 });
  }

  const state = State && teacherId
    ? await State.findOne(filter).select('teachers classes bellTimings').lean()
    : null;
  const teacher = (state?.teachers || []).find((row) => String(row.id) === String(teacherId)) || null;
  const published = teacher && Version
    ? await Version.findOne({ ...filter, status: 'published' })
      .sort({ publishedAt: -1 })
      .select('grid publishedAt updatedAt')
      .lean()
    : null;

  const days = keys.map((date) => {
    const day = schoolDayMap[date];
    const dayName = DAY_NAMES[new Date(`${date}T00:00:00Z`).getUTCDay()];
    let periods = published && day.working
      ? teacherDayFromGrid({
        grid: published.grid,
        bellTimings: state.bellTimings,
        teacherName: teacher.name,
        dayName,
        classes: state.classes
      })
      : [];
    if (day.halfDayEndTime) periods = periods.filter((period) => period.start < day.halfDayEndTime);
    // A day with no class at all (e.g. Sunday in a Mon–Sat grid) has no periods to show.
    if (!periods.some((period) => period.kind === 'class')) periods = [];
    return {
      date,
      weekday: day.weekday,
      working: day.working,
      kind: day.kind,
      label: day.label,
      halfDayEndTime: day.halfDayEndTime || null,
      periods
    };
  });

  return {
    teacher: teacher ? { id: String(teacher.id), name: teacher.name } : null,
    publishedAt: published ? (published.publishedAt || published.updatedAt) : null,
    days
  };
};

module.exports = {
  getTeacherBusyPeriods, busyPeriodsFromGrid, teacherDayFromGrid, getTeacherDays, periodTimes, cellHasTeacher
};
