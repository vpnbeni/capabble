const { respond, tracker, pendingRecipients, attachResponses } = require('../responses');
const { prepareSegments } = require('../events');

const query = (result) => {
  const q = {};
  ['select', 'sort', 'lean'].forEach((name) => { q[name] = () => q; });
  q.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return q;
};
const ID = (n) => String(n).padStart(24, 'a');

const trip = {
  _id: ID(900),
  title: 'Science museum trip',
  status: 'published',
  startDate: '2026-11-20',
  endDate: '2026-11-20',
  visibility: 'segments',
  segments: prepareSegments([
    { key: 'consent', label: 'Parents of 7 B', personType: 'parent', scopes: [{ type: 'section', value: '7|B' }], response: 'consent', responseDeadline: '2026-11-15' },
    { key: 'escort', label: 'Escorts', personType: 'staff', scopes: [{ type: 'user', value: ID(2) }], response: 'acknowledge' }
  ])
};

const parent = { _id: ID(1), kind: 'parent', name: 'Meera Shah', linkedStudents: [{ rollNumber: 'ADM2' }, { rollNumber: 'ADM3' }] };
const students = [
  { _id: ID(12), name: 'Riya Shah', rollNumber: 'ADM2', class: '7', section: 'B' },
  { _id: ID(13), name: 'Kabir Shah', rollNumber: 'ADM3', class: '7', section: 'B' }
];

const store = [];
const models = () => ({
  CalendarEvent: { findById: () => query(trip) },
  Student: { find: () => query(students) },
  User: { find: jest.fn((filter) => query(filter.kind === 'parent' ? [parent] : [{ _id: ID(2), kind: 'staff', name: 'Mr Sen' }])) },
  TimetableState: { findOne: () => query(null) },
  CalendarResponse: {
    find: () => query(store),
    findOneAndUpdate: (filter, update) => {
      let row = store.find((r) => r.segmentKey === filter.segmentKey && String(r.userId) === String(filter.userId) && r.studentId === filter.studentId);
      if (!row) { row = { ...filter }; store.push(row); }
      Object.assign(row, update.$set);
      return query(row);
    }
  }
});

const parentReq = () => ({ user: parent, models: models() });

beforeEach(() => { store.length = 0; });

describe('replies', () => {
  it('records consent per child for the parent', async () => {
    const result = await respond(parentReq(), trip._id, { segmentKey: 'consent', studentId: ID(12), value: 'given' }, { timeZone: 'UTC' });
    expect(result).toMatchObject({ segmentKey: 'consent', studentId: ID(12), value: 'given' });
    expect(store[0]).toMatchObject({ studentName: 'Riya Shah', type: 'consent' });
  });

  it('refuses answers the audience did not offer, and people it does not reach', async () => {
    await expect(respond(parentReq(), trip._id, { segmentKey: 'consent', studentId: ID(12), value: 'yes' }))
      .rejects.toMatchObject({ status: 400 });
    await expect(respond(parentReq(), trip._id, { segmentKey: 'escort', value: 'acknowledged' }))
      .rejects.toMatchObject({ status: 403 });
    await expect(respond(parentReq(), trip._id, { segmentKey: 'consent', studentId: ID(99), value: 'given' }))
      .rejects.toMatchObject({ status: 403 });
  });

  it('closes replies after the deadline', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-16T06:00:00Z'));
    await expect(respond(parentReq(), trip._id, { segmentKey: 'consent', studentId: ID(12), value: 'given' }))
      .rejects.toMatchObject({ status: 400 });
    jest.useRealTimers();
  });

  it('tracks who replied and who has not, per child', async () => {
    store.push({ segmentKey: 'consent', userId: ID(1), studentId: ID(12), value: 'given', userName: 'Meera Shah' });
    const [consent, escort] = await tracker(models(), trip);
    expect(consent).toMatchObject({ expected: 2, counts: { given: 1 } });
    expect(consent.pending).toEqual([expect.objectContaining({ child: 'Kabir Shah', studentId: ID(13) })]);
    expect(escort).toMatchObject({ expected: 1, counts: {} });
    const pending = await pendingRecipients(models(), trip, 'consent');
    expect(pending).toEqual([expect.objectContaining({ segments: [{ key: 'consent', children: ['Kabir Shah'], childIds: [ID(13)] }] })]);
  });

  it('shows each viewer their own reply on the calendar', async () => {
    store.push({ eventId: trip._id, segmentKey: 'consent', userId: ID(1), studentId: ID(12), value: 'given' });
    const items = [{ eventId: trip._id, parts: [{ segmentKey: 'consent', response: 'consent', child: { studentId: ID(12) } }, { segmentKey: 'consent', response: 'consent', child: { studentId: ID(13) } }] }];
    await attachResponses(models(), ID(1), items);
    expect(items[0].parts.map((p) => p.myResponse?.value || null)).toEqual(['given', null]);
  });
});
