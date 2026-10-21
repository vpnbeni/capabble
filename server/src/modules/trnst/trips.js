/**
 * TRNST trip helpers shared by the crew screen, the admin live view and the
 * family portal.
 */
const { schoolNow } = require('../appnt/lifecycle');

// A trip with no location for this long is treated as forgotten and ended.
const STALE_TRIP_MS = 3 * 60 * 60 * 1000;
// Points less accurate than this are noise (wifi/cell fixes indoors).
const MAX_ACCURACY_M = 200;
// Phones can buffer points while offline; older than this is dropped.
const MAX_POINT_AGE_MS = 2 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 60 * 1000;
const MAX_POINTS_PER_BATCH = 120;

const ID_CARD_QR_PREFIX = 'capabble://s/';

const serviceDate = (now = new Date()) => schoolNow(now).date;

/** End active trips that stopped reporting. `filter` narrows which trips to check. */
const closeStaleTrips = async (Trip, filter = {}, now = new Date()) => {
  if (!Trip) return;
  const cutoff = new Date(now.getTime() - STALE_TRIP_MS);
  await Trip.updateMany(
    {
      ...filter,
      status: 'active',
      $or: [
        { 'lastLocation.at': { $lt: cutoff } },
        { lastLocation: null, startedAt: { $lt: cutoff } }
      ]
    },
    { $set: { status: 'ended', endedAt: now, endReason: 'stale' } }
  );
};

const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/**
 * Keep only usable GPS points: valid coordinates, accurate enough, not from the
 * future and not too old. Returned oldest first.
 */
const sanitizePoints = (points, { now = new Date(), notBefore = null } = {}) => {
  if (!Array.isArray(points)) return [];
  const latest = now.getTime() + MAX_FUTURE_SKEW_MS;
  const tripStart = notBefore ? new Date(notBefore).getTime() - MAX_FUTURE_SKEW_MS : 0;
  const earliest = Math.max(now.getTime() - MAX_POINT_AGE_MS, tripStart);

  return points
    .slice(0, MAX_POINTS_PER_BATCH)
    .map((point) => {
      const lat = toNumberOrNull(point?.lat);
      const lng = toNumberOrNull(point?.lng);
      const at = new Date(point?.at ?? now);
      const accuracy = toNumberOrNull(point?.accuracy);
      if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
      if (lat === 0 && lng === 0) return null;
      if (Number.isNaN(at.getTime()) || at.getTime() > latest || at.getTime() < earliest) return null;
      if (accuracy !== null && (accuracy < 0 || accuracy > MAX_ACCURACY_M)) return null;
      const speed = toNumberOrNull(point?.speed);
      const heading = toNumberOrNull(point?.heading);
      return {
        lat,
        lng,
        accuracy,
        speed: speed !== null && speed >= 0 ? speed : null,
        heading: heading !== null && heading >= 0 && heading < 360 ? heading : null,
        at
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.at - b.at);
};

/** Assignments that ride a trip in this direction. */
const shiftFilter = (direction) => ({ shift: { $in: [direction, 'both'] } });

/** The token inside a scanned QR (or the raw token typed in). */
const parseCardToken = (value) => {
  const text = String(value || '').trim();
  const token = text.startsWith(ID_CARD_QR_PREFIX) ? text.slice(ID_CARD_QR_PREFIX.length) : text;
  return /^[A-Za-z0-9_-]{16,64}$/.test(token) ? token : '';
};

const sortedStops = (route) => [...(route?.stops || [])]
  .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

const publicStop = (stop) => ({
  id: stop._id ? String(stop._id) : '',
  name: stop.name,
  landmark: stop.landmark || '',
  pickupTime: stop.pickupTime || '',
  dropTime: stop.dropTime || '',
  sequence: stop.sequence || 0,
  lat: typeof stop.lat === 'number' ? stop.lat : null,
  lng: typeof stop.lng === 'number' ? stop.lng : null
});

/** Seconds since the bus last reported, or null when it never has. */
const staleSeconds = (trip, now = new Date()) => (trip?.lastLocation?.at
  ? Math.max(0, Math.round((now.getTime() - new Date(trip.lastLocation.at).getTime()) / 1000))
  : null);

module.exports = {
  STALE_TRIP_MS,
  MAX_ACCURACY_M,
  ID_CARD_QR_PREFIX,
  serviceDate,
  closeStaleTrips,
  sanitizePoints,
  shiftFilter,
  parseCardToken,
  sortedStops,
  publicStop,
  staleSeconds
};
