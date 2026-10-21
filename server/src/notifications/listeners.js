/**
 * Turns event-bus events into in-app notifications. Each handler works out who
 * should hear about it and hands the facts to send() — the copy lives in templates.js.
 *
 * Handlers run after the response has gone (eventBus dispatches via setImmediate)
 * and inside the request's context, so session-scoped models see this year's data.
 */
const mongoose = require('mongoose');
const EVENTS = require('../events/eventNames');
const { USER_KINDS, customRoleId } = require('../rbac/permissions');
const { send, modelsFor } = require('./send');
const recipients = require('./recipients');

const notMe = (actorId) => (user) => !actorId || String(user._id) !== String(actorId);
const diff = (a = [], b = []) => a.filter((x) => !b.includes(x));
const istDate = (offsetDays = 0) => new Date(Date.now() + 5.5 * 3600 * 1000 + offsetDays * 86400 * 1000).toISOString().slice(0, 10);

const customRoleNames = async (models, keys = []) => {
  const ids = keys.map(customRoleId).filter(Boolean);
  if (!ids.length) return {};
  const roles = await models.Role.find({ _id: { $in: ids } }).select('name').lean();
  return Object.fromEntries(roles.map((role) => [`custom:${role._id}`, role.name]));
};

// ── Logins and access ─────────────────────────────────────────────────────
const onAccountChanged = async ({ tenant, userId, change, actorId, actorName, ...details }) => {
  const models = modelsFor(tenant, ['Student']);
  const user = await models.User.findById(userId).select('name email username kind roles role teacher linkedStudents isActive').lean();
  if (!user || user.isActive === false) return;
  const by = String(actorId || '') === String(user._id) ? '' : actorName;

  switch (change) {
  case 'created': {
    const rolls = (user.linkedStudents || []).map((l) => l.rollNumber);
    const students = rolls.length ? await recipients.loadStudents(models, { rollNumber: { $in: rolls } }) : [];
    await send(tenant, [user], 'user.welcome', {
      roles: user.roles || [],
      customRoleNames: await customRoleNames(models, user.roles),
      sections: details.sections || [],
      studentsByRoll: Object.fromEntries(students.map((s) => [s.rollNumber, s.name]))
    });
    break;
  }
  case 'roles_changed': {
    const from = details.from || [];
    const to = details.to || [];
    await send(tenant, [user], 'user.roles_changed', {
      added: diff(to, from),
      removed: diff(from, to),
      customRoleNames: await customRoleNames(models, [...from, ...to]),
      by
    });
    break;
  }
  case 'students_linked': {
    const students = await recipients.loadStudents(models, { rollNumber: { $in: details.rollNumbers || [] } });
    await send(tenant, [user], 'user.students_linked', {
      studentsByRoll: Object.fromEntries(students.map((s) => [s.rollNumber, s.name]))
    });
    break;
  }
  case 'reactivated':
    await send(tenant, [user], 'user.reactivated', {});
    break;
  case 'password_reset':
    await send(tenant, [user], 'user.password_reset', { by });
    break;
  case 'password_changed':
    await send(tenant, [user], 'user.password_changed', {});
    break;
  case 'signed_out_everywhere':
    await send(tenant, [user], 'user.signed_out_everywhere', { by });
    break;
  default:
  }
};

const onRolePermissionsChanged = async ({ tenant, roleKey, roleName, actorId }) => {
  const models = modelsFor(tenant);
  const holders = (await recipients.usersWithRole(models, roleKey)).filter(notMe(actorId));
  await send(tenant, holders, 'user.role_permissions_changed', { roleName });
};

// ── Appointments ──────────────────────────────────────────────────────────
const onAppointment = async ({ tenant, appointmentId, event, actorId, notifyHost = true }) => {
  const models = modelsFor(tenant, ['Appointment', 'AppointmentHost']);
  const appointment = await models.Appointment.findById(appointmentId).lean();
  if (!appointment) return;
  const host = await models.AppointmentHost.findById(appointment.host).select('user teacher').lean();
  const data = {
    appointmentId: String(appointment._id),
    event,
    at: new Date(appointment.updatedAt || Date.now()).toISOString(),
    appointment,
    entity: { type: 'appointment', id: String(appointment._id) }
  };
  const roll = appointment.studentSnapshot?.rollNumber;
  if (roll) data.studentsByRoll = { [roll.toUpperCase()]: appointment.studentSnapshot.name };

  // The family: whoever asked from the portal, else the parents of the student it is about.
  let family = appointment.requestedBy ? await recipients.byIds(models, [appointment.requestedBy]) : [];
  family = family.filter((u) => u.kind !== USER_KINDS.STAFF);
  if (!family.length && appointment.visitorType === 'parent' && roll) {
    family = await recipients.familyForRollNumbers(models, [roll], { kinds: [USER_KINDS.PARENT] });
  }
  await send(tenant, family.filter(notMe(actorId)), 'appnt.family_update', data);

  if (!notifyHost) return;
  let hostUsers = [];
  if (host?.user) hostUsers = await recipients.byIds(models, [host.user]);
  else if (host?.teacher) hostUsers = await recipients.usersForTeachers(models, [host.teacher]);
  await send(tenant, hostUsers.filter(notMe(actorId)), 'appnt.host_update', data);
};

// ── Exams ─────────────────────────────────────────────────────────────────
const onResultsPublished = async ({ tenant, examId, examName }) => {
  const models = modelsFor(tenant, ['Student', 'ExamResult']);
  const studentIds = await models.ExamResult.distinct('studentId', { examId });
  if (!studentIds.length) return;
  const students = await recipients.loadStudents(models, { _id: { $in: studentIds } });
  const { users, studentsByRoll } = await recipients.familyFor(models, students);
  await send(tenant, users, 'exams.results_published', { examId: String(examId), examName, studentsByRoll, entity: { type: 'exam', id: String(examId) } });
};

const onNoticePublished = async ({ tenant, circularId, title }) => {
  const models = modelsFor(tenant);
  const families = await models.User.find({ kind: { $in: recipients.FAMILY_KINDS }, isActive: { $ne: false } }).select('name kind linkedStudents isActive').lean();
  await send(tenant, families, 'exams.notice_published', { circularId: String(circularId), title });
};

const onDutyAssigned = async ({ tenant, examDate }) => {
  if (!examDate) return;
  const models = modelsFor(tenant, ['DutyAssignment', 'Room', 'Teacher']);
  const start = new Date(`${examDate}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 86400 * 1000);
  const duties = await models.DutyAssignment.find({ examDate: { $gte: start, $lt: end }, isActive: true })
    .select('room functionary functionary2')
    .populate('room', 'roomNo')
    .lean();
  const roomByTeacher = new Map();
  duties.forEach((duty) => [duty.functionary, duty.functionary2].filter(Boolean).forEach((t) => roomByTeacher.set(String(t), duty.room?.roomNo || '')));
  const users = await recipients.usersForTeachers(models, [...roomByTeacher.keys()]);
  await Promise.all(users.map((user) => send(tenant, [user], 'exams.duty_assigned', { examDate, roomNo: roomByTeacher.get(String(user.teacher)) })));
};

// ── Timetable ─────────────────────────────────────────────────────────────
const onTimetablePublished = async ({ tenant, versionId, versionName }) => {
  const models = modelsFor(tenant, ['Student']);
  const [staff, students] = await Promise.all([
    recipients.teachingStaff(models),
    recipients.loadStudents(models, { isActive: { $ne: false } })
  ]);
  const { users: families, studentsByRoll } = await recipients.familyFor(models, students);
  await send(tenant, [...staff, ...families], 'timetable.published', { versionId, versionName, studentsByRoll });
};

// ── Fees and salary ───────────────────────────────────────────────────────
const paymentFacts = async (models, paymentId) => {
  const payment = await models.FeePayment.findById(paymentId).select('receiptNo total student studentSnapshot').lean();
  if (!payment) return null;
  const roll = payment.studentSnapshot?.rollNumber;
  const users = roll ? await recipients.familyForRollNumbers(models, [roll], { kinds: [USER_KINDS.PARENT] }) : [];
  return {
    users,
    data: {
      paymentId: String(payment._id),
      receiptNo: payment.receiptNo,
      amount: payment.total,
      studentsByRoll: roll ? { [roll.toUpperCase()]: payment.studentSnapshot.name } : {},
      entity: { type: 'fee_payment', id: String(payment._id) }
    }
  };
};

const onFeePaymentRecorded = async ({ tenant, paymentId }) => {
  const models = modelsFor(tenant, ['FeePayment']);
  const facts = await paymentFacts(models, paymentId);
  if (facts) await send(tenant, facts.users, 'fees.payment_recorded', facts.data);
};

const onFeePaymentCancelled = async ({ tenant, paymentId, reason }) => {
  const models = modelsFor(tenant, ['FeePayment']);
  const facts = await paymentFacts(models, paymentId);
  if (facts) await send(tenant, facts.users, 'fees.payment_cancelled', { ...facts.data, reason });
};

const monthLabel = (month) => {
  const [y, m] = String(month || '').split('-').map(Number);
  if (!y || !m) return String(month || '');
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

const payrollHandler = (kind) => async ({ tenant, runId }) => {
  const models = modelsFor(tenant, ['PayrollRun']);
  const run = await models.PayrollRun.findById(runId).select('month paidOn payslips.teacherId payslips.net').lean();
  if (!run) return;
  const netByTeacher = new Map(run.payslips.filter((p) => p.teacherId).map((p) => [String(p.teacherId), p.net]));
  const users = await recipients.usersForTeachers(models, [...netByTeacher.keys()]);
  await Promise.all(users.map((user) => send(tenant, [user], kind, {
    month: run.month,
    monthLabel: monthLabel(run.month),
    net: netByTeacher.get(String(user.teacher)),
    paidOn: run.paidOn
  })));
};

// ── Attendance ────────────────────────────────────────────────────────────
const onStudentsAbsent = async ({ tenant, date, studentIds = [] }) => {
  // Only today's (or yesterday's late) register; corrections to older days stay quiet.
  if (!date || date < istDate(-1) || date > istDate(0) || !studentIds.length) return;
  const ids = studentIds.filter((id) => mongoose.isValidObjectId(id));
  if (!ids.length) return;
  const models = modelsFor(tenant, ['Student']);
  const students = await recipients.loadStudents(models, { _id: { $in: ids } });
  await Promise.all(students.map(async (student) => {
    const { users, studentsByRoll } = await recipients.familyFor(models, [student]);
    await send(tenant, users, 'attendance.absent', {
      studentId: String(student._id),
      date,
      className: student.class,
      section: student.section,
      studentsByRoll
    });
  }));
};

// ── Transport ─────────────────────────────────────────────────────────────
const onTripStarted = async ({ tenant, tripId, routeId, direction }) => {
  const models = modelsFor(tenant, ['Student', 'TransportAssignment', 'TransportRoute']);
  const [route, assignments] = await Promise.all([
    models.TransportRoute.findById(routeId).select('name').lean(),
    models.TransportAssignment.find({ routeId, isActive: true, shift: { $in: [direction, 'both'] } }).select('studentId').lean()
  ]);
  if (!assignments.length) return;
  const students = await recipients.loadStudents(models, { _id: { $in: assignments.map((a) => a.studentId) } });
  const { users, studentsByRoll } = await recipients.familyFor(models, students);
  await send(tenant, users, 'transport.trip_started', { tripId: String(tripId), direction, routeName: route?.name || '', studentsByRoll });
};

const boardingHandler = (kind) => async ({ tenant, tripId, studentId, at }) => {
  const models = modelsFor(tenant, ['Student']);
  const students = await recipients.loadStudents(models, { _id: studentId });
  const { users, studentsByRoll } = await recipients.familyFor(models, students);
  await send(tenant, users, kind, { tripId: String(tripId), studentId: String(studentId), at, studentsByRoll });
};

// ── Assets ────────────────────────────────────────────────────────────────
const onAssetAllocated = async ({ tenant, allocationId, assetId, teacherId, actorId }) => {
  if (!teacherId) return;
  const models = modelsFor(tenant, ['Asset']);
  const [asset, users] = await Promise.all([
    models.Asset.findById(assetId).select('name assetTag locationPath').lean(),
    recipients.usersForTeachers(models, [teacherId])
  ]);
  if (!asset) return;
  await send(tenant, users.filter(notMe(actorId)), 'assets.allocated', {
    allocationId: String(allocationId),
    assetName: asset.name,
    assetTag: asset.assetTag,
    location: asset.locationPath,
    entity: { type: 'asset', id: String(asset._id) }
  });
};

const register = (bus) => {
  bus.on(EVENTS.USER_ACCOUNT_CHANGED, onAccountChanged);
  bus.on(EVENTS.ROLE_PERMISSIONS_CHANGED, onRolePermissionsChanged);
  bus.on(EVENTS.APPOINTMENT_BOOKED, onAppointment);
  bus.on(EVENTS.APPOINTMENT_STATUS_CHANGED, onAppointment);
  bus.on(EVENTS.EXAM_RESULTS_PUBLISHED, onResultsPublished);
  bus.on(EVENTS.EXAM_NOTICE_PUBLISHED, onNoticePublished);
  bus.on(EVENTS.DUTY_ASSIGNED, onDutyAssigned);
  bus.on(EVENTS.TIMETABLE_PUBLISHED, onTimetablePublished);
  bus.on(EVENTS.FEE_PAYMENT_RECORDED, onFeePaymentRecorded);
  bus.on(EVENTS.FEE_PAYMENT_CANCELLED, onFeePaymentCancelled);
  bus.on(EVENTS.PAYROLL_FINALIZED, payrollHandler('payroll.payslip_ready'));
  bus.on(EVENTS.PAYROLL_PAID, payrollHandler('payroll.salary_paid'));
  bus.on(EVENTS.STUDENTS_MARKED_ABSENT, onStudentsAbsent);
  bus.on(EVENTS.TRANSPORT_TRIP_STARTED, onTripStarted);
  bus.on(EVENTS.TRANSPORT_STUDENT_BOARDED, boardingHandler('transport.boarded'));
  bus.on(EVENTS.TRANSPORT_STUDENT_DROPPED, boardingHandler('transport.dropped'));
  bus.on(EVENTS.ASSET_ALLOCATED, onAssetAllocated);
};

module.exports = {
  register,
  onAccountChanged,
  onAppointment,
  onStudentsAbsent,
  monthLabel
};
