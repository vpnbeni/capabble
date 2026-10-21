/**
 * APPNT — appointments with the principal, teachers and other staff.
 *
 * Visibility and actions are decided in modules/appnt/access.js:
 * hosts see only their own appointments; the front desk and principal see all.
 */
const eventBus = require('../events/eventBus');
const EVENTS = require('../events/eventNames');
const {
  ACTIVE_STATUSES,
  ACTION_STATUS,
  assertTransition,
  isActive,
  toMinutes,
  toTime,
  overlaps,
  slotKeyFor,
  schoolNow,
  dayOfWeek
} = require('../modules/appnt/lifecycle');
const access = require('../modules/appnt/access');
const { getSettings, getSlots, absentTeacherIds } = require('../services/appntSlotService');

const { P } = access;

const fail = (message, statusCode = 400, extra = {}) => Object.assign(new Error(message), { statusCode, ...extra });
const send = (res, data, status = 200) => res.status(status).json({ success: true, data });
const actor = (req) => String(req.user?.name || req.user?.email || '').trim();
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Wraps a handler so thrown errors with statusCode become JSON responses. */
const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    if (error.code === 11000 && /slotKey/.test(error.message)) {
      return res.status(409).json({ success: false, message: 'Someone else just booked this time. Pick another slot.', errorCode: 'slot_taken' });
    }
    // Shared MongoDB Atlas tiers cap the number of collections; the first write of a new module creates one.
    if (/cannot create a new collection/i.test(error.message || '')) {
      console.error('[appnt]', error.message);
      return res.status(503).json({
        success: false,
        message: "Appointments can't be set up yet: the school's database has reached its limit on storage tables. Contact Capabble support.",
        errorCode: 'database_collection_limit',
        ...(process.env.NODE_ENV !== 'production' ? { detail: error.message } : {}),
      });
    }
    const status = error.statusCode || (error.name === 'ValidationError' || error.name === 'CastError' ? 400 : 500);
    if (status >= 500) console.error('[appnt]', error);
    return res.status(status).json({
      success: false,
      message: status >= 500 ? 'Something went wrong with appointments. Try again.' : error.message,
      ...(error.errorCode ? { errorCode: error.errorCode } : {}),
      // Outside production, show the underlying error so it can be fixed without digging through server logs.
      ...(status >= 500 && process.env.NODE_ENV !== 'production' ? { detail: error.message } : {}),
    });
  }
};

/** event: 'booked' for a new appointment, otherwise confirmed | declined | cancelled | rescheduled | checked_in. */
const emit = (req, appointment, event) => {
  const booked = event === 'booked';
  eventBus.emitFromRequest(req, booked ? EVENTS.APPOINTMENT_BOOKED : EVENTS.APPOINTMENT_STATUS_CHANGED, {
    appointmentId: String(appointment._id),
    event: booked ? appointment.status : event
  });
};

const nextRefNo = async (req, date) => {
  const settings = await req.models.AppointmentSettings.findOneAndUpdate(
    { key: 'default' },
    { $inc: { refSeq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
  return `APT-${date.slice(0, 4)}-${String(settings.refSeq).padStart(4, '0')}`;
};

const loadHost = async (req, hostId, { activeOnly = true } = {}) => {
  const host = await req.models.AppointmentHost.findById(hostId).lean();
  if (!host || (activeOnly && !host.isActive)) throw fail('This person is not taking appointments.', 404);
  return host;
};

/** Load an appointment the user is allowed to see, or 404. */
const loadScoped = async (req, id) => {
  const scope = await access.buildAppointmentScope(req);
  const appointment = await req.models.Appointment.findOne({ ...scope, _id: id });
  if (!appointment) throw fail('Appointment not found.', 404);
  return appointment;
};

const studentSnapshot = async (req, studentId) => {
  const { Student } = req.models;
  if (!studentId || !Student) return { student: null, studentSnapshot: undefined };
  const student = await Student.findById(studentId).select('name rollNumber class section').lean();
  if (!student) throw fail('Student not found. Choose a student from the list.', 404);
  return {
    student: student._id,
    studentSnapshot: { name: student.name, rollNumber: student.rollNumber, className: student.class || '', section: student.section || '' }
  };
};

/**
 * Check that [startTime, startTime + slot) is open for the host on the date.
 * Staff bookings may pick any time; a clash with another appointment is never allowed,
 * a clash with a teaching period needs an explicit override.
 */
const assertTimeOpen = async (req, host, date, startTime, { overrideTeaching = false, ignoreId = null } = {}) => {
  const today = schoolNow().date;
  if (date < today) throw fail('Choose today or a later date.');
  const blocked = (host.blockedDates || []).find((row) => row.date === date);
  if (blocked) throw fail(`${host.displayName} is not available on this date${blocked.reason ? ` (${blocked.reason})` : ''}.`, 409);
  const start = toMinutes(startTime);
  const end = start + (Number(host.slotMinutes) || 15);
  if (end > 24 * 60) throw fail('Choose an earlier time.');
  const { busyPeriods, hostAbsent } = await getSlots(req, host, date, { ignoreAppointmentId: ignoreId });
  const filter = { host: host._id, date, status: { $in: ACTIVE_STATUSES } };
  if (ignoreId) filter._id = { $ne: ignoreId };
  const others = await req.models.Appointment.find(filter).select('startTime endTime').lean();
  if (others.some((row) => overlaps(start, end, toMinutes(row.startTime), toMinutes(row.endTime)))) {
    throw fail('This time overlaps another appointment. Pick another slot.', 409, { errorCode: 'slot_taken' });
  }
  // Checked against the periods themselves, so times outside the usual hours are covered too.
  const lesson = busyPeriods.find((row) => overlaps(start, end, toMinutes(row.start), toMinutes(row.end)));
  if (lesson && !overrideTeaching) {
    throw fail(`${host.displayName} is teaching then (${lesson.label}). Pick another slot or confirm the override.`, 409, { errorCode: 'host_teaching' });
  }
  return { endTime: toTime(end), hostAbsent };
};

// ── Day view ────────────────────────────────────────────────────────────────

// GET /appnt/today?date=YYYY-MM-DD
exports.today = handle(async (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || '')) ? req.query.date : schoolNow().date;
  const scope = await access.buildAppointmentScope(req);
  const { Appointment } = req.models;
  const [rows, pendingRequests] = await Promise.all([
    Appointment.find({ ...scope, date }).sort({ startTime: 1 }).lean(),
    Appointment.countDocuments({ ...scope, status: 'requested', date: { $gte: schoolNow().date } })
  ]);
  const hostIds = [...new Set(rows.map((row) => String(row.host)))];
  const hosts = await req.models.AppointmentHost.find({ _id: { $in: hostIds } }).select('teacher displayName').lean();
  const absent = await absentTeacherIds(req, date, hosts.map((host) => host.teacher).filter(Boolean));
  const absentHosts = new Set(hosts.filter((host) => host.teacher && absent.has(String(host.teacher))).map((host) => String(host._id)));

  const items = await Promise.all(rows.map(async (row) => ({ ...(await access.redact(req, row)), hostAbsent: absentHosts.has(String(row.host)) })));
  const counts = items.reduce((acc, row) => ({ ...acc, [row.status]: (acc[row.status] || 0) + 1 }), {});
  const scheduled = items.filter((row) => ['confirmed', 'checked_in', 'completed', 'no_show'].includes(row.status));
  const now = schoolNow();
  const next = date === now.date
    ? items.find((row) => ['confirmed', 'checked_in'].includes(row.status) && toMinutes(row.endTime) > now.minutes) || null
    : null;
  send(res, {
    date,
    items,
    counts,
    total: scheduled.length,
    waiting: counts.checked_in || 0,
    pendingRequests,
    next: next ? { _id: next._id, startTime: next.startTime, visitorName: next.visitor?.name, hostName: next.hostName } : null,
    isHostView: !req.rbac.has(P.VIEW)
  });
});

// ── Appointments ────────────────────────────────────────────────────────────

const buildListFilter = async (req) => {
  const scope = await access.buildAppointmentScope(req);
  const filter = { ...scope };
  const { q, hostId, from, to, visitorType } = req.query;
  if (hostId && /^[a-f\d]{24}$/i.test(hostId)) {
    // A host filtering by someone else's calendar gets nothing back.
    const allowed = !scope.host || scope.host.$in.includes(hostId);
    filter.host = allowed ? hostId : { $in: [] };
  }
  if (visitorType) filter.visitorType = String(visitorType);
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = String(from);
    if (to) filter.date.$lte = String(to);
  }
  const search = String(q || '').trim();
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ refNo: rx }, { 'visitor.name': rx }, { 'visitor.phone': rx }, { 'studentSnapshot.name': rx }, { 'studentSnapshot.rollNumber': rx }, { hostName: rx }, { purpose: rx }];
  }
  return filter;
};

// GET /appnt/appointments?q&status&hostId&from&to&page&limit
exports.list = handle(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const base = await buildListFilter(req);
  const filter = req.query.status ? { ...base, status: String(req.query.status) } : base;
  const sortUpcoming = req.query.sort === 'upcoming';
  const { Appointment } = req.models;
  const [rows, total, statusCounts] = await Promise.all([
    Appointment.find(filter).sort(sortUpcoming ? { date: 1, startTime: 1 } : { date: -1, startTime: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Appointment.countDocuments(filter),
    Appointment.aggregate([{ $match: base }, { $group: { _id: '$status', count: { $sum: 1 } } }])
  ]);
  const items = await Promise.all(rows.map((row) => access.redact(req, row)));
  send(res, {
    items,
    counts: Object.fromEntries(statusCounts.map((row) => [row._id, row.count])),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

// GET /appnt/appointments/:id
exports.get = handle(async (req, res) => {
  const appointment = await loadScoped(req, req.params.id);
  send(res, await access.redact(req, appointment));
});

const createAppointment = async (req, { walkIn = false } = {}) => {
  const { body } = req;
  const host = await loadHost(req, body.hostId);
  const ownHost = await access.isOwnHost(req, host._id);
  const canBookAnyone = req.rbac.hasAny([P.BOOK, P.MANAGE]);
  if (!canBookAnyone && !(req.rbac.has(P.HOST) && ownHost)) {
    throw fail('You can only add appointments to your own calendar.', 403, { errorCode: 'permission_denied' });
  }
  const now = schoolNow();
  const date = walkIn ? now.date : body.date;
  const startTime = walkIn ? toTime(now.minutes - (now.minutes % 5)) : body.startTime;
  let endTime;
  if (walkIn) {
    endTime = toTime(Math.min(24 * 60 - 1, toMinutes(startTime) + (Number(host.slotMinutes) || 15)));
  } else {
    // Overriding a teaching period is a front-desk or own-calendar decision.
    const overrideTeaching = Boolean(body.overrideTeaching) && (req.rbac.has(P.MANAGE) || ownHost);
    ({ endTime } = await assertTimeOpen(req, host, date, startTime, { overrideTeaching }));
  }
  const student = await studentSnapshot(req, body.studentId);
  const status = walkIn ? 'checked_in' : 'confirmed';
  let source = canBookAnyone && !ownHost ? 'front_desk' : 'host';
  if (walkIn) source = 'walk_in';
  const by = actor(req);
  const appointment = await req.models.Appointment.create({
    refNo: await nextRefNo(req, date),
    date,
    startTime,
    endTime,
    host: host._id,
    hostName: host.displayName,
    slotKey: walkIn ? undefined : slotKeyFor(host._id, date, startTime),
    mode: walkIn ? 'in_person' : body.mode,
    location: body.location || host.location || '',
    visitorType: body.visitorType,
    visitor: body.visitor,
    ...student,
    staff: body.staffId || null,
    purpose: body.purpose,
    agenda: body.agenda,
    status,
    source,
    requestedBy: req.user?._id || null,
    overrideTeaching: Boolean(body.overrideTeaching),
    checkInAt: walkIn ? new Date() : null,
    timeline: [{ status, by, note: walkIn ? 'Walk-in' : '' }],
    createdBy: by
  });
  emit(req, appointment, walkIn ? 'checked_in' : 'booked');
  return appointment;
};

// POST /appnt/appointments
exports.create = handle(async (req, res) => {
  const appointment = await createAppointment(req);
  send(res, await access.redact(req, appointment), 201);
});

// POST /appnt/appointments/walk-in
exports.walkIn = handle(async (req, res) => {
  const appointment = await createAppointment(req, { walkIn: true });
  send(res, await access.redact(req, appointment), 201);
});

// POST /appnt/appointments/:id/:action  (confirm, decline, check-in, complete, no-show, cancel)
exports.act = handle(async (req, res) => {
  const to = ACTION_STATUS[req.params.action];
  if (!to) throw fail('Unknown action.', 404);
  const appointment = await loadScoped(req, req.params.id);
  if (!await access.canActOn(req, appointment)) throw fail('Only the host or the front desk can change this appointment.', 403, { errorCode: 'permission_denied' });
  assertTransition(appointment.status, to);
  const note = String(req.body?.note || '').trim();
  if (to === 'confirmed') {
    // Re-check the slot: a request may have been made before the host blocked the day.
    const host = await loadHost(req, appointment.host, { activeOnly: true });
    await assertTimeOpen(req, host, appointment.date, appointment.startTime, { overrideTeaching: true, ignoreId: appointment._id });
  }
  appointment.status = to;
  if (to === 'checked_in') appointment.checkInAt = new Date();
  if (to === 'completed') appointment.checkOutAt = new Date();
  if (['declined', 'cancelled'].includes(to)) appointment.cancelReason = note;
  if (!isActive(to)) appointment.slotKey = undefined;
  appointment.timeline.push({ status: to, by: actor(req), note });
  await appointment.save();
  if (['confirmed', 'declined', 'cancelled', 'checked_in'].includes(to)) emit(req, appointment, to);
  send(res, await access.redact(req, appointment));
});

// POST /appnt/appointments/:id/reschedule
exports.reschedule = handle(async (req, res) => {
  const appointment = await loadScoped(req, req.params.id);
  if (!await access.canActOn(req, appointment)) throw fail('Only the host or the front desk can move this appointment.', 403, { errorCode: 'permission_denied' });
  if (!['requested', 'confirmed'].includes(appointment.status)) throw fail('Only upcoming appointments can be moved.', 409);
  const host = await loadHost(req, appointment.host);
  const { date, startTime, note } = req.body;
  const { endTime } = await assertTimeOpen(req, host, date, startTime, { overrideTeaching: Boolean(req.body.overrideTeaching), ignoreId: appointment._id });
  const from = `${appointment.date} ${appointment.startTime}`;
  Object.assign(appointment, { date, startTime, endTime, slotKey: slotKeyFor(host._id, date, startTime) });
  appointment.timeline.push({ status: appointment.status, by: actor(req), note: [`Moved from ${from}`, note].filter(Boolean).join('. ') });
  await appointment.save();
  emit(req, appointment, 'rescheduled');
  send(res, await access.redact(req, appointment));
});

// PUT /appnt/appointments/:id/notes
exports.saveNotes = handle(async (req, res) => {
  const appointment = await loadScoped(req, req.params.id);
  if (!await access.canSeeNotes(req, appointment)) throw fail('Only the host can write meeting notes.', 403, { errorCode: 'permission_denied' });
  appointment.outcomeNotes = req.body.outcomeNotes;
  await appointment.save();
  send(res, await access.redact(req, appointment));
});

// ── Hosts ───────────────────────────────────────────────────────────────────

const hostView = (host, mine) => ({ ...host, mine: mine.includes(String(host._id)) });

// GET /appnt/hosts?all=1
exports.listHosts = handle(async (req, res) => {
  const mine = await access.getMyHostIds(req);
  const seeAll = req.rbac.hasAny([P.VIEW, P.BOOK, P.MANAGE, P.SETTINGS]);
  const filter = {};
  if (!seeAll) filter._id = { $in: mine };
  if (!(req.query.all && req.rbac.has(P.SETTINGS))) filter.isActive = true;
  const hosts = await req.models.AppointmentHost.find(filter).sort({ displayName: 1 }).lean();
  const absent = await absentTeacherIds(req, schoolNow().date, hosts.map((host) => host.teacher).filter(Boolean));
  send(res, hosts.map((host) => ({ ...hostView(host, mine), absentToday: Boolean(host.teacher && absent.has(String(host.teacher))) })));
});

// GET /appnt/hosts/me
exports.myHost = handle(async (req, res) => {
  const mine = await access.getMyHostIds(req);
  const host = mine.length ? await req.models.AppointmentHost.findById(mine[0]).lean() : null;
  if (!host) throw fail('You\'re not set up to take appointments yet. Ask the principal or an administrator to add you as a host.', 404, { errorCode: 'not_a_host' });
  send(res, hostView(host, mine));
});

// GET /appnt/hosts/:id/slots?date=
exports.hostSlots = handle(async (req, res) => {
  const date = String(req.query.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw fail('Choose a date.');
  const host = await loadHost(req, req.params.id);
  const canSeeAny = req.rbac.hasAny([P.VIEW, P.BOOK, P.MANAGE]);
  if (!canSeeAny && !await access.isOwnHost(req, host._id)) throw fail('You can only see your own calendar.', 403, { errorCode: 'permission_denied' });
  send(res, { date, dayOfWeek: dayOfWeek(date), ...(await getSlots(req, host, date)) });
});

const hostFieldsFrom = async (req, body, existing = null) => {
  const fields = { ...body };
  delete fields.teacherId;
  delete fields.userId;
  if (body.teacherId !== undefined) {
    const { Teacher, User } = req.models;
    if (body.teacherId) {
      const teacher = await Teacher.findById(body.teacherId).select('name designation email isActive').lean();
      if (!teacher || teacher.isActive === false) throw fail('Choose an active staff member.', 404);
      fields.teacher = teacher._id;
      if (!fields.displayName && !existing?.displayName) fields.displayName = teacher.name;
      if (fields.title === undefined && !existing?.title) fields.title = teacher.designation || '';
      if (fields.email === undefined && !existing?.email) fields.email = teacher.email || '';
      if (body.userId === undefined) {
        const login = await User.findOne({ teacher: teacher._id, kind: 'staff' }).select('_id').lean();
        fields.user = login?._id || null;
      }
    } else {
      fields.teacher = null;
    }
  }
  if (body.userId !== undefined) {
    if (body.userId) {
      const login = await req.models.User.findOne({ _id: body.userId, kind: 'staff' }).select('_id name email').lean();
      if (!login) throw fail('Choose a staff login.', 404);
      fields.user = login._id;
      if (!fields.displayName && !existing?.displayName) fields.displayName = login.name;
      if (fields.email === undefined && !existing?.email) fields.email = login.email || '';
    } else {
      fields.user = null;
    }
  }
  return fields;
};

// POST /appnt/hosts
exports.createHost = handle(async (req, res) => {
  if (!req.body.teacherId && !req.body.userId) throw fail('Choose a staff member.');
  const fields = await hostFieldsFrom(req, req.body);
  if (!fields.displayName) throw fail('Enter a name.');
  if (!fields.weeklyAvailability) {
    // A sensible start: weekdays after school hours. Editable straight away.
    fields.weeklyAvailability = [1, 2, 3, 4, 5].map((day) => ({ day, start: '13:30', end: '15:00' }));
  }
  try {
    const host = await req.models.AppointmentHost.create({ ...fields, createdBy: actor(req), updatedBy: actor(req) });
    send(res, host, 201);
  } catch (error) {
    if (error.code === 11000) throw fail('This person is already set up to take appointments.', 409);
    throw error;
  }
});

// PUT /appnt/hosts/:id
exports.updateHost = handle(async (req, res) => {
  const existing = await req.models.AppointmentHost.findById(req.params.id).lean();
  if (!existing) throw fail('Host not found.', 404);
  const fields = await hostFieldsFrom(req, req.body, existing);
  const host = await req.models.AppointmentHost.findByIdAndUpdate(req.params.id, { ...fields, updatedBy: actor(req) }, { new: true, runValidators: true }).lean();
  send(res, host);
});

// PUT /appnt/hosts/me/availability — a host edits their own hours
exports.updateMyAvailability = handle(async (req, res) => {
  const mine = await access.getMyHostIds(req);
  if (!mine.length) throw fail('You\'re not set up to take appointments yet.', 404, { errorCode: 'not_a_host' });
  const host = await req.models.AppointmentHost.findByIdAndUpdate(mine[0], { ...req.body, updatedBy: actor(req) }, { new: true, runValidators: true }).lean();
  send(res, hostView(host, mine));
});

// ── Settings ────────────────────────────────────────────────────────────────

const publicSettings = (settings) => {
  const { refSeq, __v, ...rest } = settings;
  return rest;
};

// GET /appnt/settings  (purposes are needed by anyone who books)
exports.getSettings = handle(async (req, res) => {
  send(res, publicSettings(await getSettings(req)));
});

// PUT /appnt/settings
exports.updateSettings = handle(async (req, res) => {
  await getSettings(req);
  const settings = await req.models.AppointmentSettings.findOneAndUpdate({ key: 'default' }, req.body, { new: true, runValidators: true }).lean();
  send(res, publicSettings(settings));
});

// ── Reports ─────────────────────────────────────────────────────────────────

// GET /appnt/reports/summary?from&to
exports.reportSummary = handle(async (req, res) => {
  const today = schoolNow().date;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to || '')) ? req.query.to : today;
  const fromDefault = new Date(`${to}T00:00:00Z`);
  fromDefault.setUTCDate(fromDefault.getUTCDate() - 29);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from || '')) ? req.query.from : fromDefault.toISOString().slice(0, 10);
  const match = { date: { $gte: from, $lte: to } };
  const { Appointment } = req.models;
  const group = (field) => Appointment.aggregate([
    { $match: match },
    { $group: { _id: field, total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }, noShow: { $sum: { $cond: [{ $eq: ['$status', 'no_show'] }, 1, 0] } }, cancelled: { $sum: { $cond: [{ $in: ['$status', ['cancelled', 'declined']] }, 1, 0] } } } },
    { $sort: { total: -1 } }
  ]);
  const [byStatus, byHost, byPurpose, byVisitorType] = await Promise.all([
    Appointment.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    group('$hostName'),
    group('$purpose'),
    group('$visitorType')
  ]);
  const status = Object.fromEntries(byStatus.map((row) => [row._id, row.count]));
  const total = byStatus.reduce((sum, row) => sum + row.count, 0);
  const held = (status.completed || 0) + (status.no_show || 0);
  send(res, {
    from,
    to,
    total,
    status,
    noShowRate: held ? Math.round(((status.no_show || 0) / held) * 1000) / 10 : 0,
    byHost: byHost.map((row) => ({ name: row._id || '—', ...row, _id: undefined })),
    byPurpose: byPurpose.map((row) => ({ name: row._id || '—', ...row, _id: undefined })),
    byVisitorType: byVisitorType.map((row) => ({ name: row._id || '—', ...row, _id: undefined }))
  });
});

exports.handle = handle;
exports.fail = fail;
exports.nextRefNo = nextRefNo;
exports.emit = emit;
exports.loadHost = loadHost;

// ── Lookups for the booking and host forms ──────────────────────────────────

// GET /appnt/lookup/staff — active staff, for adding hosts and staff visitors
exports.lookupStaff = handle(async (req, res) => {
  const { Teacher, AppointmentHost } = req.models;
  const [staff, hosts] = await Promise.all([
    Teacher.find({ isActive: { $ne: false } }).select('name designation employeeId email department').sort({ name: 1 }).limit(2000).lean(),
    AppointmentHost.find({ teacher: { $ne: null } }).select('teacher').lean(),
  ]);
  const hosted = new Set(hosts.map((row) => String(row.teacher)));
  send(res, staff.map((row) => ({ ...row, isHost: hosted.has(String(row._id)) })));
});

// GET /appnt/lookup/students — active students with guardian contact, when student records exist
exports.lookupStudents = handle(async (req, res) => {
  const { Student } = req.models;
  if (!Student) return send(res, { available: false, items: [] });
  const items = await Student.find({ isActive: { $ne: false } })
    .select('name rollNumber class section fatherName motherName guardianName guardianPhone guardianEmail')
    .sort({ class: 1, section: 1, name: 1 })
    .limit(5000)
    .lean();
  return send(res, { available: true, items });
});
