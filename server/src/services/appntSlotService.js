/**
 * Slot availability for APPNT, with optional integrations:
 *   TMTBL — the host's teaching periods show as busy
 *   ATTND — a host marked absent for the day is flagged
 * Each integration is used only when its module is active and fails soft.
 */
const { normalizeTenantFeatureToggles } = require('../constants/tenantFeatures');
const { isModuleActive } = require('../constants/moduleModelKeys');
const { getTeacherBusyPeriods } = require('../modules/timetable/teacherSchedule');
const { ACTIVE_STATUSES, buildSlots } = require('../modules/appnt/lifecycle');

const moduleOn = (req, key) => isModuleActive(key, normalizeTenantFeatureToggles(req.tenant?.featureToggles));

const getSettings = async (req) => {
  const Settings = req.models.AppointmentSettings;
  return Settings.findOneAndUpdate({ key: 'default' }, { $setOnInsert: { key: 'default' } }, { new: true, upsert: true, setDefaultsOnInsert: true }).lean();
};

const teachingPeriods = async (req, host, date) => {
  if (!host.teacher || !moduleOn(req, 'timetable')) return [];
  try {
    return await getTeacherBusyPeriods(req.models, host.teacher, date);
  } catch (err) {
    console.warn(`[appnt] timetable lookup failed: ${err.message}`);
    return [];
  }
};

const isHostAbsent = async (req, host, date) => {
  const Daily = req.models.StaffAttendanceDaily;
  if (!host.teacher || !Daily || !moduleOn(req, 'attnd')) return false;
  try {
    return Boolean(await Daily.exists({ attendanceDate: date, staffId: host.teacher, status: 'A' }));
  } catch (err) {
    console.warn(`[appnt] attendance lookup failed: ${err.message}`);
    return false;
  }
};

/** Teacher ids marked absent on a date (for the day view). */
const absentTeacherIds = async (req, date, teacherIds) => {
  const Daily = req.models.StaffAttendanceDaily;
  if (!Daily || !teacherIds.length || !moduleOn(req, 'attnd')) return new Set();
  try {
    const rows = await Daily.find({ attendanceDate: date, staffId: { $in: teacherIds }, status: 'A' }).select('staffId').lean();
    return new Set(rows.map((row) => String(row.staffId)));
  } catch (err) {
    return new Set();
  }
};

/**
 * @param {object} options
 * @param {boolean} options.forPortal  apply notice and advance windows (staff bookings skip them)
 * @param {string}  [options.ignoreAppointmentId] when rescheduling, don't count the appointment itself
 */
const getSlots = async (req, host, date, { forPortal = false, ignoreAppointmentId = null } = {}) => {
  const settings = await getSettings(req);
  const filter = { host: host._id, date, status: { $in: ACTIVE_STATUSES } };
  if (ignoreAppointmentId) filter._id = { $ne: ignoreAppointmentId };
  const [appointments, busyPeriods, hostAbsent] = await Promise.all([
    req.models.Appointment.find(filter).select('startTime endTime status').lean(),
    teachingPeriods(req, host, date),
    isHostAbsent(req, host, date)
  ]);
  const result = buildSlots({
    host,
    date,
    appointments,
    busyPeriods,
    minNoticeHours: forPortal ? settings.minNoticeHours : 0,
    maxAdvanceDays: forPortal ? settings.maxAdvanceDays : 365
  });
  return { ...result, busyPeriods, hostAbsent, timetableLinked: moduleOn(req, 'timetable') && Boolean(host.teacher) };
};

module.exports = { getSettings, getSlots, absentTeacherIds, moduleOn };
