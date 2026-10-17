/**
 * Family portal: parents request, track and cancel meetings with school staff.
 *
 * Everything is limited to the signed-in parent: hosts are offered only for a
 * linked child (loadLinkedStudent runs first), and requests are found by
 * requestedBy. Private meeting notes are never returned here.
 */
const { normalizeTenantFeatureToggles } = require('../constants/tenantFeatures');
const { catalog } = require('../rbac/catalog');
const { getAssignedSections, sectionKey } = require('../rbac/scope');
const { handle, fail, nextRefNo, emit } = require('./appntController');
const { getSettings, getSlots } = require('../services/appntSlotService');
const { slotKeyFor, schoolNow } = require('../modules/appnt/lifecycle');

const PORTAL_FIELDS = 'refNo date startTime endTime hostName mode location purpose agenda status cancelReason studentSnapshot createdAt timeline.status timeline.at';

/** The section must be open for this kind of login and the module switched on. */
const ensureOpen = (req) => {
  const sections = catalog.portal[req.user?.kind] || [];
  const toggles = normalizeTenantFeatureToggles(req.tenant?.featureToggles);
  if (!sections.includes('appointments') || toggles.appnt_desk === false || !req.models?.Appointment) {
    throw fail('Appointments are not available.', 404, { errorCode: 'not_available' });
  }
};

/** Meetings this parent asked for, or that the school booked with them about their children. */
const mineFilter = (req) => {
  const rollNumbers = (req.user.linkedStudents || []).map((link) => link.rollNumber).filter(Boolean);
  const or = [{ requestedBy: req.user._id }];
  if (req.user.kind === 'parent' && rollNumbers.length) or.push({ visitorType: 'parent', 'studentSnapshot.rollNumber': { $in: rollNumbers } });
  return { $or: or };
};

/** Does this host teach the child's class-section? Uses the same rules as staff "own classes". */
const teachesStudent = async (req, host, student) => {
  if (!host.teacher) return false;
  const hostLogin = host.user && req.models.User
    ? await req.models.User.findById(host.user).select('assignedSections').lean()
    : null;
  const sections = await getAssignedSections({
    models: req.models,
    user: { teacher: host.teacher, assignedSections: hostLogin?.assignedSections || [] }
  });
  const key = sectionKey(student.class, student.section);
  return sections.some((row) => row.key === key);
};

/** Hosts this parent may request for the child in req.portalStudent. */
const bookableHosts = async (req) => {
  const settings = await getSettings(req);
  if (!settings.allowParentRequests) return { settings, hosts: [] };
  const candidates = await req.models.AppointmentHost.find({ isActive: true, parentBookable: true }).sort({ displayName: 1 }).lean();
  const allowed = await Promise.all(candidates.map((host) => (
    host.parentVisibility !== 'linked' || teachesStudent(req, host, req.portalStudent)
  )));
  return { settings, hosts: candidates.filter((host, index) => allowed[index]) };
};

const hostSummary = (host) => ({
  _id: host._id,
  displayName: host.displayName,
  title: host.title,
  location: host.location,
  slotMinutes: host.slotMinutes,
  days: [...new Set((host.weeklyAvailability || []).map((row) => row.day))].sort()
});

// GET /portal/appointments
exports.listMine = handle(async (req, res) => {
  ensureOpen(req);
  const settings = await getSettings(req);
  const items = await req.models.Appointment.find(mineFilter(req)).select(PORTAL_FIELDS).sort({ date: -1, startTime: -1 }).limit(50).lean();
  res.json({
    success: true,
    data: {
      items,
      allowRequests: Boolean(settings.allowParentRequests),
      purposes: settings.purposes,
      minNoticeHours: settings.minNoticeHours,
      maxAdvanceDays: settings.maxAdvanceDays
    }
  });
});

// GET /portal/students/:studentId/appointment-hosts
exports.listHosts = handle(async (req, res) => {
  ensureOpen(req);
  const { hosts } = await bookableHosts(req);
  res.json({ success: true, data: hosts.map(hostSummary) });
});

const loadBookableHost = async (req, hostId) => {
  const { settings, hosts } = await bookableHosts(req);
  if (!settings.allowParentRequests) throw fail('The school is not taking meeting requests online right now.', 409, { errorCode: 'requests_closed' });
  const host = hosts.find((row) => String(row._id) === String(hostId));
  if (!host) throw fail('This person is not available for meeting requests.', 404);
  return { settings, host };
};

// GET /portal/students/:studentId/appointment-hosts/:hostId/slots?date=
exports.hostSlots = handle(async (req, res) => {
  ensureOpen(req);
  const date = String(req.query.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw fail('Choose a date.');
  const { host } = await loadBookableHost(req, req.params.hostId);
  const { slots, closed, reason } = await getSlots(req, host, date, { forPortal: true });
  // Parents see only whether a time is open, never why it is busy.
  res.json({ success: true, data: { date, closed, reason, slots: slots.map((slot) => ({ start: slot.start, end: slot.end, open: slot.state === 'free' })) } });
});

// POST /portal/students/:studentId/appointments
exports.request = handle(async (req, res) => {
  ensureOpen(req);
  const { settings, host } = await loadBookableHost(req, req.body.hostId);
  const { date, startTime } = req.body;
  if (!settings.purposes.includes(req.body.purpose)) throw fail('Choose a purpose from the list.');

  const open = await req.models.Appointment.countDocuments({
    requestedBy: req.user._id,
    status: { $in: ['requested', 'confirmed'] },
    date: { $gte: schoolNow().date }
  });
  if (open >= settings.maxOpenRequestsPerParent) {
    throw fail(`You already have ${open} upcoming meeting${open === 1 ? '' : 's'}. Cancel one or wait until it has taken place.`, 409, { errorCode: 'too_many_requests' });
  }

  const { slots } = await getSlots(req, host, date, { forPortal: true });
  const slot = slots.find((row) => row.start === startTime);
  if (!slot || slot.state !== 'free') throw fail('This time is no longer available. Pick another slot.', 409, { errorCode: 'slot_taken' });

  const student = req.portalStudent;
  const status = host.requiresApproval ? 'requested' : 'confirmed';
  const appointment = await req.models.Appointment.create({
    refNo: await nextRefNo(req, date),
    date,
    startTime,
    endTime: slot.end,
    host: host._id,
    hostName: host.displayName,
    slotKey: slotKeyFor(host._id, date, startTime),
    mode: req.body.mode,
    location: host.location || '',
    visitorType: 'parent',
    visitor: {
      name: req.user.name || student.guardianName || student.fatherName || 'Parent',
      phone: req.body.phone || student.guardianPhone || '',
      email: req.user.email || student.guardianEmail || '',
      relation: req.portalLink?.relation || ''
    },
    student: student._id,
    studentSnapshot: { name: student.name, rollNumber: student.rollNumber, className: student.class || '', section: student.section || '' },
    purpose: req.body.purpose,
    agenda: req.body.agenda,
    status,
    source: 'portal',
    requestedBy: req.user._id,
    timeline: [{ status, by: req.user.name || 'Parent', note: 'Requested from the family portal' }],
    createdBy: req.user.name || ''
  });
  emit(req, appointment, 'booked');
  const data = await req.models.Appointment.findById(appointment._id).select(PORTAL_FIELDS).lean();
  res.status(201).json({ success: true, data });
});

// POST /portal/appointments/:id/cancel
exports.cancel = handle(async (req, res) => {
  ensureOpen(req);
  const appointment = await req.models.Appointment.findOne({ ...mineFilter(req), _id: req.params.id });
  if (!appointment) throw fail('Appointment not found.', 404);
  if (!['requested', 'confirmed'].includes(appointment.status) || appointment.date < schoolNow().date) {
    throw fail('Only upcoming meetings can be cancelled.', 409);
  }
  appointment.status = 'cancelled';
  appointment.slotKey = undefined;
  appointment.cancelReason = String(req.body?.reason || '').trim().slice(0, 500) || 'Cancelled by parent';
  appointment.timeline.push({ status: 'cancelled', by: req.user.name || 'Parent', note: appointment.cancelReason });
  await appointment.save();
  emit(req, appointment, 'cancelled');
  const data = await req.models.Appointment.findById(appointment._id).select(PORTAL_FIELDS).lean();
  res.json({ success: true, data });
});
