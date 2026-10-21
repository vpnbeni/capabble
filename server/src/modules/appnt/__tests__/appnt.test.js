jest.mock('../../../utils/mailer', () => ({ sendMail: jest.fn(async () => ({})) }));
jest.mock('../../../utils/pdfGenerator', () => ({ generatePDF: jest.fn(async () => Buffer.from('%PDF')) }));
jest.mock('puppeteer', () => ({ launch: jest.fn() }));

const { PermissionSet } = require('../../../rbac/permissions');
const { roleTemplates, resolveRouteRequirement } = require('../../../rbac/catalog');
const { routeAccessGate } = require('../../../rbac/middleware');
const { AUDIENCE } = require('../../../rbac/session');
const { assertTransition, buildSlots, schoolNow, slotKeyFor } = require('../lifecycle');
const access = require('../access');
const { busyPeriodsFromGrid } = require('../../timetable/teacherSchedule');

// Minimal stand-in for a Mongoose query: chainable and awaitable.
const query = (result) => {
  const q = {};
  ['select', 'sort', 'skip', 'limit', 'lean', 'populate'].forEach((name) => { q[name] = () => q; });
  q.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return q;
};

const createRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const HOST_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER_HOST_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const TEACHER_ID = 'cccccccccccccccccccccccc';

// Fixed "now": Monday 19 Oct 2026, 09:00 in India.
const NOW = new Date('2026-10-19T03:30:00.000Z');
const host = {
  _id: HOST_ID,
  displayName: 'Ms Rao',
  isActive: true,
  slotMinutes: 15,
  bufferMinutes: 0,
  maxPerDay: 0,
  weeklyAvailability: [{ day: 1, start: '10:00', end: '11:00' }],
  blockedDates: [{ date: '2026-10-26', reason: 'Training' }]
};

describe('APPNT lifecycle', () => {
  it('allows the normal flow and blocks going backwards', () => {
    expect(() => assertTransition('requested', 'confirmed')).not.toThrow();
    expect(() => assertTransition('confirmed', 'checked_in')).not.toThrow();
    expect(() => assertTransition('checked_in', 'completed')).not.toThrow();
    expect(() => assertTransition('completed', 'confirmed')).toThrow(/can't be moved/);
    expect(() => assertTransition('requested', 'checked_in')).toThrow(/can't be moved/);
  });

  it('reads the date and time in India', () => {
    expect(schoolNow(NOW)).toEqual({ date: '2026-10-19', minutes: 9 * 60 });
    expect(schoolNow(new Date('2026-10-19T19:00:00.000Z')).date).toBe('2026-10-20');
  });
});

describe('APPNT slots', () => {
  it('builds slots from the weekly hours', () => {
    const { slots, closed } = buildSlots({ host, date: '2026-10-19', now: NOW });
    expect(closed).toBe(false);
    expect(slots.map((slot) => slot.start)).toEqual(['10:00', '10:15', '10:30', '10:45']);
    expect(slots.every((slot) => slot.state === 'free')).toBe(true);
  });

  it('is closed on blocked dates, other weekdays and past dates', () => {
    expect(buildSlots({ host, date: '2026-10-26', now: NOW })).toMatchObject({ closed: true, reason: 'Training' });
    expect(buildSlots({ host, date: '2026-10-20', now: NOW }).closed).toBe(true);
    expect(buildSlots({ host, date: '2026-10-12', now: NOW }).reason).toMatch(/passed/);
    expect(buildSlots({ host, date: '2026-12-28', now: NOW, maxAdvanceDays: 30 }).reason).toMatch(/30 days ahead/);
  });

  it('marks taken, teaching and too-soon slots', () => {
    const { slots } = buildSlots({
      host,
      date: '2026-10-19',
      now: NOW,
      minNoticeHours: 1.25, // nothing before 10:15
      appointments: [{ startTime: '10:30', endTime: '10:45', status: 'confirmed' }, { startTime: '10:15', endTime: '10:30', status: 'cancelled' }],
      busyPeriods: [{ start: '10:40', end: '11:20', label: 'Period 3' }]
    });
    expect(slots.map((slot) => slot.state)).toEqual(['past', 'free', 'taken', 'teaching']);
    expect(slots[3].reason).toBe('Period 3');
  });

  it('respects the notice window across days', () => {
    // 24 hours' notice from Monday 09:00: Monday 26 Oct is open, next-day early slots are not.
    const tuesdayHost = { ...host, weeklyAvailability: [{ day: 2, start: '08:00', end: '10:00' }] };
    const { slots } = buildSlots({ host: tuesdayHost, date: '2026-10-20', now: NOW, minNoticeHours: 24 });
    expect(slots.filter((slot) => slot.state === 'past').map((slot) => slot.start)).toEqual(['08:00', '08:15', '08:30', '08:45']);
    expect(slots.find((slot) => slot.start === '09:00').state).toBe('free');
  });

  it('fills the day once the daily limit is reached', () => {
    const { slots } = buildSlots({ host: { ...host, maxPerDay: 1 }, date: '2026-10-19', now: NOW, appointments: [{ startTime: '10:00', endTime: '10:15', status: 'confirmed' }] });
    expect(slots.every((slot) => slot.state === 'taken')).toBe(true);
  });
});

describe('timetable busy periods', () => {
  it('finds a teacher’s periods for the weekday', () => {
    const busy = busyPeriodsFromGrid({
      grid: { c1: { Monday: { p1: { subject: 'Maths', teacher: 'Ms Rao' }, p2: { subject: 'English', teacher: 'Mr Das' } } } },
      bellTimings: { startTime: '08:00', rows: [{ id: 'p1', type: 'period', label: 'Period 1', duration: 40 }, { id: 'b1', type: 'break', label: 'Break', duration: 10 }, { id: 'p2', type: 'period', label: 'Period 2', duration: 40 }] },
      teacherName: 'Ms Rao',
      dayName: 'Monday',
      classes: [{ id: 'c1', className: '7', section: 'A' }]
    });
    expect(busy).toEqual([{ start: '08:00', end: '08:40', label: 'Period 1 · Maths · 7 A' }]);
  });
});

describe('APPNT access', () => {
  const reqFor = (grants, { hosts = [], teacher = TEACHER_ID } = {}) => ({
    user: { _id: 'u1', teacher },
    rbac: new PermissionSet(grants.map((key) => ({ key, scope: 'all' }))),
    models: { AppointmentHost: { find: jest.fn(() => query(hosts.map((_id) => ({ _id })))) } }
  });

  it('gives the front desk every appointment and a host only their own', async () => {
    expect(await access.buildAppointmentScope(reqFor(['appnt.appointments.view']))).toEqual({});
    expect(await access.buildAppointmentScope(reqFor(['appnt.appointments.host'], { hosts: [HOST_ID] }))).toEqual({ host: { $in: [HOST_ID] } });
    expect(await access.buildAppointmentScope(reqFor(['appnt.appointments.host']))).toEqual(access.MATCH_NOTHING);
    expect(await access.buildAppointmentScope(reqFor(['stdnt.students.read']))).toEqual(access.MATCH_NOTHING);
  });

  it('hides private notes from the front desk but not from the host or the principal', async () => {
    const appointment = { _id: 'a1', host: HOST_ID, outcomeNotes: 'Discussed behaviour' };
    const desk = await access.redact(reqFor(['appnt.appointments.view', 'appnt.appointments.manage']), appointment);
    expect(desk.outcomeNotes).toBeUndefined();
    expect(desk).toMatchObject({ canSeeNotes: false, canAct: true });

    const ownHost = await access.redact(reqFor(['appnt.appointments.host'], { hosts: [HOST_ID] }), appointment);
    expect(ownHost.outcomeNotes).toBe('Discussed behaviour');

    const otherHost = await access.redact(reqFor(['appnt.appointments.host'], { hosts: [OTHER_HOST_ID] }), appointment);
    expect(otherHost).toMatchObject({ canSeeNotes: false, canAct: false });

    const principal = await access.redact(reqFor(['appnt.appointments.view', 'appnt.appointments.notes']), appointment);
    expect(principal.outcomeNotes).toBe('Discussed behaviour');
  });
});

describe('APPNT roles and gate', () => {
  const template = (key) => roleTemplates.get(key);
  const keys = (key) => template(key).permissions.map((grant) => grant.key);

  it('does not let every teacher take appointments', () => {
    expect(keys('class_teacher').some((key) => key.startsWith('appnt.'))).toBe(false);
    expect(keys('subject_teacher').some((key) => key.startsWith('appnt.'))).toBe(false);
    expect(keys('appointment_host')).toEqual(expect.arrayContaining(['appnt.appointments.host']));
    expect(keys('appointment_host').filter((key) => key.startsWith('appnt.'))).toEqual(['appnt.appointments.host']);
  });

  it('keeps private notes away from office staff', () => {
    expect(keys('office_staff')).toEqual(expect.arrayContaining(['appnt.appointments.book', 'appnt.appointments.manage']));
    expect(keys('office_staff')).not.toContain('appnt.appointments.notes');
    expect(keys('office_staff')).not.toContain('appnt.appointments.settings');
    expect(keys('principal')).toContain('appnt.appointments.notes');
  });

  it('lets only appointment holders through the gate', () => {
    expect(resolveRouteRequirement('GET', '/appnt/today')).toMatchObject({ anyOfResource: 'appnt.appointments' });
    const gate = (grants) => {
      const next = jest.fn();
      routeAccessGate({
        method: 'GET', path: '/appnt/today', user: { _id: 'u1', kind: 'staff' }, auth: { audience: AUDIENCE.STAFF }, rbac: new PermissionSet(grants)
      }, createRes(), next);
      return next.mock.calls.length === 1;
    };
    expect(gate(template('subject_teacher').permissions)).toBe(false);
    expect(gate(template('appointment_host').permissions)).toBe(true);
  });
});

/* eslint-disable global-require */
describe('APPNT booking', () => {
  const ctrl = require('../../../controllers/appntController');

  const makeReq = ({ grants, body, existing = [], timetable = null }) => {
    const created = [];
    const models = {
      AppointmentHost: {
        findById: jest.fn(() => query({ ...host, teacher: TEACHER_ID })),
        find: jest.fn(() => query([]))
      },
      AppointmentSettings: {
        findOneAndUpdate: jest.fn(() => query({ key: 'default', refSeq: 7, minNoticeHours: 24, maxAdvanceDays: 30, purposes: ['General'] }))
      },
      Appointment: {
        find: jest.fn(() => query(existing)),
        create: jest.fn(async (doc) => { created.push(doc); return { ...doc, _id: 'new1', toObject() { return { ...doc, _id: 'new1' }; } }; })
      },
      ...(timetable || {})
    };
    return {
      req: { body, models, user: { _id: 'u1', name: 'Front desk' }, rbac: new PermissionSet(grants.map((key) => ({ key, scope: 'all' }))), tenant: { dbName: 't', slug: 't', featureToggles: { appnt_desk: true } } },
      created
    };
  };

  const body = {
    hostId: HOST_ID, date: '2099-01-05', startTime: '10:00', visitorType: 'visitor', visitor: { name: 'A Visitor' }, purpose: 'General', mode: 'in_person'
  };
  const mondayHost = { ...host, weeklyAvailability: [{ day: 1, start: '10:00', end: '11:00' }], blockedDates: [] };

  beforeEach(() => {
    host.weeklyAvailability = mondayHost.weeklyAvailability;
  });

  it('books a free slot with a reference number and a slot lock', async () => {
    const { req, created } = makeReq({ grants: ['appnt.appointments.book'], body });
    const res = createRes();
    await ctrl.create(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(201);
    expect(created[0]).toMatchObject({ refNo: 'APT-2099-0007', status: 'confirmed', endTime: '10:15', slotKey: slotKeyFor(HOST_ID, '2099-01-05', '10:00') });
  });

  it('refuses a time that overlaps another appointment', async () => {
    const { req, created } = makeReq({ grants: ['appnt.appointments.book'], body, existing: [{ startTime: '09:55', endTime: '10:10', status: 'confirmed' }] });
    const res = createRes();
    await ctrl.create(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(created).toHaveLength(0);
  });

  it('needs an override to book over a teaching period', async () => {
    const timetable = {
      TimetableState: { findOne: jest.fn(() => query({ teachers: [{ id: TEACHER_ID, name: 'Ms Rao' }], classes: [], bellTimings: { startTime: '10:00', rows: [{ id: 'p1', type: 'period', label: 'Period 1', duration: 40 }] }, timetableGrid: { c1: { Monday: { p1: { subject: 'Maths', teacher: 'Ms Rao' } } } } })) },
      TimetableVersion: { findOne: jest.fn(() => query(null)) }
    };
    const first = makeReq({ grants: ['appnt.appointments.book'], body, timetable });
    const res = createRes();
    await ctrl.create(first.req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].errorCode).toBe('host_teaching');

    // Booking-only staff can't override; the front desk (manage) can.
    const second = makeReq({ grants: ['appnt.appointments.book', 'appnt.appointments.manage'], body: { ...body, overrideTeaching: true }, timetable });
    const res2 = createRes();
    await ctrl.create(second.req, res2, jest.fn());
    expect(res2.status).toHaveBeenCalledWith(201);
  });

  it('stops a host booking on someone else’s calendar', async () => {
    const { req, created } = makeReq({ grants: ['appnt.appointments.host'], body });
    req.models.AppointmentHost.find = jest.fn(() => query([{ _id: OTHER_HOST_ID }]));
    const res = createRes();
    await ctrl.create(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(created).toHaveLength(0);
  });
});

describe('family portal routes', () => {
  it('opens meeting requests and marking notifications read, keeps everything else read-only', () => {
    const router = require('../../../routes/portalRoutes');
    const routes = router.stack.filter((layer) => layer.route).map((layer) => `${Object.keys(layer.route.methods).join(',')} ${layer.route.path}`);
    expect(routes).toEqual(expect.arrayContaining([
      'post /students/:studentId/appointments',
      'post /appointments/:id/cancel'
    ]));
    expect(routes[routes.length - 1]).toBe('_all *');
    expect(routes).toEqual(expect.arrayContaining(['post /notifications/read-all', 'post /notifications/:id/read']));
    expect(routes.filter((route) => /^(post|put|patch|delete)/.test(route))
      .every((route) => /appointments/.test(route) || /^post \/notifications\/(read-all|:id\/read)$/.test(route))).toBe(true);
  });

  it('keeps student logins out of meeting requests', async () => {
    const portal = require('../../../controllers/appntPortalController');
    const res = createRes();
    await portal.listMine({ user: { _id: 's1', kind: 'student' }, tenant: { featureToggles: { appnt_desk: true } }, models: { Appointment: {} } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
