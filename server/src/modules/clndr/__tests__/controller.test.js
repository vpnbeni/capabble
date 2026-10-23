jest.mock('../../../notifications/send', () => ({ send: jest.fn(async (t, users) => users.length), modelsFor: jest.fn() }));
jest.mock('../delivery', () => {
  const actual = jest.requireActual('../delivery');
  return { ...actual, deliverLater: jest.fn(async () => 'run1') };
});
jest.mock('../../../notifications/recipients', () => ({
  ...jest.requireActual('../../../notifications/recipients'),
  usersWithPermission: jest.fn(async () => [{ _id: 'p1', kind: 'staff', name: 'Principal' }]),
  byIds: jest.fn(async () => [{ _id: 'c1', kind: 'staff', name: 'Teacher' }])
}));

const mongoose = require('mongoose');
const { PermissionSet } = require('../../../rbac/permissions');
const { roleTemplates } = require('../../../rbac/catalog');
const { send } = require('../../../notifications/send');
const { deliverLater } = require('../delivery');
const ctrl = require('../controller');
const schemas = require('../validation');
const CalendarEventProxy = require('../../../models/CalendarEvent');
const SchoolDayRuleProxy = require('../../../models/SchoolDayRule');

// Real schemas (so validation runs) on a connection that never connects; writes are stubbed.
const conn = mongoose.createConnection();
const CalendarEvent = conn.model('CalendarEvent', CalendarEventProxy.schema);
const SchoolDayRule = conn.model('SchoolDayRule', SchoolDayRuleProxy.schema);
const saved = [];
jest.spyOn(CalendarEvent.prototype, 'save').mockImplementation(async function save() { saved.push(this); return this; });
jest.spyOn(SchoolDayRule.prototype, 'save').mockImplementation(async function save() { return this; });

const query = (result) => {
  const q = {};
  ['select', 'sort', 'skip', 'limit', 'lean', 'populate'].forEach((name) => { q[name] = () => q; });
  q.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return q;
};

const asRole = (role) => new PermissionSet(roleTemplates.get(role).permissions);

const createRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const run = async (handler, req, schema) => {
  const res = createRes();
  if (schema) {
    let passed = false;
    ctrl.body(schema)(req, res, () => { passed = true; });
    if (!passed) return res;
  }
  await handler(req, res, (error) => { throw error; });
  return res;
};

const baseReq = (role, body = {}, extra = {}) => ({
  body,
  params: {},
  query: {},
  tenant: { dbName: 'tenant_test', slug: 'test', id: 't1', featureToggles: {} },
  user: {
    _id: new mongoose.Types.ObjectId(), kind: 'staff', name: `A ${role}`, roles: [role], assignedSections: [{ className: '7', section: 'B' }]
  },
  rbac: asRole(role),
  models: {
    CalendarEvent,
    SchoolDayRule,
    TimetableState: { findOne: () => query(null) }
  },
  ...extra
});

const annualDay = {
  title: 'Annual Day',
  startDate: '2026-11-14',
  venue: 'Main hall',
  segments: [
    { label: 'Parents of 7 B', personType: 'parent', scopes: [{ type: 'section', value: '7|B' }], instructions: 'White uniform.' },
    { label: 'Class teacher', personType: 'staff', scopes: [{ type: 'classteacher', value: '7|B' }], role: 'duty' }
  ],
  publish: true
};

beforeEach(() => {
  saved.length = 0;
  send.mockClear();
  deliverLater.mockClear();
});

describe('creating events', () => {
  it('publishes a principal\'s event straight away and announces it', async () => {
    const res = await run(ctrl.createEvent, baseReq('principal', { ...annualDay }), schemas.createEvent);
    expect(res.status).toHaveBeenCalledWith(201);
    const event = saved[saved.length - 1];
    expect(event.status).toBe('published');
    expect(event.targetKeys).toEqual(['parent@section:7|B', 'staff@classteacher:7|B']);
    expect(event.academicSession).toBe('2026-2027');
    expect(deliverLater).toHaveBeenCalledWith(expect.anything(), event, { change: 'published' });
  });

  it('sends a class teacher\'s family event to the principal first', async () => {
    const res = await run(ctrl.createEvent, baseReq('class_teacher', { ...annualDay }), schemas.createEvent);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].data.status).toBe('pending_approval');
    expect(deliverLater).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(expect.anything(), [expect.objectContaining({ _id: 'p1' })], 'calendar.approval_requested', expect.anything());
  });

  it('refuses a class teacher sending to another class', async () => {
    const body = { ...annualDay, segments: [{ personType: 'parent', scopes: [{ type: 'section', value: '9|A' }] }] };
    const res = await run(ctrl.createEvent, baseReq('class_teacher', body), schemas.createEvent);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('refuses a driver', async () => {
    const res = await run(ctrl.createEvent, baseReq('driver', { ...annualDay }), schemas.createEvent);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('schedules an event with a future publish time instead of sending it', async () => {
    const publishAt = new Date(Date.now() + 86400000).toISOString();
    const res = await run(ctrl.createEvent, baseReq('principal', { ...annualDay, publishAt }), schemas.createEvent);
    expect(res.json.mock.calls[0][0].data.status).toBe('scheduled');
    expect(deliverLater).not.toHaveBeenCalled();
  });

  it('rejects an end before the start and a timed event without a time', async () => {
    let res = await run(ctrl.createEvent, baseReq('principal', { ...annualDay, endDate: '2026-11-01' }), schemas.createEvent);
    expect(res.status).toHaveBeenCalledWith(400);
    res = await run(ctrl.createEvent, baseReq('principal', { ...annualDay, allDay: false }), schemas.createEvent);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('stops a repeating event at the end of the session', async () => {
    const body = { ...annualDay, recurrence: { freq: 'weekly', byDay: [6] } };
    await run(ctrl.createEvent, baseReq('principal', body), schemas.createEvent);
    expect(saved[saved.length - 1].recurrence.until).toBe('2027-03-31');
  });
});

describe('changing a published event', () => {
  const published = (createdBy) => {
    const event = new CalendarEvent({
      uid: 'u@test', title: 'Annual Day', startDate: '2026-11-14', endDate: '2026-11-14', status: 'published', createdBy, revision: 1
    });
    event.segments = [
      { key: 'p', personType: 'parent', scopes: [{ type: 'section', value: '7|B' }], instructions: 'White uniform.' },
      { key: 's', personType: 'staff', scopes: [{ type: 'classteacher', value: '7|B' }], instructions: 'Gate duty.' }
    ];
    return event;
  };

  it('tells only the audience whose instructions changed', async () => {
    const req = baseReq('principal');
    const event = published(req.user._id);
    req.params.id = String(event._id);
    req.models.CalendarEvent = Object.assign(Object.create(CalendarEvent), { findById: async () => event });
    req.body = { segments: [event.segments[0].toObject(), { ...event.segments[1].toObject(), instructions: 'Stage duty.' }] };
    const res = await run(ctrl.updateEvent, req, schemas.updateEvent);
    expect(res.json.mock.calls[0][0].data.changed.changedSegments).toEqual(['s']);
    expect(event.revision).toBe(2);
    expect(deliverLater).toHaveBeenCalledWith(expect.anything(), event, { change: 'changed', onlySegments: ['s'], changes: [] });
  });

  it('tells everyone when the date moves', async () => {
    const req = baseReq('principal');
    const event = published(req.user._id);
    req.params.id = String(event._id);
    req.models.CalendarEvent = Object.assign(Object.create(CalendarEvent), { findById: async () => event });
    req.body = { startDate: '2026-11-15', endDate: '2026-11-15' };
    await run(ctrl.updateEvent, req, schemas.updateEvent);
    expect(deliverLater.mock.calls[0][2]).toMatchObject({ change: 'changed', onlySegments: ['p', 's'] });
    expect(deliverLater.mock.calls[0][2].changes).toEqual(expect.arrayContaining(['startDate']));
  });

  it('says nothing when asked to stay quiet', async () => {
    const req = baseReq('principal');
    const event = published(req.user._id);
    req.params.id = String(event._id);
    req.models.CalendarEvent = Object.assign(Object.create(CalendarEvent), { findById: async () => event });
    req.body = { venue: 'Ground', notify: 'none' };
    await run(ctrl.updateEvent, req, schemas.updateEvent);
    expect(deliverLater).not.toHaveBeenCalled();
  });

  it('cancels one date of a repeating event', async () => {
    const req = baseReq('principal');
    const event = published(req.user._id);
    event.recurrence = { freq: 'weekly', byDay: [6], interval: 1 };
    req.params.id = String(event._id);
    req.models.CalendarEvent = Object.assign(Object.create(CalendarEvent), { findById: async () => event });
    req.body = { occurrence: '2026-11-21', reason: 'Diwali break' };
    await run(ctrl.cancelEvent, req, schemas.cancelEvent);
    expect(event.status).toBe('published');
    expect(event.recurrence.exDates).toEqual(['2026-11-21']);
    expect(deliverLater.mock.calls[0][2]).toMatchObject({ change: 'cancelled', occurrence: '2026-11-21' });
  });

  it('won\'t let another teacher change it', async () => {
    const req = baseReq('class_teacher');
    const event = published(new mongoose.Types.ObjectId());
    req.params.id = String(event._id);
    req.models.CalendarEvent = Object.assign(Object.create(CalendarEvent), { findById: async () => event });
    req.body = { venue: 'Elsewhere' };
    const res = await run(ctrl.updateEvent, req, schemas.updateEvent);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('school days', () => {
  it('saves a class-only closure with normalised classes', async () => {
    const created = [];
    const Rule = function Rule(doc) {
      const rule = new SchoolDayRule(doc);
      created.push(rule);
      return rule;
    };
    const req = baseReq('principal', {
      kind: 'closure', title: 'GRAP III', startDate: '2026-11-12', endDate: '2026-11-14', mode: 'online',
      appliesTo: { scope: 'classes', classes: ['Class 5th', 'IV'] }, authority: 'DoE', orderNo: 'F.1/2026'
    });
    req.models.SchoolDayRule = Rule;
    const res = await run(ctrl.createRule, req, schemas.createRule);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(created[0].appliesTo.toObject()).toMatchObject({ scope: 'classes', classes: ['5', '4'] });
    expect(created[0].academicSession).toBe('2026-2027');
  });

  it('keeps a weekly off open-ended', async () => {
    const created = [];
    const Rule = function Rule(doc) {
      const rule = new SchoolDayRule(doc);
      created.push(rule);
      return rule;
    };
    const req = baseReq('office_staff', { kind: 'weekly_off', title: '2nd and 4th Saturday', startDate: '2026-04-01', weekly: { weekday: 6, weeksOfMonth: [2, 4] } });
    req.models.SchoolDayRule = Rule;
    await run(ctrl.createRule, req, schemas.createRule);
    expect(created[0].endDate).toBe('9999-12-31');
  });
});

describe('review fixes', () => {
  const pending = (createdBy) => new CalendarEvent({
    uid: 'p@test', title: 'Trip', startDate: '2026-11-20', endDate: '2026-11-20', status: 'pending_approval', createdBy, revision: 1,
    segments: [{ key: 'p', personType: 'parent', scopes: [{ type: 'section', value: '7|B' }] }]
  });

  it('lets only approvers approve or send back someone else\'s event', async () => {
    const req = baseReq('class_teacher');
    const event = pending(new mongoose.Types.ObjectId());
    req.params.id = String(event._id);
    req.models.CalendarEvent = Object.assign(Object.create(CalendarEvent), { findById: async () => event });
    let res = await run(ctrl.approveEvent, req);
    expect(res.status).toHaveBeenCalledWith(403);
    res = await run(ctrl.rejectEvent, { ...req, body: { note: 'x' } }, schemas.rejectEvent);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(event.status).toBe('pending_approval');
  });

  it('sends an approved, scheduled event back for approval when its teacher changes it', async () => {
    const req = baseReq('class_teacher');
    const event = pending(req.user._id);
    event.status = 'scheduled';
    event.publishAt = new Date(Date.now() + 86400000);
    req.params.id = String(event._id);
    req.models.CalendarEvent = Object.assign(Object.create(CalendarEvent), { findById: async () => event });
    req.body = { description: 'Now with a different plan' };
    const res = await run(ctrl.updateEvent, req, schemas.updateEvent);
    expect(res.json.mock.calls[0][0].data.status).toBe('pending_approval');
  });

  it('refuses mail servers on internal addresses', () => {
    const { isPublicMailHost } = require('../../../mail/settingsController'); // eslint-disable-line global-require
    expect(isPublicMailHost('smtp.gmail.com')).toBe(true);
    ['169.254.169.254', '10.0.0.5', 'localhost', 'mongo', 'db.internal', '::1'].forEach((host) => expect(isPublicMailHost(host)).toBe(false));
  });
});
