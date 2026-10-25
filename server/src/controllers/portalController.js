/**
 * Parent / student portal (read-only). Mounted at /api/portal and reachable
 * only with a portal session (enforced by the tenant access gate).
 *
 * Every endpoint resolves the student from the signed-in account's own links.
 * A studentId in the URL only selects among those links; anything else is 404,
 * so one family can never read another family's child.
 */
const asyncHandler = require('../middleware/asyncHandler');
const { setRequestContext } = require('../tenancy/requestContext');
const { USER_KINDS } = require('../rbac/permissions');
const { featureOn, portalSections, openSections } = require('../rbac/portalSections');
const { buildClassPDFContext } = require('../services/timetableExportService');
const { buildCardData } = require('./reportCardController');
const { receiptPdf } = require('./cpitl/collectionController');
const { onlinePaymentStatus } = require('./portalPaymentController');
const { sectionKey, classNameRegex, normalizeClassName } = require('../rbac/scope');
const schoolDays = require('../modules/clndr/schoolDays');
const schoolDate = require('../utils/schoolDate');
const { withEffectiveDueDates, dueDateOf } = require('../modules/cpitl/dueDates');
const {
  closeStaleTrips, serviceDate, sortedStops, publicStop, staleSeconds
} = require('../modules/trnst/trips');

const STUDENT_FIELDS = 'name rollNumber class section classRollNo gender dateOfBirth fatherName motherName '
  + 'guardianName guardianPhone guardianEmail email phone house busNo profileImage address admissionDate isActive';

const notFound = (res, message = 'Not found.') => res.status(404).json({ success: false, message });
const unavailable = (res, message) => res.status(404).json({ success: false, message, errorCode: 'not_available' });

const pad2 = (value) => String(value).padStart(2, '0');
const monthKey = (date = new Date()) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
const dateKey = (date = new Date()) => `${monthKey(date)}-${pad2(date.getDate())}`;

const canOpen = (req, section) => portalSections(req.user.kind).includes(section);

/**
 * Pin the request to the school's current academic session so session-scoped
 * models return this year's records.
 */
const usePortalSession = asyncHandler(async (req, res, next) => {
  const { AcademicSession } = req.models || {};
  let label = null;
  if (AcademicSession) {
    const current = await AcademicSession.findOne({ isCurrent: true }).select('label').lean();
    label = current?.label || AcademicSession.currentLabel();
  }
  if (label) {
    req.academicSession = label;
    setRequestContext({ academicSession: label });
  }
  next();
});

/** Resolve `:studentId` against the account's own links. */
const loadLinkedStudent = asyncHandler(async (req, res, next) => {
  const links = req.user.linkedStudents || [];
  const link = links.find((entry) => String(entry.student) === String(req.params.studentId));
  const { Student } = req.models || {};
  if (!link || !Student) return notFound(res, 'Student not found.');

  // Admission number is stable across sessions; fall back to the linked record.
  const student = await Student.findOne({ rollNumber: link.rollNumber }).select(STUDENT_FIELDS).lean()
    || await Student.findById(link.student).select(STUDENT_FIELDS).lean();
  if (!student || student.rollNumber !== link.rollNumber) return notFound(res, 'Student not found.');

  req.portalStudent = student;
  req.portalLink = link;
  return next();
});

// GET /api/portal/home — school details, children and which sections are open
const getHome = asyncHandler(async (req, res) => {
  const { SchoolProfile, Student } = req.models || {};
  const links = req.user.linkedStudents || [];
  const [school, students] = await Promise.all([
    SchoolProfile ? SchoolProfile.findOne({}).select('schoolName logoUrl address contact email tagline').lean() : null,
    Student && links.length
      ? Student.find({ rollNumber: { $in: links.map((link) => link.rollNumber) } }).select('name rollNumber class section profileImage').lean()
      : []
  ]);
  const byRoll = new Map(students.map((student) => [student.rollNumber, student]));

  const sections = openSections(req, req.user.kind);

  res.json({
    success: true,
    data: {
      kind: req.user.kind,
      academicSession: req.academicSession || null,
      school: school ? {
        name: school.schoolName || req.tenant?.name || '',
        logoUrl: school.logoUrl || null,
        address: school.address || '',
        phone: school.contact || '',
        email: school.email || ''
      } : { name: req.tenant?.name || '' },
      sections,
      students: links.map((link) => {
        const student = byRoll.get(link.rollNumber);
        return {
          studentId: link.student,
          rollNumber: link.rollNumber,
          relation: link.relation || '',
          name: student?.name || '',
          className: student?.class || '',
          section: student?.section || '',
          profileImage: student?.profileImage || null
        };
      })
    }
  });
});

// GET /api/portal/students/:studentId/profile
const getProfile = asyncHandler(async (req, res) => {
  const s = req.portalStudent;
  res.json({
    success: true,
    data: {
      studentId: req.portalLink.student,
      name: s.name,
      rollNumber: s.rollNumber,
      className: s.class,
      section: s.section,
      classRollNo: s.classRollNo || null,
      gender: s.gender || '',
      dateOfBirth: s.dateOfBirth || null,
      admissionDate: s.admissionDate || null,
      house: s.house || '',
      busNo: s.busNo || '',
      fatherName: s.fatherName || '',
      motherName: s.motherName || '',
      guardianName: s.guardianName || '',
      guardianPhone: s.guardianPhone || '',
      guardianEmail: s.guardianEmail || '',
      email: s.email || '',
      phone: s.phone || '',
      address: s.address || null,
      profileImage: s.profileImage || null
    }
  });
});

// GET /api/portal/students/:studentId/attendance?month=YYYY-MM
const getAttendance = asyncHandler(async (req, res) => {
  if (!canOpen(req, 'attendance') || !featureOn(req, 'attnd_student_attendance')) {
    return unavailable(res, 'Attendance is not available.');
  }
  const { StudentAttendanceDaily, StudentAttendanceDay } = req.models || {};
  if (!StudentAttendanceDaily) return unavailable(res, 'Attendance is not available.');

  const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? req.query.month : monthKey();
  const student = req.portalStudent;
  const monthPattern = new RegExp(`^${month}-`);

  const [records, daySettings] = await Promise.all([
    StudentAttendanceDaily.find({ studentId: student._id, attendanceDate: monthPattern })
      .select('attendanceDate status remarks').lean(),
    StudentAttendanceDay
      ? StudentAttendanceDay.find({ attendanceDate: monthPattern }).select('attendanceDate category className section').lean()
      : []
  ]);

  // Only absences (and half days) are stored; every other school day counts as present.
  const ownSection = sectionKey(student.class, student.section);
  const holidays = new Set(daySettings
    .filter((day) => day.category === 'non-academic' && sectionKey(day.className, day.section) === ownSection)
    .map((day) => day.attendanceDate));
  const marks = new Map(records.map((record) => {
    const status = String(record.status || 'A').toUpperCase();
    const halfDay = status === 'HD' || status === 'H' || /half/i.test(String(record.remarks || ''));
    return [record.attendanceDate, halfDay ? 'half_day' : 'absent'];
  }));

  const [year, monthNumber] = month.split('-').map(Number);
  const today = dateKey();
  const lastDay = `${month}-${pad2(new Date(year, monthNumber, 0).getDate())}`;
  // Weekly offs, holidays and closures for this child's class come from the school calendar.
  const calendar = await schoolDays.range(req.models, `${month}-01`, lastDay, { className: student.class, section: student.section })
    .catch(() => null);
  const days = Array.from({ length: new Date(year, monthNumber, 0).getDate() }, (_, index) => {
    const key = `${month}-${pad2(index + 1)}`;
    const day = calendar?.[key];
    let status = 'present';
    if (key > today) status = 'upcoming';
    else if (day ? day.kind === 'weekly_off' : new Date(`${key}T00:00:00`).getDay() === 0) status = 'weekly_off';
    else if (holidays.has(key) || (day && !day.working)) status = 'holiday';
    else if (marks.has(key)) status = marks.get(key);
    return { date: key, status, ...(day && day.kind !== 'working' && day.label ? { label: day.label } : {}) };
  });

  const count = (status) => days.filter((day) => day.status === status).length;
  // Not `schoolDays`: that name is the calendar module used above, and shadowing it made
  // every request fail before the calendar was read.
  const schoolDayCount = count('present') + count('absent') + count('half_day');
  const attended = count('present') + count('half_day') * 0.5;

  return res.json({
    success: true,
    data: {
      month,
      days,
      summary: {
        schoolDays: schoolDayCount,
        present: count('present'),
        absent: count('absent'),
        halfDays: count('half_day'),
        holidays: count('holiday'),
        percentage: schoolDayCount > 0 ? Math.round((attended / schoolDayCount) * 1000) / 10 : null
      }
    }
  });
});

// GET /api/portal/students/:studentId/timetable
const getTimetable = asyncHandler(async (req, res) => {
  if (!canOpen(req, 'timetable') || !featureOn(req, 'timetable_classes', 'timetable_class_wise')) {
    return unavailable(res, 'The timetable is not available.');
  }
  const { TimetableVersion, TimetableState } = req.models || {};
  if (!TimetableVersion || !TimetableState) return unavailable(res, 'The timetable is not available.');

  const sessionFilter = { academicSession: req.academicSession || null };
  const [version, state] = await Promise.all([
    TimetableVersion.findOne({ ...sessionFilter, status: 'published' }).sort({ updatedAt: -1 }).lean(),
    TimetableState.findOne(sessionFilter).select('classes bellTimings').lean()
  ]);
  if (!version || !state) return res.json({ success: true, data: null });

  const student = req.portalStudent;
  const own = sectionKey(student.class, student.section);
  const cls = (state.classes || []).find((entry) => sectionKey(entry.className, entry.section) === own);
  if (!cls) return res.json({ success: true, data: null });

  const context = buildClassPDFContext([cls], version.grid || {}, state);
  return res.json({
    success: true,
    data: {
      className: cls.className,
      section: cls.section,
      classTeacher: cls.incharge || '',
      publishedAt: version.publishedAt || version.updatedAt,
      periods: context.periods,
      days: context.classes[0]?.days || []
    }
  });
});

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// GET /api/portal/students/:studentId/homework — the class's published homework, due in the last
// two weeks or later, with this student's own submission mark when the teacher has recorded one.
const HOMEWORK_FIELDS = 'title subjectName subject teacherName assignedDate date dueDate '
  + 'instructions description status submissions';

const getHomework = asyncHandler(async (req, res) => {
  const Homework = req.models?.AcademicHomework;
  if (!canOpen(req, 'homework') || !featureOn(req, 'acdmc_academics') || !Homework) {
    return unavailable(res, 'Homework is not available.');
  }
  const student = req.portalStudent;
  if (!student.class || !student.section) return res.json({ success: true, data: [] });
  const from = schoolDate.addDays(schoolDate.today(), -14);
  const rows = await Homework.find({
    $and: [
      { isActive: { $ne: false } },
      { status: { $in: ['published', 'closed'] } },
      { className: classNameRegex(normalizeClassName(student.class)) },
      { section: new RegExp(`^\\s*${escapeRegex(String(student.section).trim())}\\s*$`, 'i') },
      { $or: [{ dueDate: { $gte: from } }, { date: { $gte: from } }] }
    ]
  })
    .select(HOMEWORK_FIELDS)
    .sort({ dueDate: 1 })
    .limit(100)
    .lean();
  const own = String(student._id);
  res.json({
    success: true,
    data: rows.map((row) => {
      const mine = (row.submissions || []).find((entry) => String(entry.studentId) === own);
      return {
        id: String(row._id),
        title: row.title,
        subjectName: row.subjectName || row.subject || '',
        teacherName: row.teacherName || '',
        assignedDate: row.assignedDate || row.date || '',
        dueDate: row.dueDate || row.date || '',
        instructions: row.instructions || row.description || '',
        status: row.status,
        submission: mine && mine.status !== 'pending' ? { status: mine.status, remark: mine.remark || '' } : null
      };
    })
  });
});

// GET /api/portal/students/:studentId/results
const getResults = asyncHandler(async (req, res) => {
  if (!canOpen(req, 'results') || !featureOn(req, 'exmcl_exams', 'exmcl_result')) {
    return unavailable(res, 'Results are not available.');
  }
  const { ExamDefinition, ExamResult } = req.models || {};
  if (!ExamDefinition || !ExamResult) return unavailable(res, 'Results are not available.');

  const exams = await ExamDefinition.find({ isActive: true, resultsPublished: true })
    .select('name code maximumMarks displayOrder resultsPublishedAt')
    .sort({ displayOrder: 1, createdAt: 1 })
    .lean();
  if (exams.length === 0) return res.json({ success: true, data: [] });

  const student = req.portalStudent;
  const results = await ExamResult.find({ studentId: student._id, examId: { $in: exams.map((exam) => exam._id) } }).lean();
  const resultByExam = new Map(results.map((result) => [String(result.examId), result]));

  const cards = await Promise.all(exams
    .filter((exam) => resultByExam.has(String(exam._id)))
    .map(async (exam) => {
      const result = resultByExam.get(String(exam._id));
      const card = await buildCardData(req, student, exam, result);
      return {
        examId: exam._id,
        examName: exam.name,
        publishedAt: exam.resultsPublishedAt,
        absent: Boolean(result.absent),
        absentSubjects: result.absentSubjects || [],
        subjects: card.subjects.map(({ name, role, maxMarks, marksObtained, grade }) => ({
          name, role, maxMarks, marksObtained, grade
        })),
        total: card.grandObtained,
        maxTotal: card.grandMax,
        percentage: card.percentage,
        grade: card.overallGrade
      };
    }));

  return res.json({ success: true, data: cards });
});

const loadFeeAccount = async (req) => {
  const { StudentFeeAccount } = req.models || {};
  if (!StudentFeeAccount) return null;
  return StudentFeeAccount.findOne({ student: req.portalStudent._id }).lean();
};

// GET /api/portal/students/:studentId/fees (parents only)
const getFees = asyncHandler(async (req, res) => {
  if (req.user.kind !== USER_KINDS.PARENT || !canOpen(req, 'fees') || !featureOn(req, 'cpitl_fees')) {
    return unavailable(res, 'Fees are not available.');
  }
  const { FeeDemand, FeePayment } = req.models || {};
  const account = await loadFeeAccount(req);
  if (!account || !FeeDemand || !FeePayment) return res.json({ success: true, data: null });

  const [storedDemands, payments] = await Promise.all([
    FeeDemand.find({ accountId: account._id, status: { $ne: 'waived' } })
      .select('label periodKey dueDate total paid balance status lines.name lines.net')
      .sort({ dueDate: 1 }).lean(),
    FeePayment.find({ accountId: account._id, status: 'valid' })
      .select('receiptNo date mode total feeAmount lateFeeCollected')
      .sort({ date: -1 }).lean()
  ]);
  const now = new Date();
  const [demands, onlinePayment] = await Promise.all([withEffectiveDueDates(req.models, storedDemands), onlinePaymentStatus(req)]);

  return res.json({
    success: true,
    data: {
      totals: {
        demanded: account.totals?.demanded || 0,
        paid: account.totals?.paid || 0,
        balance: account.totals?.balance || 0
      },
      demands: demands.map((demand) => ({
        _id: demand._id,
        label: demand.label || demand.periodKey,
        dueDate: dueDateOf(demand),
        ...(demand.dueDateMovedFrom ? { dueDateMovedFrom: demand.dueDateMovedFrom } : {}),
        total: demand.total,
        paid: demand.paid,
        balance: demand.balance,
        status: demand.status,
        isOverdue: demand.balance > 0 && demand.dueDate && new Date(dueDateOf(demand)) < now,
        lines: (demand.lines || []).map((line) => ({ name: line.name, amount: line.net }))
      })),
      payments: payments.map((payment) => ({
        _id: payment._id,
        receiptNo: payment.receiptNo,
        date: payment.date,
        mode: payment.mode,
        amount: payment.total ?? (Number(payment.feeAmount || 0) + Number(payment.lateFeeCollected || 0))
      })),
      // Whether the school takes fees online (its own Razorpay account).
      onlinePayment
    }
  });
});

// GET /api/portal/students/:studentId/fees/receipts/:paymentId (PDF, parents only)
const getReceiptPdf = asyncHandler(async (req, res, next) => {
  if (req.user.kind !== USER_KINDS.PARENT || !featureOn(req, 'cpitl_fees')) {
    return unavailable(res, 'Fees are not available.');
  }
  const { FeePayment } = req.models || {};
  const payment = FeePayment
    ? await FeePayment.findOne({ _id: req.params.paymentId, student: req.portalStudent._id, status: 'valid' }).select('_id').lean()
    : null;
  if (!payment) return notFound(res, 'Receipt not found.');
  req.params.id = String(payment._id);
  return receiptPdf(req, res, next);
});

// GET /api/portal/notices
const listNotices = asyncHandler(async (req, res) => {
  const { ExamCircular } = req.models || {};
  if (!canOpen(req, 'notices') || !ExamCircular || !featureOn(req, 'exmcl_centre_guidelines')) {
    return res.json({ success: true, data: [] });
  }
  const notices = await ExamCircular.find({ status: 'published', isActive: { $ne: false } })
    .select('title circularDate publishedAt referenceSeries referenceNumber')
    .sort({ circularDate: -1, publishedAt: -1 })
    .limit(50)
    .lean();
  res.json({ success: true, data: notices });
});

// GET /api/portal/notices/:id
const getNotice = asyncHandler(async (req, res) => {
  const { ExamCircular } = req.models || {};
  if (!canOpen(req, 'notices') || !ExamCircular || !featureOn(req, 'exmcl_centre_guidelines')) {
    return notFound(res, 'Notice not found.');
  }
  const notice = await ExamCircular.findOne({ _id: req.params.id, status: 'published', isActive: { $ne: false } })
    .select('title content circularDate publishedAt referenceSeries referenceNumber')
    .lean();
  if (!notice) return notFound(res, 'Notice not found.');
  return res.json({ success: true, data: notice });
});

const transportOpen = (req) => canOpen(req, 'transport') && featureOn(req, 'trnst_transport');

/** The child's bus: from their route assignment, else the old free-text bus number. */
const resolveStudentTransport = async (models, student) => {
  const { TransportVehicle, TransportRoute, TransportAssignment } = models;
  const assignment = TransportAssignment
    ? await TransportAssignment.findOne({ studentId: student._id, isActive: true }).lean()
    : null;
  if (assignment && TransportRoute) {
    const route = await TransportRoute.findOne({ _id: assignment.routeId, isActive: { $ne: false } })
      .select('name code vehicleId stops').lean();
    if (route) {
      const vehicle = route.vehicleId && TransportVehicle
        ? await TransportVehicle.findById(route.vehicleId)
          .select('busNo registrationNumber driverName driverPhone conductorName conductorPhone status').lean()
        : null;
      return { assignment, vehicle, routes: [route] };
    }
  }
  if (!student.busNo || !TransportVehicle) return { assignment: null, vehicle: null, routes: [] };
  const vehicle = await TransportVehicle.findOne({ busNo: student.busNo })
    .select('busNo registrationNumber driverName driverPhone conductorName conductorPhone status').lean();
  const routes = vehicle && TransportRoute
    ? await TransportRoute.find({ vehicleId: vehicle._id, isActive: true }).select('name code vehicleId stops').lean()
    : [];
  return { assignment: null, vehicle, routes };
};

// GET /api/portal/students/:studentId/transport
const getTransport = asyncHandler(async (req, res) => {
  if (!transportOpen(req)) return unavailable(res, 'Transport is not available.');
  const { TransportSelfStudent } = req.models || {};
  const student = req.portalStudent;

  const selfTransport = TransportSelfStudent
    ? await TransportSelfStudent.findOne({ studentId: student._id, isActive: { $ne: false } }).select('commuteMode').lean()
    : null;
  if (selfTransport) return res.json({ success: true, data: { usesSchoolTransport: false, commuteMode: selfTransport.commuteMode } });

  const { assignment, vehicle, routes } = await resolveStudentTransport(req.models || {}, student);
  if (!assignment && !student.busNo) return res.json({ success: true, data: { usesSchoolTransport: false } });

  return res.json({
    success: true,
    data: {
      usesSchoolTransport: true,
      busNo: vehicle?.busNo || student.busNo || '',
      myStop: assignment ? {
        id: assignment.stopId ? String(assignment.stopId) : '',
        name: assignment.stopName || '',
        shift: assignment.shift
      } : null,
      vehicle: vehicle ? {
        registrationNumber: vehicle.registrationNumber || '',
        driverName: vehicle.driverName || '',
        driverPhone: vehicle.driverPhone || '',
        conductorName: vehicle.conductorName || '',
        conductorPhone: vehicle.conductorPhone || ''
      } : null,
      routes: routes.map((route) => ({
        name: route.name,
        stops: sortedStops(route)
          .map(({ _id, name, landmark, pickupTime, dropTime }) => ({
            id: _id ? String(_id) : '', name, landmark, pickupTime, dropTime
          }))
      }))
    }
  });
});

/** A student who rides only one way should only see trips in that direction. */
const directionFor = (shift) => (shift === 'both' ? {} : { direction: shift });

// GET /api/portal/students/:studentId/transport/live — where the child's bus is now.
// The location is shared only while the bus is on a trip on the child's route.
const getTransportLive = asyncHandler(async (req, res) => {
  if (!transportOpen(req)) return unavailable(res, 'Transport is not available.');
  const { TransportTrip, TransportBoarding } = req.models || {};
  const student = req.portalStudent;
  const { assignment, vehicle, routes } = await resolveStudentTransport(req.models || {}, student);
  const route = assignment ? routes[0] : null;
  if (!route || !TransportTrip) {
    return res.json({ success: true, data: { active: false, assigned: Boolean(assignment) } });
  }

  await closeStaleTrips(TransportTrip, { routeId: route._id });
  const trip = await TransportTrip.findOne({ routeId: route._id, status: 'active', ...directionFor(assignment.shift) })
    .sort({ startedAt: -1 }).lean();
  const today = serviceDate();
  const todaysTrips = trip
    ? [trip]
    : await TransportTrip.find({ routeId: route._id, serviceDate: today }).select('_id').lean();
  const tripIds = todaysTrips.map((row) => row._id);
  const marks = TransportBoarding && tripIds.length
    ? await TransportBoarding.find({ tripId: { $in: tripIds }, studentId: student._id })
      .select('event at tripId').sort({ at: 1 }).lean()
    : [];
  const now = new Date();

  return res.json({
    success: true,
    data: {
      active: Boolean(trip),
      assigned: true,
      busNo: vehicle?.busNo || '',
      route: { name: route.name, code: route.code },
      stops: sortedStops(route).map(publicStop),
      myStopId: assignment.stopId ? String(assignment.stopId) : '',
      trip: trip ? {
        direction: trip.direction,
        startedAt: trip.startedAt,
        bus: trip.lastLocation ? {
          lat: trip.lastLocation.lat,
          lng: trip.lastLocation.lng,
          heading: trip.lastLocation.heading,
          speed: trip.lastLocation.speed,
          at: trip.lastLocation.at
        } : null,
        staleSeconds: staleSeconds(trip, now)
      } : null,
      today: marks.map((mark) => ({ event: mark.event, at: mark.at }))
    }
  });
});

module.exports = {
  usePortalSession,
  loadLinkedStudent,
  getHome,
  getProfile,
  getAttendance,
  getTimetable,
  getHomework,
  getResults,
  getFees,
  getReceiptPdf,
  listNotices,
  getNotice,
  getTransport,
  getTransportLive
};
