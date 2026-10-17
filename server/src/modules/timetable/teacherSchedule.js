/**
 * A teacher's teaching periods on a given date, from the published timetable.
 *
 * Owned by the timetable module so other modules (e.g. appointments) can ask
 * "when is this teacher in class?" without knowing the grid format.
 * Grid cells name the teacher, so the Teacher id is mapped to a name through
 * TimetableState.teachers.
 */
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
  const periods = new Map(periodTimes(bellTimings).filter((row) => row.type !== 'break').map((row) => [row.id, row]));
  const busy = [];
  Object.entries(grid).forEach(([classId, days]) => {
    const cell = (days || {})[dayName] || {};
    Object.entries(cell).forEach(([periodId, slot]) => {
      if (!slot || slot.teacher !== teacherName || !periods.has(periodId)) return;
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
  return busyPeriodsFromGrid({ grid, bellTimings: state.bellTimings, teacherName: teacher.name, dayName, classes: state.classes });
};

module.exports = { getTeacherBusyPeriods, busyPeriodsFromGrid, periodTimes };
