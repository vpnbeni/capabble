process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../../../mail/outbox', () => ({
  enqueue: jest.fn(async (models, rows) => rows.length),
  notifyQueued: jest.fn()
}));

const { enqueue, notifyQueued } = require('../../../mail/outbox');
const { queueEventEmails, icsMethodFor } = require('../mail');

const query = (result) => {
  const q = {};
  ['select', 'lean'].forEach((name) => { q[name] = () => q; });
  q.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return q;
};

const models = {
  SchoolProfile: { findOne: () => query({ schoolName: 'Greenfield School', email: 'office@greenfield.edu.in' }) },
  SchoolMailSettings: { findOne: () => query(null) }
};

const event = {
  _id: 'e1', uid: 'u@t', revision: 2, title: 'Annual Day', startDate: '2026-11-14', endDate: '2026-11-14', allDay: true, venue: 'Hall'
};
const users = [
  { _id: 'p1', kind: 'parent', name: 'Meera Shah', email: 'meera@mail.in' },
  { _id: 'p2', kind: 'parent', name: 'No Email', email: '' },
  { _id: 'p3', kind: 'parent', name: 'Placeholder', email: 'x@capabble.local' },
  { _id: 'p4', kind: 'parent', name: 'Opted Out', email: 'out@mail.in', emailOptOut: ['calendar'] }
];
const data = {
  change: 'published',
  parts: { p1: [{ label: 'Parents of 7 B', instructions: 'White uniform by 8 am.', children: ['Riya Shah'] }] }
};

beforeEach(() => { enqueue.mockClear(); notifyQueued.mockClear(); });

describe('calendar emails', () => {
  it('emails people with a real address who did not turn calendar emails off', async () => {
    const queued = await queueEventEmails({ tenant: { slug: 'greenfield', dbName: 'db' }, models, event, users, data });
    expect(queued).toBe(1);
    const [row] = enqueue.mock.calls[0][1];
    expect(row).toMatchObject({
      to: 'meera@mail.in', dedupeKey: 'calendar:e1:r2:published:p1', icsMethod: 'PUBLISH', category: 'calendar'
    });
    expect(row.text).toContain('For Riya: White uniform by 8 am.');
    expect(row.text).toContain('#/portal/calendar?event=e1&date=2026-11-14');
    expect(row.unsubscribeUrl).toContain('/mail/unsubscribe/');
    expect(row.ics).toContain('UID:u@t');
    expect(notifyQueued).toHaveBeenCalledWith('db');
  });

  it('still emails people who opted out when the event is marked important', async () => {
    await queueEventEmails({ tenant: { slug: 'g', dbName: 'db' }, models, event: { ...event, critical: true }, users, data });
    expect(enqueue.mock.calls[0][1].map((r) => r.to)).toEqual(['meera@mail.in', 'out@mail.in']);
  });

  it('sends a calendar cancellation, and none for one cancelled date or a reminder', () => {
    expect(icsMethodFor('cancelled')).toBe('CANCEL');
    expect(icsMethodFor('cancelled', '2026-11-21')).toBe('');
    expect(icsMethodFor('reminder')).toBe('');
    expect(icsMethodFor('changed')).toBe('PUBLISH');
  });

  it('keys reminders by date and slot so each goes once', async () => {
    await queueEventEmails({
      tenant: { slug: 'g', dbName: 'db' }, models, event, users: [users[0]], data: { ...data, change: 'reminder', occurrence: '2026-11-14', slot: 'morning_07' }
    });
    expect(enqueue.mock.calls[0][1][0].dedupeKey).toBe('calendar:e1:2026-11-14:morning_07:p1');
  });
});
