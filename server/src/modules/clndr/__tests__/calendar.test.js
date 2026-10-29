jest.mock('../../../notifications/send', () => ({
  send: jest.fn(async (tenant, users) => users.length),
  modelsFor: jest.fn()
}));

const { PermissionSet } = require('../../../rbac/permissions');
const { roleTemplates, resolveRouteRequirement, catalog } = require('../../../rbac/catalog');
const {
  scopeKey, eventTargetKeys, matchEvent, viewerContext, resolveRecipients
} = require('../audience');
const {
  occurrences, prepareSegments, diffEvents, assertCanTarget, needsApproval, viewForViewer, eventItems, visibleEventsFilter, viewerParts
} = require('../events');
const templates = require('../../../notifications/templates');
const { send } = require('../../../notifications/send');
const { deliver } = require('../delivery');
const { openSlots } = require('../jobs');

// Minimal stand-in for a Mongoose query: chainable and awaitable.
const query = (result) => {
  const q = {};
  ['select', 'sort', 'skip', 'limit', 'lean', 'populate'].forEach((name) => { q[name] = () => q; });
  q.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return q;
};

const ID = (n) => String(n).padStart(24, 'a');
const grants = (keys, scope = 'all') => new PermissionSet(keys.map((key) => (typeof key === 'string' ? { key, scope } : key)));

const parentViewer = {
  kind: 'parent',
  userId: ID(1),
  keys: new Set([`user:${ID(1)}`, 'parent@all']),
  children: [
    {
      studentId: ID(11),
      name: 'Aarav Mehta',
      className: '5',
      section: 'A',
      keys: new Set(['parent@class:5', 'parent@section:5|A', 'parent@student:ADM1'])
    },
    {
      studentId: ID(12),
      name: 'Riya Mehta',
      className: '7',
      section: 'B',
      keys: new Set(['parent@class:7', 'parent@section:7|B', 'parent@student:ADM2', `parent@route:${ID(90)}`])
    }
  ]
};

const teacherViewer = {
  kind: 'staff',
  userId: ID(2),
  keys: new Set([`user:${ID(2)}`, 'staff@all', 'staff@role:class_teacher', 'staff@section:7|B', 'staff@class:7',
    'staff@classteacher:7|B', 'staff@classteacher:7']),
  children: []
};

const annualDay = {
  _id: ID(500),
  title: 'Annual Day',
  startDate: '2026-11-14',
  endDate: '2026-11-14',
  allDay: true,
  status: 'published',
  visibility: 'segments',
  segments: prepareSegments([
    {
      key: 'p7b',
      label: 'Parents of 7 B',
      personType: 'parent',
      scopes: [{ type: 'section', value: 'VII|b' }],
      instructions: 'Send your child in white by 8 am.'
    },
    {
      key: 'p5',
      label: 'Parents of class 5',
      personType: 'parent',
      scopes: [{ type: 'class', value: 'Class 5th' }],
      instructions: 'Pick up at 12:30.',
      reminders: ['day_before_18']
    },
    {
      key: 'ct',
      label: 'Class teachers',
      personType: 'staff',
      scopes: [{ type: 'classteacher', value: '7|B' }],
      role: 'duty',
      instructions: 'Gate duty at 7:45.'
    },
    {
      key: 'all-staff', label: 'All staff', personType: 'staff', scopes: [{ type: 'all' }], role: 'fyi', notify: 'silent'
    }
  ])
};

describe('audience keys', () => {
  it('normalises classes and sections the way the rest of the school does', () => {
    expect(scopeKey('parent', { type: 'section', value: 'VII|b' })).toBe('parent@section:7|B');
    expect(scopeKey('student', { type: 'class', value: 'Class 10th' })).toBe('student@class:10');
    expect(scopeKey('staff', { type: 'classteacher', value: 'x' })).toBe('staff@classteacher:10');
    expect(scopeKey('parent', { type: 'role', value: 'accountant' })).toBe('');
    expect(scopeKey('staff', { type: 'user', value: 'not-an-id' })).toBe('');
    expect(eventTargetKeys(annualDay.segments)).toEqual(
      ['parent@section:7|B', 'parent@class:5', 'staff@classteacher:7|B', 'staff@all']
    );
  });

  it('shows a parent only their own parts, labelled per child', () => {
    const { visible, segments } = matchEvent(annualDay, parentViewer);
    expect(visible).toBe(true);
    expect(segments.map((s) => [s.segment.key, s.child.name])).toEqual([['p7b', 'Riya Mehta'], ['p5', 'Aarav Mehta']]);
  });

  it('never shows staff instructions to families', () => {
    const view = viewForViewer(annualDay, parentViewer);
    expect(view.parts.map((p) => p.instructions)).not.toContain('Gate duty at 7:45.');
    expect(view.parts).toHaveLength(2);
  });

  it('gives the class teacher their duty and the all-staff note', () => {
    const view = viewForViewer(annualDay, teacherViewer);
    expect(view.parts.map((p) => p.segmentKey)).toEqual(['ct', 'all-staff']);
  });

  it('honours exclusions', () => {
    const event = {
      ...annualDay,
      segments: prepareSegments([{
        key: 'bus', personType: 'parent', scopes: [{ type: 'class', value: '7' }], exclude: [{ type: 'route', value: ID(90) }]
      }])
    };
    expect(matchEvent(event, parentViewer).segments).toHaveLength(0);
  });

  it('lets all-staff events through to staff only', () => {
    const event = { ...annualDay, visibility: 'all_staff', segments: [] };
    expect(matchEvent(event, teacherViewer).visible).toBe(true);
    expect(matchEvent(event, parentViewer).visible).toBe(false);
  });
});

describe('viewer context', () => {
  it('builds a teacher\'s keys from roles, sections, class-teacher sections and bus routes', async () => {
    const req = {
      user: {
        _id: ID(2),
        kind: 'staff',
        roles: ['class_teacher'],
        teacher: ID(30),
        assignedSections: [{ className: '7', section: 'B' }]
      },
      models: {
        TimetableState: { findOne: () => query({ classes: [{ className: '8', section: 'A', incharge: 'Ms Rao' }], teachers: [{ id: ID(30), name: 'Ms Rao' }], teacherSubjectAllocations: [] }) },
        TransportVehicle: { find: () => query([{ _id: ID(70) }]) },
        TransportRoute: { find: () => query([{ _id: ID(90) }]) }
      }
    };
    const viewer = await viewerContext(req);
    expect([...viewer.keys]).toEqual(expect.arrayContaining([
      'staff@role:class_teacher', 'staff@section:7|B', 'staff@classteacher:7|B', 'staff@classteacher:8|A', `staff@route:${ID(90)}`
    ]));
  });

  it('builds per-child keys for a parent', async () => {
    const req = {
      user: { _id: ID(1), kind: 'parent', linkedStudents: [{ rollNumber: 'adm2' }] },
      models: {
        Student: { find: () => query([{ _id: ID(12), name: 'Riya', rollNumber: 'ADM2', class: '7th', section: 'b', houseId: ID(40) }]) },
        TransportAssignment: { find: () => query([{ studentId: ID(12), routeId: ID(90) }]) }
      }
    };
    const viewer = await viewerContext(req);
    expect([...viewer.children[0].keys]).toEqual(expect.arrayContaining([
      'parent@class:7', 'parent@section:7|B', 'parent@student:ADM2', `parent@house:${ID(40)}`, `parent@route:${ID(90)}`
    ]));
  });
});

describe('recurrence', () => {
  const weekly = {
    startDate: '2026-10-05', endDate: '2026-10-05', recurrence: { freq: 'weekly', byDay: [1, 3], interval: 1, exDates: ['2026-10-14'], skipNonWorking: true }
  };

  it('expands weekly days, skipping excluded dates and holidays', () => {
    const holiday = (key) => key !== '2026-10-21';
    const starts = occurrences(weekly, '2026-10-12', '2026-10-25', { isWorking: holiday }).map((o) => o.startDate);
    expect(starts).toEqual(['2026-10-12', '2026-10-19']);
  });

  it('stops at until', () => {
    const event = { ...weekly, recurrence: { ...weekly.recurrence, until: '2026-10-07', exDates: [] } };
    expect(occurrences(event, '2026-10-01', '2026-12-31').map((o) => o.startDate)).toEqual(['2026-10-05', '2026-10-07']);
  });

  it('skips months without the day, like other calendars', () => {
    const event = { startDate: '2027-01-31', endDate: '2027-01-31', recurrence: { freq: 'monthly', interval: 1 } };
    expect(occurrences(event, '2027-01-01', '2027-05-31').map((o) => o.startDate))
      .toEqual(['2027-01-31', '2027-03-31', '2027-05-31']);
  });

  it('keeps multi-day spans and finds them from inside the span', () => {
    const trip = { startDate: '2026-12-20', endDate: '2026-12-23' };
    expect(occurrences(trip, '2026-12-22', '2026-12-31')).toEqual([{ startDate: '2026-12-20', endDate: '2026-12-23' }]);
    const daily = { startDate: '2026-01-01', endDate: '2026-01-01', recurrence: { freq: 'daily', interval: 2 } };
    expect(occurrences(daily, '2026-12-30', '2026-12-31').map((o) => o.startDate)).toEqual(['2026-12-31']);
  });
});

describe('edits', () => {
  it('spots what changed and which audiences it touched', () => {
    const after = {
      ...annualDay,
      venue: 'Main ground',
      segments: [
        { ...annualDay.segments[0], instructions: 'Send your child in white by 7:45 am.' },
        annualDay.segments[1],
        { key: 'new', personType: 'student', scopes: [{ type: 'all', value: '' }] }
      ]
    };
    const diff = diffEvents(annualDay, after);
    expect(diff).toMatchObject({
      material: true, fields: ['venue'], changedSegments: ['p7b'], addedSegments: ['new'], removedSegments: ['ct', 'all-staff']
    });
    expect(diffEvents(annualDay, { ...annualDay }).material).toBe(false);
  });
});

describe('who may target whom', () => {
  const teacher = (scope = 'assigned') => ({
    rbac: grants([{ key: 'clndr.events.create', scope }]),
    assignedSections: async () => [{ className: '7', section: 'B', key: '7|B' }]
  });

  it('lets a teacher reach their own section, and only that', async () => {
    await expect(assertCanTarget(teacher(), prepareSegments([{ personType: 'parent', scopes: [{ type: 'section', value: '7|B' }] }])))
      .resolves.toBeUndefined();
    await expect(assertCanTarget(teacher(), prepareSegments([{ personType: 'parent', scopes: [{ type: 'section', value: '8|A' }] }])))
      .rejects.toMatchObject({ status: 403 });
    await expect(assertCanTarget(teacher(), prepareSegments([{ personType: 'parent', scopes: [{ type: 'all' }] }])))
      .rejects.toMatchObject({ status: 403 });
  });

  it('keeps whole-school, role and route audiences for the principal and office', async () => {
    const wide = prepareSegments([{ personType: 'staff', scopes: [{ type: 'role', value: 'driver' }] }]);
    await expect(assertCanTarget(teacher('all'), wide)).rejects.toMatchObject({ status: 403 });
    await expect(assertCanTarget({ rbac: grants(['clndr.events.publish_wide']) }, wide)).resolves.toBeUndefined();
    await expect(assertCanTarget(teacher('all'), [], 'whole_school')).rejects.toMatchObject({ status: 403 });
  });

  it('sends teacher events to families for approval', () => {
    const family = [{ personType: 'parent' }];
    expect(needsApproval(grants(['clndr.events.create']), family)).toBe(true);
    expect(needsApproval(grants(['clndr.events.create']), [{ personType: 'staff' }])).toBe(false);
    expect(needsApproval(grants(['clndr.events.publish_wide']), family)).toBe(false);
  });
});

describe('recipients', () => {
  it('reaches parents of the section once each, naming their children, and counts families without a login', async () => {
    const event = { segments: prepareSegments([{ key: 'p', personType: 'parent', scopes: [{ type: 'section', value: '7|B' }] }]) };
    const models = {
      Student: { find: jest.fn(() => query([{ _id: ID(12), name: 'Riya', rollNumber: 'ADM2' }, { _id: ID(13), name: 'Kabir', rollNumber: 'ADM3' }])) },
      User: { find: jest.fn(() => query([{ _id: ID(1), kind: 'parent', email: 'p@x.in', linkedStudents: [{ rollNumber: 'ADM2' }] }])) }
    };
    const { recipients, stats } = await resolveRecipients(models, event);
    expect([...recipients.keys()]).toEqual([ID(1)]);
    expect(recipients.get(ID(1)).segments).toEqual([{ key: 'p', children: ['Riya'], childIds: [ID(12)] }]);
    expect(stats[0]).toMatchObject({ people: 1, students: 2, noLogin: 1, noEmail: 0 });
  });

  it('adds everyone else a whole-school event is shown to, under its own key', async () => {
    const event = {
      visibility: 'whole_school',
      segments: prepareSegments([{ key: 'p', personType: 'parent', scopes: [{ type: 'section', value: '7|B' }] }])
    };
    const everyone = [
      { _id: ID(1), kind: 'parent', linkedStudents: [{ rollNumber: 'ADM2' }] },
      { _id: ID(2), kind: 'staff', email: 't@x.in' },
      { _id: ID(3), kind: 'student' }
    ];
    const models = {
      Student: { find: () => query([{ _id: ID(12), name: 'Riya', rollNumber: 'ADM2' }]) },
      User: { find: jest.fn((filter) => query(filter.kind?.$in ? everyone : [everyone[0]])) }
    };
    const { recipients, stats } = await resolveRecipients(models, event, { wide: true });
    expect(recipients.get(ID(1)).segments.map((s) => s.key)).toEqual(['p']);
    expect(recipients.get(ID(2)).segments.map((s) => s.key)).toEqual(['*']);
    expect(recipients.get(ID(3)).segments.map((s) => s.key)).toEqual(['*']);
    expect(stats[1]).toMatchObject({ key: '*', people: 2, noEmail: 1 });
    const kinds = ['staff', 'parent', 'student'];
    expect(models.User.find).toHaveBeenCalledWith(expect.objectContaining({ kind: { $in: kinds } }));
  });

  it('adds no one else for audience-only events, unasked, or in a run limited to other audiences', async () => {
    const models = { User: { find: jest.fn(() => query([{ _id: ID(2), kind: 'staff' }])) } };
    const audienceOnly = { visibility: 'segments', segments: [] };
    const allStaff = { visibility: 'all_staff', segments: [] };
    expect((await resolveRecipients(models, audienceOnly, { wide: true })).recipients.size).toBe(0);
    expect((await resolveRecipients(models, allStaff)).recipients.size).toBe(0);
    const limited = await resolveRecipients(models, allStaff, { wide: true, onlySegments: ['x'] });
    expect(limited.recipients.size).toBe(0);
    expect(models.User.find).not.toHaveBeenCalled();
    const { recipients } = await resolveRecipients(models, allStaff, { wide: true, onlySegments: ['*'] });
    expect([...recipients.keys()]).toEqual([ID(2)]);
    expect(models.User.find).toHaveBeenCalledWith(expect.objectContaining({ kind: { $in: ['staff'] } }));
  });
});

describe('delivery', () => {
  beforeEach(() => send.mockClear());

  it('pings only loud segments and builds each person\'s own text', async () => {
    const models = {
      TimetableState: { findOne: () => query(null) },
      User: {
        find: jest.fn((filter) => {
          if (filter.kind === 'parent') return query([{ _id: ID(1), kind: 'parent', linkedStudents: [{ rollNumber: 'ADM2' }] }]);
          return query([{ _id: ID(2), kind: 'staff', roles: ['principal'] }]);
        })
      },
      Student: { find: () => query([{ _id: ID(12), name: 'Riya Mehta', rollNumber: 'ADM2', class: '7', section: 'B' }]) }
    };
    const event = { ...annualDay, revision: 1, segments: [annualDay.segments[0], annualDay.segments[3]] };
    const result = await deliver({ tenant: { dbName: 't' }, models, event, change: 'published' });
    expect(result.recipients).toBe(1); // the silent all-staff segment pings nobody
    const [, users, kind, data] = send.mock.calls[0];
    expect(kind).toBe('calendar.event');
    expect(users.map((u) => String(u._id))).toEqual([ID(1)]);
    const text = templates['calendar.event'].build(data, users[0]);
    expect(text.title).toBe('New: Annual Day');
    expect(text.body).toContain('For Riya: Send your child in white by 8 am.');
    expect(text.portalLink).toBe(`/portal/calendar?event=${ID(500)}&date=2026-11-14`);
  });

  it('only reminds the audiences that asked for that reminder', async () => {
    const models = {
      User: { find: () => query([{ _id: ID(1), kind: 'parent', linkedStudents: [{ rollNumber: 'ADM1' }, { rollNumber: 'ADM2' }] }]) },
      Student: {
        find: jest.fn((filter) => query(JSON.stringify(filter).includes('5')
          ? [{ _id: ID(11), name: 'Aarav', rollNumber: 'ADM1' }]
          : [{ _id: ID(12), name: 'Riya', rollNumber: 'ADM2' }]))
      }
    };
    const event = { ...annualDay, revision: 1, segments: annualDay.segments.slice(0, 2) };
    await deliver({ tenant: { dbName: 't' }, models, event, change: 'reminder', occurrence: '2026-11-14', slot: 'day_before_18' });
    const [, users, , data] = send.mock.calls[0];
    expect(data.parts[ID(1)].map((p) => p.key)).toEqual(['p5']);
    expect(templates['calendar.event'].build(data, users[0]).title).toBe('Tomorrow: Annual Day');
    expect(templates['calendar.event'].dedupeKey(data)).toBe(`${ID(500)}:2026-11-14:day_before_18`);
  });

  it('tells everyone about a whole-school event with no audiences, in-app only, without reminders', async () => {
    const everyone = [{ _id: ID(2), kind: 'staff', email: 't@x.in' }, { _id: ID(1), kind: 'parent' }];
    const models = { User: { find: jest.fn(() => query(everyone)) } };
    const event = { ...annualDay, revision: 1, visibility: 'whole_school', segments: [] };
    const result = await deliver({ tenant: { dbName: 't' }, models, event, change: 'published' });
    expect(result).toMatchObject({ recipients: 2, emailsQueued: 0 });
    const [, users, , data] = send.mock.calls[0];
    expect(templates['calendar.event'].build(data, users[0]).title).toBe('New: Annual Day');
    send.mockClear();
    const reminder = { change: 'reminder', occurrence: '2026-11-14', slot: 'day_before_18' };
    await deliver({ tenant: { dbName: 't' }, models, event, ...reminder });
    expect(send).not.toHaveBeenCalled();
  });

  it('includes the revision in change keys so a second change still arrives', () => {
    const data = { event: { id: 'e', revision: 3 }, change: 'changed' };
    expect(templates['calendar.event'].dedupeKey(data)).toBe('e:r3:changed');
  });
});

describe('calendar items', () => {
  it('turns each occurrence into an item with the viewer\'s parts', () => {
    const items = eventItems([annualDay], parentViewer, '2026-11-01', '2026-11-30');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: `event:${ID(500)}:2026-11-14`, layer: 'events', readOnly: true });
    expect(items[0].parts).toHaveLength(2);
  });

  it('shows a family one part per audience for both children, but consent per child', () => {
    const segment = (key, response) => ({ key, label: key, response, attachments: [] });
    const kids = [{ studentId: 'a', name: 'Aarav Beniwal' }, { studentId: 'd', name: 'Diya Beniwal' }];
    const parts = viewerParts([
      { segment: segment('party', 'rsvp'), child: kids[0] },
      { segment: segment('party', 'rsvp'), child: kids[1] },
      { segment: segment('trip', 'consent'), child: kids[0] },
      { segment: segment('trip', 'consent'), child: kids[1] }
    ]);
    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatchObject({ segmentKey: 'party', child: null, children: kids });
    expect(parts.slice(1).map((p) => p.child.studentId)).toEqual(['a', 'd']);
  });

  it('finds a staff member\'s own events even when they are only for families', () => {
    const staff = visibleEventsFilter(['staff:all'], { kind: 'staff', userId: ID(7) }, '2026-11-01', '2026-11-30');
    expect(staff.$and[1].$or).toContainEqual({ createdBy: ID(7) });
    const parent = visibleEventsFilter(['parent:all'], { kind: 'parent', userId: ID(8) }, '2026-11-01', '2026-11-30');
    expect(parent.$and[1].$or).not.toContainEqual({ createdBy: ID(8) });
  });
});

describe('access rules', () => {
  it('opens my calendar to every staff login and keeps events behind their permission', () => {
    expect(resolveRouteRequirement('GET', '/calendar/me')).toMatchObject({ staff: true });
    expect(resolveRouteRequirement('GET', '/calendar/view/abc')).toMatchObject({ staff: true });
    expect(resolveRouteRequirement('POST', '/calendar/events')).toMatchObject({ anyOfResource: 'clndr.events' });
    expect(resolveRouteRequirement('GET', '/school-days')).toMatchObject({ staff: true });
    expect(resolveRouteRequirement('POST', '/school-days/rules')).toMatchObject({ anyOf: ['core.schooldays.write'] });
  });

  it('gives creators the right grants', () => {
    const scopeOf = (role, key) => roleTemplates.get(role).permissions.find((p) => p.key === key)?.scope;
    expect(scopeOf('class_teacher', 'clndr.events.create')).toBe('assigned');
    expect(scopeOf('principal', 'clndr.events.approve')).toBe('all');
    expect(scopeOf('office_staff', 'clndr.events.publish_wide')).toBe('all');
    expect(scopeOf('driver', 'clndr.events.create')).toBeUndefined();
    expect(catalog.portal.parent).toContain('calendar');
    expect(catalog.portal.student).toContain('calendar');
  });
});

describe('reminder windows', () => {
  it('opens the evening slot for tomorrow and the morning slot for today', () => {
    expect(openSlots('2026-11-13', 19)).toEqual([{ slot: 'day_before_18', occurrence: '2026-11-14' }]);
    expect(openSlots('2026-11-14', 7)).toEqual([{ slot: 'morning_07', occurrence: '2026-11-14' }]);
    expect(openSlots('2026-11-14', 13)).toEqual([]);
  });
});
