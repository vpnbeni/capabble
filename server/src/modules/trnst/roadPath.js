/**
 * TRNST road path: the way a route's bus actually drives between its stops, along
 * the roads, so maps draw the road instead of straight lines from stop to stop.
 *
 * Asks an OSRM server (ROUTING_URL, the public OSRM server by default) once per
 * set of stop positions and keeps the answer on the route, so it is fetched again
 * only when a stop moves. Requests are spaced a second apart across the server,
 * duplicate requests share one answer, and a failure is not retried for a while.
 * Callers get null when there is no road path; maps then fall back to straight lines.
 */
const crypto = require('crypto');
const { sortedStops } = require('./trips');

const ROUTING_URL = (process.env.ROUTING_URL || 'https://router.project-osrm.org').replace(/\/+$/, '');
const USER_AGENT = 'Capabble school transport (https://capabble.cloud; no-reply@capabble.cloud)';
const MIN_GAP_MS = 1100;
const TIMEOUT_MS = 8000;
const RETRY_AFTER_FAILURE_MS = 10 * 60 * 1000;
// Coordinates per request; longer routes are asked for in overlapping pieces.
const MAX_POINTS_PER_REQUEST = 25;
// Points closer to the straight line than this are dropped (keeps the payload small).
const SIMPLIFY_TOLERANCE_M = 4;
const PATH_VERSION = 1;

const disabled = () => !ROUTING_URL || ROUTING_URL === 'off';

let nextSlot = 0;
const inflight = new Map();
const failedAt = new Map();

/** Wait our turn so the server sends at most one routing request a second. */
const takeSlot = async () => {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + MIN_GAP_MS;
  if (at > now) await new Promise((resolve) => { setTimeout(resolve, at - now); });
};

// Google's encoded polyline format, precision 5 (about 1 m). The format is bit-packed.
/* eslint-disable no-bitwise */
const decodePolyline = (text) => {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let byte;
    do {
      byte = text.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < text.length);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < text.length) {
    lat += next();
    lng += next();
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
};

const encodeValue = (value) => {
  let rest = value < 0 ? ~(value << 1) : value << 1;
  let out = '';
  while (rest >= 0x20) {
    out += String.fromCharCode((0x20 | (rest & 0x1f)) + 63);
    rest >>= 5;
  }
  return out + String.fromCharCode(rest + 63);
};

const encodePolyline = (points) => {
  let lastLat = 0;
  let lastLng = 0;
  return points.map(([lat, lng]) => {
    const y = Math.round(lat * 1e5);
    const x = Math.round(lng * 1e5);
    const part = encodeValue(y - lastLat) + encodeValue(x - lastLng);
    lastLat = y;
    lastLng = x;
    return part;
  }).join('');
};
/* eslint-enable no-bitwise */

/** Douglas–Peucker on a local flat projection; fine at city scale. */
const simplify = (points, toleranceM = SIMPLIFY_TOLERANCE_M) => {
  if (points.length < 3) return points;
  const lat0 = (points[0][0] * Math.PI) / 180;
  const xy = points.map(([lat, lng]) => [lng * 111320 * Math.cos(lat0), lat * 110540]);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    const [ax, ay] = xy[first];
    const [bx, by] = xy[last];
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    let worst = 0;
    let worstIndex = -1;
    for (let i = first + 1; i < last; i += 1) {
      const [px, py] = xy[i];
      const t = lengthSq ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq)) : 0;
      const distance = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (distance > worst) {
        worst = distance;
        worstIndex = i;
      }
    }
    if (worstIndex > 0 && worst > toleranceM) {
      keep[worstIndex] = 1;
      stack.push([first, worstIndex], [worstIndex, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
};

/** Stops with a map position, in driving order. */
const placedStops = (route) => sortedStops(route)
  .filter((stop) => typeof stop.lat === 'number' && typeof stop.lng === 'number');

/** Changes whenever a stop moves, is added or removed, or the routing server changes. */
const pathKey = (stops) => crypto
  .createHash('sha1')
  .update([PATH_VERSION, ROUTING_URL, ...stops.map((stop) => `${stop.lat.toFixed(5)},${stop.lng.toFixed(5)}`)]
    .join('|'))
  .digest('hex')
  .slice(0, 20);

const requestLeg = async (stops) => {
  const coordinates = stops.map((stop) => `${stop.lng.toFixed(6)},${stop.lat.toFixed(6)}`).join(';');
  await takeSlot();
  const response = await fetch(
    `${ROUTING_URL}/route/v1/driving/${coordinates}?overview=full&geometries=polyline&steps=false`,
    { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) }
  );
  if (!response.ok) throw new Error(`Routing server answered ${response.status}`);
  const body = await response.json();
  const route = body?.code === 'Ok' ? body.routes?.[0] : null;
  if (!route || typeof route.geometry !== 'string') {
    throw new Error(`Routing server found no route (${body?.code || 'no answer'})`);
  }
  return { points: decodePolyline(route.geometry), distanceM: route.distance || 0, durationS: route.duration || 0 };
};

/** Ask the routing server for the road through these stops. */
const fetchRoadPath = async (stops) => {
  const legs = [];
  for (let start = 0; start < stops.length - 1; start += MAX_POINTS_PER_REQUEST - 1) {
    // One at a time: the routing server takes a request a second.
    // eslint-disable-next-line no-await-in-loop
    legs.push(await requestLeg(stops.slice(start, start + MAX_POINTS_PER_REQUEST)));
  }
  const points = legs.flatMap((leg, i) => (i === 0 ? leg.points : leg.points.slice(1)));
  return {
    polyline: encodePolyline(simplify(points)),
    distanceM: Math.round(legs.reduce((sum, leg) => sum + leg.distanceM, 0)),
    durationS: Math.round(legs.reduce((sum, leg) => sum + leg.durationS, 0))
  };
};

const publicPath = (saved) => (saved?.polyline
  ? { polyline: saved.polyline, distanceM: saved.distanceM || 0, durationS: saved.durationS || 0 }
  : null);

/**
 * The road path for a route: { polyline, distanceM, durationS } or null.
 * Saves a newly fetched path on the route. Never throws.
 */
const roadPathFor = async (Route, route) => {
  if (!route) return null;
  const stops = placedStops(route);
  if (stops.length < 2 || disabled()) return null;
  const key = pathKey(stops);
  if (route.roadPath?.key === key) return publicPath(route.roadPath);

  const failed = failedAt.get(key);
  if (failed && Date.now() - failed < RETRY_AFTER_FAILURE_MS) return null;

  if (!inflight.has(key)) {
    inflight.set(key, (async () => {
      try {
        const path = await fetchRoadPath(stops);
        if (Route && route._id) {
          await Route.updateOne({ _id: route._id }, { $set: { roadPath: { key, ...path, at: new Date() } } });
        }
        return path;
      } catch (error) {
        failedAt.set(key, Date.now());
        console.warn(`[trnst] road path for route ${route._id || route.code || ''} failed: ${error.message}`);
        return null;
      } finally {
        inflight.delete(key);
      }
    })());
  }
  return inflight.get(key);
};

/** Road paths for several routes, keyed by route id. */
const roadPathsFor = async (Route, routes) => {
  const unique = new Map();
  routes.filter(Boolean).forEach((route) => unique.set(String(route._id), route));
  const entries = await Promise.all([...unique].map(async ([id, route]) => [id, await roadPathFor(Route, route)]));
  return new Map(entries);
};

const resetForTests = () => {
  nextSlot = 0;
  inflight.clear();
  failedAt.clear();
};

module.exports = {
  roadPathFor,
  roadPathsFor,
  decodePolyline,
  encodePolyline,
  simplify,
  pathKey,
  resetForTests
};
