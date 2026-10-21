/**
 * TRNST crew screen: the driver or conductor of a bus starts a trip, shares the
 * phone's location and marks students on and off. Every endpoint is limited to
 * the vehicles the signed-in user crews (see modules/trnst/access.js).
 */
const mongoose = require('mongoose');
const asyncHandler = require('../../middleware/asyncHandler');
const eventBus = require('../../events/eventBus');
const EVENTS = require('../../events/eventNames');
const { P, getMyVehicleIds, crewsVehicle } = require('../../modules/trnst/access');
const {
  serviceDate,
  closeStaleTrips,
  sanitizePoints,
  shiftFilter,
  parseCardToken,
  sortedStops,
  publicStop
} = require('../../modules/trnst/trips');
const { TRIP_DIRECTIONS, BOARDING_EVENTS, BOARDING_METHODS } = require('../../models/TransportRecords');

const STUDENT_CARD_FIELDS = 'name rollNumber class section profileImage guardianPhone';

const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });
const isId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));
const userName = (req) => req.user?.name || req.user?.email || '';

const tenantRef = (req) => ({ dbName: req.tenant?.dbName, slug: req.tenant?.slug, id: req.tenant?.id });

/** Load a trip the user crews, or send the error. */
const loadMyTrip = async (req, res, { activeOnly = true } = {}) => {
  const { TransportTrip } = req.models;
  if (!isId(req.params.id)) { fail(res, 404, 'Trip not found.'); return null; }
  const trip = await TransportTrip.findById(req.params.id);
  if (!trip || !(await crewsVehicle(req, trip.vehicleId))) { fail(res, 404, 'Trip not found.'); return null; }
  if (activeOnly && trip.status !== 'active') { fail(res, 409, 'This trip has ended.'); return null; }
  return trip;
};

// GET /api/trnst/crew/me — my buses, their routes and today's trips
const getMe = asyncHandler(async (req, res) => {
  const { TransportVehicle, TransportRoute, TransportTrip } = req.models;
  const vehicleIds = await getMyVehicleIds(req);
  if (!vehicleIds.length) {
    return res.json({ success: true, data: { vehicles: [], trips: [], today: serviceDate() } });
  }

  await closeStaleTrips(TransportTrip, { vehicleId: { $in: vehicleIds } });
  const today = serviceDate();
  const [vehicles, routes, trips] = await Promise.all([
    TransportVehicle.find({ _id: { $in: vehicleIds } })
      .select('busNo registrationNumber vehicleType driverName conductorName status').sort({ busNo: 1 }).lean(),
    TransportRoute.find({ vehicleId: { $in: vehicleIds }, isActive: { $ne: false } })
      .select('name code vehicleId shift stops').sort({ code: 1 }).lean(),
    TransportTrip.find({ vehicleId: { $in: vehicleIds }, $or: [{ status: 'active' }, { serviceDate: today }] })
      .select('vehicleId routeId direction serviceDate status startedAt endedAt lastLocation pingCount')
      .sort({ startedAt: -1 }).lean()
  ]);

  return res.json({
    success: true,
    data: {
      today,
      vehicles: vehicles.map((vehicle) => ({
        ...vehicle,
        routes: routes
          .filter((route) => String(route.vehicleId) === String(vehicle._id))
          .map((route) => ({
            _id: route._id,
            name: route.name,
            code: route.code,
            shift: route.shift,
            stops: sortedStops(route).map(publicStop)
          }))
      })),
      trips
    }
  });
});

// POST /api/trnst/crew/trips { routeId, direction } — start (or resume) a trip
const startTrip = asyncHandler(async (req, res) => {
  if (!req.rbac?.has(P.OPERATE)) return fail(res, 403, 'You do not have permission to run trips.');
  const { TransportRoute, TransportTrip } = req.models;
  const { routeId, direction } = req.body || {};
  if (!isId(routeId)) return fail(res, 400, 'Choose a route.');
  if (!TRIP_DIRECTIONS.includes(direction)) return fail(res, 400, 'Choose pickup or drop.');

  const route = await TransportRoute.findOne({ _id: routeId, isActive: { $ne: false } })
    .select('name vehicleId').lean();
  if (!route || !route.vehicleId || !(await crewsVehicle(req, route.vehicleId))) {
    return fail(res, 404, 'This route is not on your bus.');
  }

  await closeStaleTrips(TransportTrip, { vehicleId: route.vehicleId });
  const existing = await TransportTrip.findOne({ vehicleId: route.vehicleId, status: 'active' }).lean();
  if (existing) {
    if (String(existing.routeId) === String(routeId) && existing.direction === direction) {
      return res.json({ success: true, data: existing, message: 'Trip resumed.' });
    }
    return fail(res, 409, 'This bus is already on another trip. End it first.', { trip: existing });
  }

  try {
    const trip = await TransportTrip.create({
      vehicleId: route.vehicleId,
      routeId,
      direction,
      serviceDate: serviceDate(),
      startedBy: req.user?._id || null,
      startedByName: userName(req)
    });
    eventBus.emit(EVENTS.TRANSPORT_TRIP_STARTED, {
      tenant: tenantRef(req),
      tripId: String(trip._id),
      routeId: String(routeId),
      vehicleId: String(route.vehicleId),
      direction
    });
    return res.status(201).json({ success: true, data: trip, message: 'Trip started.' });
  } catch (error) {
    // Another phone on the same bus started a trip at the same moment.
    if (error.code === 11000) return fail(res, 409, 'This bus is already on a trip.');
    throw error;
  }
});

// POST /api/trnst/crew/trips/:id/locations { points: [{ lat, lng, accuracy, speed, heading, at }] }
const postLocations = asyncHandler(async (req, res) => {
  if (!req.rbac?.has(P.OPERATE)) return fail(res, 403, 'You do not have permission to share the bus location.');
  const trip = await loadMyTrip(req, res);
  if (!trip) return null;

  const points = sanitizePoints(req.body?.points, { notBefore: trip.startedAt });
  if (!points.length) return res.json({ success: true, data: { accepted: 0, lastLocation: trip.lastLocation } });

  const { TransportTrip, TransportLocationPing } = req.models;
  await TransportLocationPing.insertMany(points.map((point) => ({ ...point, tripId: trip._id })), { ordered: false });

  const newest = points[points.length - 1];
  const update = { $inc: { pingCount: points.length } };
  const filter = { _id: trip._id, status: 'active' };
  if (!trip.lastLocation?.at || newest.at > trip.lastLocation.at) update.$set = { lastLocation: newest };
  const saved = await TransportTrip.findOneAndUpdate(filter, update, { new: true })
    .select('lastLocation status').lean();

  return res.json({ success: true, data: { accepted: points.length, lastLocation: saved?.lastLocation || null } });
});

// POST /api/trnst/crew/trips/:id/end
const endTrip = asyncHandler(async (req, res) => {
  if (!req.rbac?.has(P.OPERATE)) return fail(res, 403, 'You do not have permission to end trips.');
  const trip = await loadMyTrip(req, res);
  if (!trip) return null;
  trip.status = 'ended';
  trip.endedAt = new Date();
  trip.endReason = 'crew';
  await trip.save();
  eventBus.emit(EVENTS.TRANSPORT_TRIP_ENDED, {
    tenant: tenantRef(req),
    tripId: String(trip._id),
    routeId: String(trip.routeId)
  });
  return res.json({ success: true, data: trip, message: 'Trip ended.' });
});

/** Students on this trip's route, grouped by stop, with what happened to each today. */
const buildRoster = async (models, trip) => {
  const { TransportRoute, TransportAssignment, TransportBoarding, Student } = models;
  const [route, assignments, marks] = await Promise.all([
    TransportRoute.findById(trip.routeId).select('name code stops').lean(),
    TransportAssignment.find({ routeId: trip.routeId, isActive: true, ...shiftFilter(trip.direction) }).lean(),
    TransportBoarding.find({ tripId: trip._id }).select('studentId event method at').lean()
  ]);
  const students = assignments.length
    ? await Student.find({ _id: { $in: assignments.map((row) => row.studentId) }, isActive: { $ne: false } })
      .select(STUDENT_CARD_FIELDS).lean()
    : [];
  const studentById = new Map(students.map((student) => [String(student._id), student]));
  const marksByStudent = new Map();
  marks.forEach((mark) => {
    const key = String(mark.studentId);
    marksByStudent.set(key, { ...(marksByStudent.get(key) || {}), [mark.event]: { at: mark.at, method: mark.method } });
  });

  const stops = sortedStops(route).map(publicStop);
  const stopIndex = new Map(stops.map((stop, index) => [stop.id, index]));
  const groups = stops.map((stop) => ({ stop, students: [] }));
  const unplaced = { stop: { id: '', name: 'No stop set' }, students: [] };

  assignments.forEach((assignment) => {
    const student = studentById.get(String(assignment.studentId));
    if (!student) return;
    const row = {
      studentId: String(student._id),
      name: student.name,
      rollNumber: student.rollNumber,
      className: student.class,
      section: student.section,
      profileImage: student.profileImage || null,
      guardianPhone: student.guardianPhone || '',
      marks: marksByStudent.get(String(student._id)) || {}
    };
    const index = stopIndex.get(String(assignment.stopId || ''));
    (index === undefined ? unplaced : groups[index]).students.push(row);
  });
  groups.forEach((group) => group.students.sort((a, b) => a.name.localeCompare(b.name)));

  const all = [...groups, unplaced].flatMap((group) => group.students);
  return {
    route: route ? { _id: route._id, name: route.name, code: route.code } : null,
    stops: [...groups, ...(unplaced.students.length ? [unplaced] : [])],
    counts: {
      assigned: all.length,
      boarded: all.filter((row) => row.marks.boarded).length,
      dropped: all.filter((row) => row.marks.dropped).length,
      absent: all.filter((row) => row.marks.absent).length
    }
  };
};

// GET /api/trnst/crew/trips/:id/roster
const getRoster = asyncHandler(async (req, res) => {
  const trip = await loadMyTrip(req, res, { activeOnly: false });
  if (!trip) return null;
  const roster = await buildRoster(req.models, trip);
  return res.json({ success: true, data: { trip, ...roster } });
});

// Marking a student absent cancels "boarded" and the other way round.
const CANCELS = { boarded: ['absent'], dropped: ['absent'], absent: ['boarded', 'dropped'] };

// POST /api/trnst/crew/trips/:id/boarding { token | studentId, event, method }
const markBoarding = asyncHandler(async (req, res) => {
  if (!req.rbac?.has(P.MARK)) return fail(res, 403, 'You do not have permission to mark students.');
  const trip = await loadMyTrip(req, res);
  if (!trip) return null;

  const { Student, TransportAssignment, TransportBoarding } = req.models;
  const body = req.body || {};
  const method = BOARDING_METHODS.includes(body.method) ? body.method : 'manual';
  // The crew's usual mark: on the bus in the morning, off at the stop in the afternoon.
  const defaultEvent = trip.direction === 'pickup' ? 'boarded' : 'dropped';
  const event = BOARDING_EVENTS.includes(body.event) ? body.event : defaultEvent;

  let student = null;
  if (body.token !== undefined) {
    const token = parseCardToken(body.token);
    if (!token) return fail(res, 400, 'This is not a school ID card.', { errorCode: 'invalid_card' });
    student = await Student.findOne({ idCardToken: token, isActive: { $ne: false } })
      .select(STUDENT_CARD_FIELDS).lean();
    if (!student) {
      return fail(res, 404, 'Card not recognised. It may have been replaced.', { errorCode: 'unknown_card' });
    }
  } else if (isId(body.studentId)) {
    student = await Student.findById(body.studentId).select(STUDENT_CARD_FIELDS).lean();
  }
  if (!student) return fail(res, 404, 'Student not found.');

  const assignment = await TransportAssignment.findOne({
    studentId: student._id, routeId: trip.routeId, isActive: true, ...shiftFilter(trip.direction)
  }).select('_id').lean();
  const studentInfo = {
    studentId: String(student._id),
    name: student.name,
    className: student.class,
    section: student.section,
    profileImage: student.profileImage || null
  };
  if (!assignment) {
    return fail(res, 422, `${student.name} is not on this route.`, { errorCode: 'not_on_route', student: studentInfo });
  }

  const at = new Date();
  const location = trip.lastLocation || {};
  const result = await TransportBoarding.findOneAndUpdate(
    { tripId: trip._id, studentId: student._id, event },
    {
      $setOnInsert: {
        method,
        at,
        markedBy: req.user?._id || null,
        markedByName: userName(req),
        lat: location.lat ?? null,
        lng: location.lng ?? null
      }
    },
    { upsert: true, new: true, includeResultMetadata: true }
  );
  const created = !result.lastErrorObject?.updatedExisting;
  await TransportBoarding.deleteMany({ tripId: trip._id, studentId: student._id, event: { $in: CANCELS[event] } });

  if (created && event !== 'absent') {
    eventBus.emit(event === 'boarded' ? EVENTS.TRANSPORT_STUDENT_BOARDED : EVENTS.TRANSPORT_STUDENT_DROPPED, {
      tenant: tenantRef(req),
      tripId: String(trip._id),
      studentId: String(student._id),
      at
    });
  }

  return res.status(created ? 201 : 200).json({
    success: true,
    data: { event, at: result.value?.at || at, duplicate: !created, student: studentInfo },
    message: created ? `${student.name}: ${event}.` : `${student.name} was already marked ${event}.`
  });
});

// DELETE /api/trnst/crew/trips/:id/boarding/:studentId/:event — undo a wrong mark
const unmarkBoarding = asyncHandler(async (req, res) => {
  if (!req.rbac?.has(P.MARK)) return fail(res, 403, 'You do not have permission to mark students.');
  const trip = await loadMyTrip(req, res);
  if (!trip) return null;
  const { studentId, event } = req.params;
  if (!isId(studentId) || !BOARDING_EVENTS.includes(event)) return fail(res, 400, 'Nothing to undo.');
  await req.models.TransportBoarding.deleteOne({ tripId: trip._id, studentId, event });
  return res.json({ success: true, message: 'Mark removed.' });
});

module.exports = {
  getMe,
  startTrip,
  postLocations,
  endTrip,
  getRoster,
  markBoarding,
  unmarkBoarding,
  buildRoster
};
