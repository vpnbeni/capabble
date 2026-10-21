jest.mock('../../../utils/pdfGenerator', () => ({ generatePDF: jest.fn(async () => Buffer.from('%PDF')) }));
jest.mock('puppeteer', () => ({ launch: jest.fn() }));

const { PermissionSet, resolvePermissionSet } = require('../../../rbac/permissions');
const { resolveRouteRequirement } = require('../../../rbac/catalog');
const { sanitizePoints, parseCardToken, ID_CARD_QR_PREFIX } = require('../trips');
const access = require('../access');
const crew = require('../../../controllers/trnst/crewController');
const portal = require('../../../controllers/portalController');
const idCards = require('../../../controllers/idCardController');

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
