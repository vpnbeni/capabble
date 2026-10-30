jest.mock('../../../utils/pdfGenerator', () => ({ generatePDF: jest.fn(async () => Buffer.from('%PDF')) }));
jest.mock('puppeteer', () => ({ launch: jest.fn() }));

const { PermissionSet, resolvePermissionSet } = require('../../../rbac/permissions');
const { resolveRouteRequirement } = require('../../../rbac/catalog');
const { sanitizePoints, parseCardToken, ID_CARD_QR_PREFIX } = require('../trips');
const access = require('../access');
const crew = require('../../../controllers/trnst/crewController');
const portal = require('../../../controllers/portalController');
const idCards = require('../../../controllers/idCardController');
const places = require('../../../controllers/trnst/placesController');
const roadPath = require('../roadPath');

const MY_BUS = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER_BUS = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const ROUTE = 'cccccccccccccccccccccccc';
const TRIP = 'dddddddddddddddddddddddd';
const STUDENT = 'eeeeeeeeeeeeeeeeeeeeeeee';
const TEACHER = 'ffffffffffffffffffffffff';
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv';

// Minimal stand-in for a Mongoose query: chainable and awaitable.
const query = (result) => {
  const q = {};
  ['select', 'sort', 'skip', 'limit', 'lean', 'populate'].forEach((name) => { q[name] = () => q; });
  q.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return q;
};

/** Run an asyncHandler-wrapped controller and resolve with the response it sent. */
const run = (handler, req) => new Promise((resolve, reject) => {
  const res = {};
  res.statusCode = 200;
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.json = jest.fn((body) => { resolve({ status: res.statusCode, body }); return res; });
  res.setHeader = jest.fn();
  res.send = jest.fn((body) => { resolve({ status: res.statusCode, body }); return res; });
  handler(req, res, (error) => (error ? reject(error) : resolve({ status: 'next' })));
});

const grants = (...keys) => new PermissionSet(keys.map((key) => ({ key, scope: 'all' })));

describe('TRNST permissions', () => {
  it('sends crew routes to the crew permissions and live views to trips.read', () => {
    expect(resolveRouteRequirement('POST', '/trnst/crew/trips'))
      .toMatchObject({ anyOf: ['trnst.trips.operate', 'trnst.boarding.mark'] });
    expect(resolveRouteRequirement('GET', '/trnst/live')).toMatchObject({ anyOf: ['trnst.trips.read'] });
    expect(resolveRouteRequirement('GET', '/trnst/trips/123')).toMatchObject({ anyOf: ['trnst.trips.read'] });
    expect(resolveRouteRequirement('POST', '/trnst/assignments/bulk'))
      .toMatchObject({ anyOf: ['trnst.transport.write'] });
    expect(resolveRouteRequirement('POST', '/id-cards/generate')).toMatchObject({ anyOf: ['stdnt.idcards.write'] });
  });

  it('gives a driver the crew screen but not vehicle admin', async () => {
    const set = await resolvePermissionSet({ kind: 'staff', roles: ['driver'] });
    expect(set.has('trnst.trips.operate')).toBe(true);
    expect(set.has('trnst.boarding.mark')).toBe(true);
    expect(set.has('trnst.transport.write')).toBe(false);
    expect(set.has('trnst.transport.read')).toBe(false);
  });
});

describe('TRNST location points', () => {
  const now = new Date('2026-10-21T02:00:00.000Z');

  it('keeps accurate, recent points in time order', () => {
    const points = sanitizePoints([
      { lat: 26.9, lng: 75.8, accuracy: 12, at: '2026-10-21T01:59:50.000Z' },
      { lat: 26.91, lng: 75.81, accuracy: 8, at: '2026-10-21T01:59:40.000Z' }
    ], { now });
    expect(points.map((point) => point.lat)).toEqual([26.91, 26.9]);
  });

  it('drops inaccurate, future, ancient, null-island and malformed points', () => {
    const points = sanitizePoints([
      { lat: 26.9, lng: 75.8, accuracy: 900, at: now.toISOString() },
      { lat: 26.9, lng: 75.8, accuracy: 5, at: '2026-10-21T02:10:00.000Z' },
      { lat: 26.9, lng: 75.8, accuracy: 5, at: '2026-10-20T20:00:00.000Z' },
      { lat: 0, lng: 0, accuracy: 5, at: now.toISOString() },
      { lat: 'x', lng: 75.8, at: now.toISOString() },
      { lat: 95, lng: 75.8, at: now.toISOString() }
    ], { now });
    expect(points).toEqual([]);
  });

  it('reads the token from a scanned QR or a typed code', () => {
    expect(parseCardToken(`${ID_CARD_QR_PREFIX}${TOKEN}`)).toBe(TOKEN);
    expect(parseCardToken(` ${TOKEN} `)).toBe(TOKEN);
    expect(parseCardToken('Admit Card: AC123')).toBe('');
  });
});

describe('TRNST crew scope', () => {
  const vehicleModel = (ids) => ({ find: jest.fn(() => query(ids.map((_id) => ({ _id })))) });

  it('limits a crew member to the buses they drive or conduct', async () => {
    const Vehicle = vehicleModel([MY_BUS]);
    const req = {
      user: { _id: 'u1', teacher: TEACHER }, rbac: grants('trnst.trips.operate'), models: { TransportVehicle: Vehicle }
    };
    expect(await access.getMyVehicleIds(req)).toEqual([MY_BUS]);
    expect(Vehicle.find.mock.calls[0][0].$or).toEqual([{ driverId: TEACHER }, { conductorId: TEACHER }]);
    expect(await access.crewsVehicle(req, OTHER_BUS)).toBe(false);
  });

  it('crews nothing without a staff record', async () => {
    const req = {
      user: { _id: 'u1' }, rbac: grants('trnst.trips.operate'), models: { TransportVehicle: vehicleModel([MY_BUS]) }
    };
    expect(await access.getMyVehicleIds(req)).toEqual([]);
  });

  it('won\'t start a trip on someone else\'s bus', async () => {
    const req = {
      body: { routeId: ROUTE, direction: 'pickup' },
      user: { _id: 'u1', teacher: TEACHER },
      rbac: grants('trnst.trips.operate'),
      models: {
        TransportVehicle: vehicleModel([MY_BUS]),
        TransportRoute: { findOne: jest.fn(() => query({ _id: ROUTE, vehicleId: OTHER_BUS })) },
        TransportTrip: { create: jest.fn() }
      }
    };
    const result = await run(crew.startTrip, req);
    expect(result.status).toBe(404);
    expect(req.models.TransportTrip.create).not.toHaveBeenCalled();
  });
});

describe('TRNST boarding', () => {
  const trip = {
    _id: TRIP,
    vehicleId: MY_BUS,
    routeId: ROUTE,
    direction: 'pickup',
    status: 'active',
    lastLocation: { lat: 26.9, lng: 75.8 }
  };
  const student = { _id: STUDENT, name: 'Aarav Sharma', class: '7', section: 'B' };

  const reqFor = ({ found = student, onRoute = true, existed = false, body } = {}) => ({
    params: { id: TRIP },
    body: body || { token: `${ID_CARD_QR_PREFIX}${TOKEN}`, method: 'scan' },
    user: { _id: 'u1', teacher: TEACHER, name: 'Conductor' },
    rbac: grants('trnst.boarding.mark'),
    tenant: { slug: 't' },
    models: {
      TransportVehicle: { find: jest.fn(() => query([{ _id: MY_BUS }])) },
      TransportTrip: { findById: jest.fn(async () => trip) },
      Student: { findOne: jest.fn(() => query(found)), findById: jest.fn(() => query(found)) },
      TransportAssignment: { findOne: jest.fn(() => query(onRoute ? { _id: 'as1' } : null)) },
      TransportBoarding: {
        findOneAndUpdate: jest.fn(async () => ({
          value: { at: new Date() }, lastErrorObject: { updatedExisting: existed }
        })),
        deleteMany: jest.fn(async () => ({}))
      }
    }
  });

  it('marks a scanned student as boarded on a pickup trip', async () => {
    const req = reqFor();
    const result = await run(crew.markBoarding, req);
    expect(result.status).toBe(201);
    expect(result.body.data).toMatchObject({ event: 'boarded', duplicate: false, student: { name: 'Aarav Sharma' } });
    expect(req.models.Student.findOne.mock.calls[0][0]).toMatchObject({ idCardToken: TOKEN });
    expect(req.models.TransportBoarding.deleteMany.mock.calls[0][0]).toMatchObject({ event: { $in: ['absent'] } });
  });

  it('records a second scan of the same card only once', async () => {
    const result = await run(crew.markBoarding, reqFor({ existed: true }));
    expect(result.status).toBe(200);
    expect(result.body.data.duplicate).toBe(true);
  });

  it('turns away a student from another route', async () => {
    const result = await run(crew.markBoarding, reqFor({ onRoute: false }));
    expect(result.status).toBe(422);
    expect(result.body).toMatchObject({ errorCode: 'not_on_route' });
  });

  it('rejects a replaced card and a code that is not an ID card', async () => {
    expect((await run(crew.markBoarding, reqFor({ found: null }))).body).toMatchObject({ errorCode: 'unknown_card' });
    const typed = await run(crew.markBoarding, reqFor({ body: { token: 'hello' } }));
    expect(typed.body).toMatchObject({ errorCode: 'invalid_card' });
  });

  it('can\'t mark on a bus the user doesn\'t crew', async () => {
    const req = reqFor();
    req.models.TransportVehicle.find = jest.fn(() => query([]));
    expect((await run(crew.markBoarding, req)).status).toBe(404);
  });
});

describe('TRNST family portal', () => {
  const reqFor = (trip) => ({
    user: { kind: 'parent' },
    tenant: { featureToggles: {} },
    portalStudent: { _id: STUDENT, busNo: '4' },
    models: {
      TransportAssignment: {
        findOne: jest.fn(() => query({ studentId: STUDENT, routeId: ROUTE, stopId: 'stop1', shift: 'both' }))
      },
      TransportRoute: {
        findOne: jest.fn(() => query({ _id: ROUTE, name: 'Malviya Nagar', code: 'R4', vehicleId: MY_BUS, stops: [] }))
      },
      TransportVehicle: { findById: jest.fn(() => query({ busNo: '4' })) },
      TransportTrip: {
        updateMany: jest.fn(async () => ({})),
        findOne: jest.fn(() => query(trip)),
        find: jest.fn(() => query([]))
      },
      TransportBoarding: { find: jest.fn(() => query([])) }
    }
  });

  it('shares no location while the bus is not on a trip', async () => {
    const result = await run(portal.getTransportLive, reqFor(null));
    expect(result.body.data).toMatchObject({ active: false, trip: null });
  });

  it('shows the bus on the child\'s route while it is on a trip', async () => {
    const at = new Date();
    const trip = { _id: TRIP, direction: 'pickup', startedAt: at, lastLocation: { lat: 26.9, lng: 75.8, at } };
    const result = await run(portal.getTransportLive, reqFor(trip));
    expect(result.body.data).toMatchObject({ active: true, busNo: '4', trip: { bus: { lat: 26.9, lng: 75.8 } } });
  });
});

describe('ID cards', () => {
  it('fills defaults and rejects bad colours', () => {
    const design = idCards.parseDesign({ accentColor: 'red', orientation: 'landscape' });
    expect(design.accentColor).toBe('#1e3a8a');
    expect(design.orientation).toBe('landscape');
    expect(design.fields.qr).toBe(true);
  });

  it('lays backs out mirrored for two-sided printing', () => {
    const cards = ['a', 'b', 'c', 'd'].map((name) => ({ name }));
    const pages = idCards.buildPages(cards, idCards.parseDesign({ orientation: 'landscape', showBack: true }));
    expect(pages).toHaveLength(2);
    expect(pages[1].isBack).toBe(true);
    expect(pages[1].cards.map((card) => card.name)).toEqual(['b', 'a', 'd', 'c']);
  });

  const generateReq = (students, body = {}) => ({
    body: { class: '7', section: 'B', ...body },
    tenant: { slug: 't' },
    models: {
      Student: {
        find: jest.fn(() => query(students)),
        bulkWrite: jest.fn(async () => ({}))
      },
      SchoolProfile: { findOne: jest.fn(() => query({ schoolName: 'Green Valley' })) },
      AcademicSession: { findOne: jest.fn(() => query({ label: '2026-2027' })) }
    }
  });

  it('issues a QR token only to students without one', async () => {
    const req = generateReq([{ _id: STUDENT, name: 'A', idCardToken: TOKEN }, { _id: TEACHER, name: 'B' }]);
    const result = await run(idCards.generateCards, req);
    expect(result.status).toBe(200);
    const updates = req.models.Student.bulkWrite.mock.calls[0][0];
    expect(updates).toHaveLength(1);
    expect(updates[0].updateOne.filter._id).toBe(TEACHER);
    expect(updates[0].updateOne.update.$set.idCardToken).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('replaces every token when cards are reissued', async () => {
    const req = generateReq([{ _id: STUDENT, name: 'A', idCardToken: TOKEN }], { reissue: true });
    await run(idCards.generateCards, req);
    const updates = req.models.Student.bulkWrite.mock.calls[0][0];
    expect(updates).toHaveLength(1);
    expect(updates[0].updateOne.update.$set.idCardToken).not.toBe(TOKEN);
  });
});

describe('TRNST place search', () => {
  const found = [
    { name: 'Jawahar Circle', display_name: 'Jawahar Circle, Jaipur, Rajasthan', lat: '26.8398', lon: '75.8009' }
  ];

  afterEach(() => jest.restoreAllMocks());

  it('asks for at least 3 letters before searching', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const result = await run(places.searchPlaces, { query: { q: 'ab' } });
    expect(result.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('searches India with our app name and caches the answer', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => found });
    const first = await run(places.searchPlaces, { query: { q: 'Jawahar Circle', near: '26.85,75.80' } });
    expect(first.body.data).toEqual([
      { name: 'Jawahar Circle', address: 'Jawahar Circle, Jaipur, Rajasthan', kind: '', lat: 26.8398, lng: 75.8009 }
    ]);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toContain('countrycodes=in');
    expect(url).toContain('viewbox=');
    expect(options.headers['User-Agent']).toMatch(/Capabble/);

    await run(places.searchPlaces, { query: { q: 'jawahar circle', near: '26.85,75.80' } });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('says so when the search service is down', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 503, json: async () => [] });
    const result = await run(places.searchPlaces, { query: { q: 'Sector 14 Gurgaon' } });
    expect(result.status).toBe(502);
  });
});

describe('TRNST road path', () => {
  const stops = [
    { _id: 's1', name: 'Gate', sequence: 1, lat: 26.9001, lng: 75.8001 },
    { _id: 's2', name: 'Circle', sequence: 2, lat: 26.9101, lng: 75.8101 },
    { _id: 's3', name: 'Market', sequence: 3, lat: 26.9201, lng: 75.8051 }
  ];
  const road = [
    [26.9001, 75.8001], [26.9001, 75.8051], [26.9101, 75.8051], [26.9101, 75.8101], [26.9201, 75.8051]
  ];
  const osrm = () => ({
    ok: true,
    json: async () => ({
      code: 'Ok',
      routes: [{ geometry: roadPath.encodePolyline(road), distance: 4321.4, duration: 610.2 }]
    })
  });

  beforeEach(() => roadPath.resetForTests());
  afterEach(() => jest.restoreAllMocks());

  it('encodes and decodes the polyline format', () => {
    // Google's documented example.
    const points = [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]];
    expect(roadPath.encodePolyline(points)).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(roadPath.decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual(points);
  });

  it('drops points that sit on a straight stretch', () => {
    const straight = [[26.9, 75.8], [26.9, 75.801], [26.9, 75.802], [26.9, 75.803]];
    expect(roadPath.simplify(straight)).toEqual([[26.9, 75.8], [26.9, 75.803]]);
    expect(roadPath.simplify(road)).toHaveLength(road.length);
  });

  it('asks the routing server once and keeps the road on the route', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(osrm());
    const Route = { updateOne: jest.fn(async () => ({})) };
    const route = { _id: ROUTE, stops: [stops[2], stops[0], stops[1]] };

    const [first, second] = await Promise.all([
      roadPath.roadPathFor(Route, route),
      roadPath.roadPathFor(Route, route)
    ]);
    expect(first).toEqual({ polyline: roadPath.encodePolyline(road), distanceM: 4321, durationS: 610 });
    expect(second).toEqual(first);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // Stops in driving order, as lng,lat.
    expect(fetchSpy.mock.calls[0][0])
      .toContain('/route/v1/driving/75.800100,26.900100;75.810100,26.910100;75.805100,26.920100?');
    expect(Route.updateOne).toHaveBeenCalledWith(
      { _id: ROUTE },
      { $set: { roadPath: expect.objectContaining({ key: expect.any(String), distanceM: 4321 }) } }
    );

    // A saved path with the same stops is used as is.
    const saved = Route.updateOne.mock.calls[0][1].$set.roadPath;
    expect(await roadPath.roadPathFor(Route, { ...route, roadPath: saved })).toEqual(first);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Moving a stop asks again.
    const moved = { ...route, roadPath: saved, stops: [stops[0], stops[1], { ...stops[2], lat: 26.93 }] };
    await roadPath.roadPathFor(Route, moved);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('gives no road for fewer than two placed stops, and none (without retrying) when routing fails', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await roadPath.roadPathFor(null, { stops: [stops[0], { name: 'No pin', sequence: 2 }] })).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();

    const route = { _id: ROUTE, stops };
    expect(await roadPath.roadPathFor(null, route)).toBeNull();
    expect(await roadPath.roadPathFor(null, route)).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('sends the road and the vehicle type to families', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(osrm());
    const req = {
      user: { kind: 'parent' },
      tenant: { featureToggles: {} },
      portalStudent: { _id: STUDENT, busNo: '4' },
      models: {
        TransportAssignment: {
          findOne: jest.fn(() => query({ studentId: STUDENT, routeId: ROUTE, stopId: 's2', shift: 'both' }))
        },
        TransportRoute: {
          findOne: jest.fn(() => query({ _id: ROUTE, name: 'Malviya Nagar', code: 'R4', vehicleId: MY_BUS, stops })),
          updateOne: jest.fn(async () => ({}))
        },
        TransportVehicle: { findById: jest.fn(() => query({ busNo: '4', vehicleType: 'Auto' })) },
        TransportTrip: {
          updateMany: jest.fn(async () => ({})),
          findOne: jest.fn(() => query(null)),
          find: jest.fn(() => query([]))
        },
        TransportBoarding: { find: jest.fn(() => query([])) }
      }
    };
    const result = await run(portal.getTransportLive, req);
    expect(result.body.data).toMatchObject({ vehicleType: 'Auto', roadPath: { distanceM: 4321, durationS: 610 } });
  });
});

describe('crew student card contacts', () => {
  const { familyContacts } = require('../../../controllers/trnst/crewController');

  it('puts the school phone on the father when he is the guardian', () => {
    expect(familyContacts({
      fatherName: 'Vinod Dalal', motherName: 'Suman Dalal', guardianName: 'Vinod Dalal', guardianPhone: '9812000001'
    })).toEqual([
      { relation: 'Father', name: 'Vinod Dalal', phone: '9812000001' },
      { relation: 'Mother', name: 'Suman Dalal', phone: '' }
    ]);
  });

  it('puts it on the mother, or on a separate guardian', () => {
    expect(familyContacts({ fatherName: 'A', motherName: 'B', guardianName: 'b', guardianPhone: '9' })[1])
      .toEqual({ relation: 'Mother', name: 'B', phone: '9' });
    expect(familyContacts({ fatherName: 'A', guardianName: 'Uncle C', guardianPhone: '9' }))
      .toEqual([{ relation: 'Father', name: 'A', phone: '' }, { relation: 'Guardian', name: 'Uncle C', phone: '9' }]);
  });

  it('still gives a number when no names are on the record', () => {
    expect(familyContacts({ guardianPhone: '9' })).toEqual([{ relation: 'Parent', name: '', phone: '9' }]);
  });
});
