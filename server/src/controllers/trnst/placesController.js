/**
 * TRNST place search for setting stops on the map.
 *
 * Proxies OpenStreetMap's Nominatim so we follow its usage policy in one place:
 * an identifying User-Agent, at most one request a second for the whole server,
 * results cached, and searches only on demand (the client never searches as you type).
 */
const asyncHandler = require('../../middleware/asyncHandler');

const NOMINATIM_URL = process.env.GEOCODER_URL || 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'Capabble school transport (https://capabble.cloud; no-reply@capabble.cloud)';
const MIN_GAP_MS = 1100;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE = 2000;
const TIMEOUT_MS = 8000;

const cache = new Map();
let nextSlot = 0;

/** Wait our turn so the server sends at most one search a second. */
const takeSlot = async () => {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + MIN_GAP_MS;
  if (at > now) await new Promise((resolve) => { setTimeout(resolve, at - now); });
};

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

// OpenStreetMap often holds one place several times (the circle, its park, its road).
const SAME_PLACE_M = 500;
const isSamePlace = (a, b) => {
  if (a.name.toLowerCase() !== b.name.toLowerCase()) return false;
  const metresPerDegree = 111320;
  const dLat = (a.lat - b.lat) * metresPerDegree;
  const dLng = (a.lng - b.lng) * metresPerDegree * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng) < SAME_PLACE_M;
};

const searchNominatim = async (query, near) => {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    countrycodes: 'in',
    limit: '6',
    addressdetails: '0'
  });
  // Prefer places around the route's other stops, without excluding the rest.
  if (near) {
    params.set('viewbox', [near.lng - 0.5, near.lat + 0.5, near.lng + 0.5, near.lat - 0.5].join(','));
  }

  await takeSlot();
  const response = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`Place search failed (${response.status})`);
  const rows = await response.json();
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      name: String(row.name || row.display_name || '').trim(),
      address: String(row.display_name || '').trim(),
      // "city", "district", "bus_stop"… tells apart places that share a name.
      kind: String(row.addresstype || row.type || '').replace(/_/g, ' '),
      lat: toNumber(row.lat),
      lng: toNumber(row.lon)
    }))
    .filter((row) => row.lat !== null && row.lng !== null)
    .filter((row, index, all) => !all.slice(0, index).some((earlier) => isSamePlace(earlier, row)));
};

// GET /api/trnst/places?q=&near=lat,lng
const searchPlaces = asyncHandler(async (req, res) => {
  const query = String(req.query.q || '').trim().replace(/\s+/g, ' ');
  if (query.length < 3) {
    return res.status(400).json({ success: false, message: 'Type at least 3 letters to search.' });
  }
  if (query.length > 120) {
    return res.status(400).json({ success: false, message: 'Search for a shorter place name.' });
  }
  const [lat, lng] = String(req.query.near || '').split(',').map(toNumber);
  const near = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;

  const key = `${query.toLowerCase()}|${near ? `${near.lat.toFixed(1)},${near.lng.toFixed(1)}` : ''}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return res.json({ success: true, data: hit.rows });

  try {
    const rows = await searchNominatim(query, near);
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
    cache.set(key, { rows, expires: Date.now() + CACHE_TTL_MS });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(502)
      .json({ success: false, message: 'Place search is not working right now. Click the map instead.' });
  }
});

module.exports = { searchPlaces };
