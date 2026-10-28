/**
 * The page inside the bus map's WebView: a Leaflet map that draws the road, the stops and
 * the vehicle, and plays the vehicle along the frames the app sends. The geometry (which
 * way the road goes, where the vehicle is on it) is worked out in the app with
 * `@capabble/shared/roadPath`; this page only draws and animates.
 *
 * Messages (JSON) go to `window.cbMapApply`:
 * - `{ type: 'scene', road, cum, stops, forward, colors, tileUrl, attribution }` once per route
 * - `{ type: 'vehicle', frames: [{ lat, lng, bearing, along }], durationMs, svg, width, height, label, stale }` per location
 */

// Leaflet 1.9.4 from unpkg, pinned with its published integrity hashes.
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
const LEAFLET_CSS_SRI = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
const LEAFLET_JS_SRI = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='

const SCRIPT = String.raw`
(function () {
  var map = L.map('map', { zoomControl: false, attributionControl: true }).setView([22.6, 79.0], 5);
  var tiles = null, casing = null, ahead = null, driven = null;
  var stopsLayer = L.layerGroup().addTo(map);
  var scene = null, vehicle = null, rotation = null, shown = null, raf = null;
  var follow = true, fitted = false;
  var recentre = document.getElementById('recentre');

  function post(message) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(message));
    else if (window.parent !== window) window.parent.postMessage(JSON.stringify(message), '*');
  }

  map.on('dragstart', function () { follow = false; recentre.hidden = false; });
  recentre.addEventListener('click', function () {
    follow = true;
    recentre.hidden = true;
    if (shown) map.flyTo([shown.lat, shown.lng], Math.max(map.getZoom(), 15), { duration: 0.5 });
    else fitAll();
  });

  function fitAll() {
    var points = [];
    if (scene && scene.road) points = points.concat(scene.road);
    if (scene) scene.stops.forEach(function (s) { points.push([s.lat, s.lng]); });
    if (shown) points.push([shown.lat, shown.lng]);
    if (points.length === 1) map.setView(points[0], 15);
    else if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 16 });
  }

  function turn(from, to) { return ((to - from + 540) % 360) - 180; }

  function setScene(next) {
    scene = next;
    var c = next.colors;
    document.documentElement.style.setProperty('--accent', c.accent);
    document.documentElement.style.setProperty('--surface', c.surface);
    document.documentElement.style.setProperty('--ink', c.ink);
    document.documentElement.style.setProperty('--ink-subtle', c.inkSubtle);
    document.documentElement.style.setProperty('--border', c.border);
    if (!tiles) tiles = L.tileLayer(next.tileUrl, { maxZoom: 19, attribution: next.attribution }).addTo(map);
    [casing, ahead, driven].forEach(function (layer) { if (layer) map.removeLayer(layer); });
    casing = ahead = driven = null;
    var round = { lineCap: 'round', lineJoin: 'round', interactive: false };
    if (next.road && next.road.length > 1) {
      casing = L.polyline(next.road, Object.assign({ color: c.surface, weight: 10, opacity: 0.95 }, round)).addTo(map);
      driven = L.polyline([], Object.assign({ color: c.inkSubtle, weight: 5, opacity: 0.7 }, round)).addTo(map);
      ahead = L.polyline(next.road, Object.assign({ color: c.accent, weight: 5 }, round)).addTo(map);
    } else if (next.stops.length > 1) {
      ahead = L.polyline(next.stops.map(function (s) { return [s.lat, s.lng]; }), { color: c.inkSubtle, weight: 3, dashArray: '6 6', interactive: false }).addTo(map);
    }
    stopsLayer.clearLayers();
    next.stops.forEach(function (s, i) {
      L.marker([s.lat, s.lng], {
        icon: L.divIcon({ className: '', html: '<span class="pin' + (s.mine ? ' pin--mine' : '') + '">' + (i + 1) + '</span>', iconSize: [24, 24], iconAnchor: [12, 12] }),
        keyboard: false
      }).addTo(stopsLayer);
    });
    if (!fitted) { fitted = true; fitAll(); }
  }

  // Grey the road behind the vehicle, accent ahead of it.
  function splitAt(along) {
    if (!scene || !scene.road || !scene.cum || typeof along !== 'number' || !ahead || !driven) return;
    var road = scene.road, cum = scene.cum, before = [], after = [];
    for (var i = 0; i < road.length; i++) (cum[i] <= along ? before : after).push(road[i]);
    var here = [shown.lat, shown.lng];
    before.push(here);
    after.unshift(here);
    if (scene.forward) { driven.setLatLngs(before); ahead.setLatLngs(after); }
    else { driven.setLatLngs(after); ahead.setLatLngs(before); }
  }

  function draw(frame) {
    shown = frame;
    vehicle.setLatLng([frame.lat, frame.lng]);
    rotation = rotation === null ? frame.bearing : rotation + turn(rotation, frame.bearing);
    var body = vehicle.getElement() && vehicle.getElement().querySelector('.veh__body');
    if (body) body.style.transform = 'translate(-50%, -50%) rotate(' + rotation.toFixed(1) + 'deg)';
    splitAt(frame.along);
    if (follow && !map.getBounds().pad(-0.2).contains([frame.lat, frame.lng])) map.panTo([frame.lat, frame.lng], { animate: true, duration: 0.6 });
  }

  function metres(a, b) {
    var k = Math.cos(a.lat * Math.PI / 180) * 111320;
    return Math.hypot((b.lng - a.lng) * k, (b.lat - a.lat) * 110540);
  }

  // Position t (0..1) of the way through the frames, at an even speed.
  function frameAt(frames, lengths, t) {
    var total = lengths[lengths.length - 1];
    if (frames.length === 1 || !total || t >= 1) return frames[frames.length - 1];
    var target = t * total, i = 0;
    while (i < frames.length - 2 && lengths[i + 1] < target) i++;
    var span = lengths[i + 1] - lengths[i], f = span ? (target - lengths[i]) / span : 1;
    var a = frames[i], b = frames[i + 1];
    var along = typeof a.along === 'number' && typeof b.along === 'number' ? a.along + (b.along - a.along) * f : undefined;
    return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f, bearing: a.bearing, along: along };
  }

  function setVehicle(next) {
    var html = '<span class="veh' + (next.stale ? ' veh--stale' : '') + '"><span class="veh__halo"></span>'
      + '<span class="veh__body" style="width:' + next.width + 'px;height:' + next.height + 'px">' + next.svg + '</span>'
      + '<span class="veh__label"></span></span>';
    var key = next.svg + '|' + next.stale + '|' + next.label;
    if (!vehicle) {
      vehicle = L.marker([next.frames[0].lat, next.frames[0].lng], { zIndexOffset: 1000, keyboard: false, interactive: false }).addTo(map);
    }
    if (vehicle._cbKey !== key) {
      vehicle._cbKey = key;
      vehicle.setIcon(L.divIcon({ className: '', html: html, iconSize: [60, 60], iconAnchor: [30, 30] }));
      vehicle.getElement().querySelector('.veh__label').textContent = next.label;
      rotation = null;
      if (shown) draw(shown);
    }
    if (raf) cancelAnimationFrame(raf);
    var frames = next.frames;
    if (frames.length === 1 || !next.durationMs) { draw(frames[frames.length - 1]); return; }
    var lengths = [0];
    for (var i = 1; i < frames.length; i++) lengths.push(lengths[i - 1] + metres(frames[i - 1], frames[i]));
    var start = performance.now();
    function step(now) {
      var t = Math.min(1, (now - start) / next.durationMs);
      draw(frameAt(frames, lengths, t));
      raf = t < 1 ? requestAnimationFrame(step) : null;
    }
    raf = requestAnimationFrame(step);
  }

  window.cbMapApply = function (message) {
    var data = typeof message === 'string' ? JSON.parse(message) : message;
    if (data.type === 'scene') setScene(data);
    else if (data.type === 'vehicle') setVehicle(data);
  };
  window.addEventListener('message', function (event) {
    try { if (typeof event.data === 'string' && event.data.indexOf('"type"') > 0) window.cbMapApply(event.data); } catch (e) {}
  });
  post({ type: 'ready' });
})();
`

const STYLE = `
html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: var(--surface, transparent); }
body { -webkit-tap-highlight-color: transparent; font: 500 12px/16px -apple-system, Roboto, sans-serif; }
.leaflet-control-attribution { font-size: 9px; }
.pin { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; box-sizing: border-box; border-radius: 50%;
  background: var(--surface); color: var(--ink); border: 2px solid var(--ink-subtle); font-weight: 600; font-size: 12px; }
.pin--mine { background: var(--accent); border-color: var(--accent); color: var(--surface); }
.veh { position: relative; display: block; width: 60px; height: 60px; }
.veh__halo { position: absolute; left: 50%; top: 50%; width: 30px; height: 30px; margin: -15px 0 0 -15px; border-radius: 50%;
  background: var(--accent); opacity: .25; animation: pulse 2s ease-out infinite; }
.veh__body { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); transition: transform .4s linear;
  filter: drop-shadow(0 2px 2px rgba(0, 0, 0, .35)); }
.veh__body svg { display: block; width: 100%; height: 100%; }
.veh__label { position: absolute; left: 40px; top: 2px; max-width: 64px; padding: 1px 6px; border-radius: 999px; background: var(--surface);
  color: var(--ink); border: 1px solid var(--border); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; font-size: 11px; }
.veh--stale .veh__halo { display: none; }
.veh--stale .veh__body { filter: grayscale(1) opacity(.65); }
@keyframes pulse { from { transform: scale(.6); opacity: .35; } to { transform: scale(1.8); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .veh__halo { animation: none; } .veh__body { transition: none; } }
#recentre { position: absolute; z-index: 1000; right: 10px; top: 10px; min-height: 36px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--border);
  background: var(--surface); color: var(--ink); font: inherit; font-weight: 600; font-size: 13px; box-shadow: 0 1px 4px rgba(0, 0, 0, .2); }
#recentre[hidden] { display: none; }
`

/** The whole page, ready for a WebView `source.html` or an iframe `srcDoc`. */
export function busMapHtml(recentreLabel: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="${LEAFLET_CSS}" integrity="${LEAFLET_CSS_SRI}" crossorigin="">
<style>${STYLE}</style></head>
<body><div id="map"></div><button id="recentre" type="button" hidden>${recentreLabel}</button>
<script src="${LEAFLET_JS}" integrity="${LEAFLET_JS_SRI}" crossorigin=""></script>
<script>${SCRIPT}</script></body></html>`
}
