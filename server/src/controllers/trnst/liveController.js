/**
 * TRNST admin views: buses on the road now and the trip history.
 */
const mongoose = require('mongoose');
const asyncHandler = require('../../middleware/asyncHandler');
const { closeStaleTrips, serviceDate, sortedStops, publicStop, staleSeconds } = require('../../modules/trnst/trips');

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TRAIL_POINTS = 2000;

/** Assigned and boarded counts for each trip. */
const tripCounts = async (models, trips) => {
  const { TransportAssignment, TransportBoarding } = models;
  if (!trips.length) return new Map();
  const routeIds = [...new Set(trips.map((trip) => String(trip.routeId?._id || trip.routeId)))]
    .map((id) => new mongoose.Types.ObjectId(id));
  const [assigned, marks] = await Promise.all([
    TransportAssignment.aggregate([
      { $match: { isActive: true, routeId: { $in: routeIds } } },
      { $group: { _id: { routeId: '$routeId', shift: '$shift' }, count: { $sum: 1 } } }
    ]),
    TransportBoarding.aggregate([
      { $match: { tripId: { $in: trips.map((trip) => trip._id) } } },
      { $group: { _id: { tripId: '$tripId', event: '$event' }, count: { $sum: 1 } } }
    ])
  ]);

  const counts = new Map();
  trips.forEach((trip) => {
    const routeId = String(trip.routeId?._id || trip.routeId);
    const total = assigned
      .filter((row) => String(row._id.routeId) === routeId && [trip.direction, 'both'].includes(row._id.shift))
      .reduce((sum, row) => sum + row.count, 0);
    const byEvent = Object.fromEntries(marks
      .filter((row) => String(row._id.tripId) === String(trip._id))
      .map((row) => [row._id.event, row.count]));
    counts.set(String(trip._id), {
      assigned: total,
      boarded: byEvent.boarded || 0,
      dropped: byEvent.dropped || 0,
      absent: byEvent.absent || 0
    });
  });
  return counts;
};

const tripSummary = (trip, counts, now) => ({
  _id: trip._id,
  direction: trip.direction,
  serviceDate: trip.serviceDate,
  status: trip.status,
  startedAt: trip.startedAt,
  endedAt: trip.endedAt,
  endReason: trip.endReason,
  startedByName: trip.startedByName,
  lastLocation: trip.lastLocation,
  staleSeconds: staleSeconds(trip, now),
  pingCount: trip.pingCount,
  vehicle: trip.vehicleId ? {
    _id: trip.vehicleId._id,
    busNo: trip.vehicleId.busNo,
    registrationNumber: trip.vehicleId.registrationNumber,
    driverName: trip.vehicleId.driverName,
    driverPhone: trip.vehicleId.driverPhone,
    conductorName: trip.vehicleId.conductorName
  } : null,
  route: trip.routeId ? {
    _id: trip.routeId._id,
    name: trip.routeId.name,
    code: trip.routeId.code,
    stops: sortedStops(trip.routeId).map(publicStop)
  } : null,
  counts: counts.get(String(trip._id)) || { assigned: 0, boarded: 0, dropped: 0, absent: 0 }
});

const populateTrip = (query) => query
  .populate('vehicleId', 'busNo registrationNumber driverName driverPhone conductorName')
  .populate('routeId', 'name code stops');

// GET /api/trnst/live — every bus on a trip right now
const getLive = asyncHandler(async (req, res) => {
  const { TransportTrip } = req.models;
  await closeStaleTrips(TransportTrip);
  const now = new Date();
  const trips = await populateTrip(TransportTrip.find({ status: 'active' }).sort({ startedAt: 1 })).lean();
  const counts = await tripCounts(req.models, trips);
  return res.json({ success: true, data: { at: now, trips: trips.map((trip) => tripSummary(trip, counts, now)) } });
});

// GET /api/trnst/trips?date=YYYY-MM-DD — trips on one day
const listTrips = asyncHandler(async (req, res) => {
  const { TransportTrip } = req.models;
  const date = DATE.test(String(req.query.date || '')) ? req.query.date : serviceDate();
  await closeStaleTrips(TransportTrip);
  const now = new Date();
  const trips = await populateTrip(TransportTrip.find({ serviceDate: date }).sort({ startedAt: 1 })).lean();
  const counts = await tripCounts(req.models, trips);
  return res.json({ success: true, data: { date, trips: trips.map((trip) => tripSummary(trip, counts, now)) } });
});

// GET /api/trnst/trips/:id — one trip with its GPS trail and boarding log
const getTrip = asyncHandler(async (req, res) => {
  const { TransportTrip, TransportLocationPing, TransportBoarding, Student } = req.models;
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ success: false, message: 'Trip not found.' });
  }
  const trip = await populateTrip(TransportTrip.findById(req.params.id)).lean();
  if (!trip) return res.status(404).json({ success: false, message: 'Trip not found.' });

  const [pings, marks] = await Promise.all([
    TransportLocationPing.find({ tripId: trip._id }).select('lat lng at -_id').sort({ at: 1 }).lean(),
    TransportBoarding.find({ tripId: trip._id }).sort({ at: 1 }).lean()
  ]);
  const students = marks.length
    ? await Student.find({ _id: { $in: marks.map((mark) => mark.studentId) } })
      .select('name rollNumber class section').lean()
    : [];
  const byId = new Map(students.map((student) => [String(student._id), student]));
  // Thin long trails evenly so the map stays light.
  const step = Math.max(1, Math.ceil(pings.length / MAX_TRAIL_POINTS));
  const trail = pings.filter((_, index) => index % step === 0 || index === pings.length - 1);
  const counts = await tripCounts(req.models, [trip]);

  return res.json({
    success: true,
    data: {
      ...tripSummary(trip, counts, new Date()),
      trail,
      boarding: marks.map((mark) => {
        const student = byId.get(String(mark.studentId));
        return {
          studentId: mark.studentId,
          name: student?.name || 'Unknown student',
          rollNumber: student?.rollNumber || '',
          className: student?.class || '',
          section: student?.section || '',
          event: mark.event,
          method: mark.method,
          at: mark.at,
          markedByName: mark.markedByName
        };
      })
    }
  });
});

module.exports = { getLive, listTrips, getTrip, tripCounts };
