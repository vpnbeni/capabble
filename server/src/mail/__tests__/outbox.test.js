process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const store = { outbox: [], suppressions: [], settings: null, profile: { schoolName: 'Greenfield School', email: 'office@greenfield.edu.in' } };

// In-memory stand-ins for the school's mail collections.
const matches = (row, filter) => Object.entries(filter).every(([key, cond]) => {
  const value = key.split('.').reduce((obj, part) => obj?.[part], row);
  if (cond && typeof cond === 'object' && !(cond instanceof Date) && !Array.isArray(cond)) {
    if ('$lte' in cond) return value <= cond.$lte;
    if ('$gte' in cond) return value >= cond.$gte;
    if ('$in' in cond) return cond.$in.map(String).includes(String(value));
  }
  return String(value) === String(cond);
});
const query = (result) => {
  const q = {};
  ['select', 'sort', 'lean'].forEach((name) => { q[name] = () => q; });
  q.limit = (n) => query(result.slice(0, n));
  q.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return q;
};
const apply = (row, update) => {
  Object.assign(row, update.$set || {});
  if (update.$inc) Object.entries(update.$inc).forEach(([k, v]) => { row[k] = (row[k] || 0) + v; });
};
const models = {
  MailOutbox: {
    find: (filter) => query(store.outbox.filter((row) => matches(row, filter))),
    countDocuments: async (filter) => store.outbox.filter((row) => matches(row, filter)).length,
    updateOne: async (filter, update) => { const row = store.outbox.find((r) => matches(r, filter)); if (row) apply(row, update); },
    updateMany: async (filter, update) => { store.outbox.filter((r) => matches(r, filter)).forEach((r) => apply(r, update)); },
    findOneAndUpdate: async (filter, update) => {
      const row = store.outbox.find((r) => matches(r, filter));
      if (row) apply(row, update);
      return row || null;
    },
    insertMany: async (rows) => {
      const dupes = rows.filter((row) => store.outbox.some((r) => r.dedupeKey === row.dedupeKey));
      const fresh = rows.filter((row) => !dupes.includes(row));
      store.outbox.push(...fresh.map((row, i) => ({ _id: `m${store.outbox.length + i}`, attempts: 0, createdAt: new Date(), ...row })));
      if (dupes.length) throw Object.assign(new Error('dup'), { code: 11000, insertedDocs: fresh, writeErrors: dupes.map(() => ({ code: 11000 })) });
      return fresh;
    }
  },
  MailSuppression: {
    find: (filter) => query(store.suppressions.filter((row) => matches(row, filter))),
    updateOne: async (filter, update) => { if (!store.suppressions.some((r) => r.email === filter.email)) store.suppressions.push(update.$setOnInsert); }
  },
  SchoolMailSettings: {
    findOne: () => query(store.settings),
    updateOne: async (filter, update) => { store.settings = { ...store.settings, ...update.$set }; }
  },
  SchoolProfile: { findOne: () => query(store.profile) }
};

jest.mock('../../tenancy/tenantConnectionManager', () => ({ getTenantConnectionAndModels: () => ({ models }) }));

const { enqueue, drainTenant, isPermanent } = require('../outbox');
const { tokenFor, readToken } = require('../unsubscribe');
const { seal, open } = require('../../utils/secretBox');
const { buildIcs } = require('../../utils/ics');

const fakeTransport = (behaviour = () => ({ messageId: '<x@y>' })) => {
  const sent = [];
  return {
    sent,
    sendMail: jest.fn(async (message) => {
      const outcome = behaviour(message);
      if (outcome instanceof Error) throw outcome;
      sent.push(message);
      return outcome;
    })
  };
};

const row = (n, extra = {}) => ({
  dedupeKey: `k${n}`, to: `parent${n}@mail.in`, toName: `Parent ${n}`, subject: 'Annual Day', html: '<p>Hi</p>', text: 'Hi', ...extra
});

beforeEach(() => {
  store.outbox = [];
  store.suppressions = [];
  store.settings = null;
  process.env.MAIL_EVENTS_USER = 'events@capabble.cloud';
  process.env.MAIL_EVENTS_PASS = 'secret';
  process.env.MAIL_EVENTS_HOST = 'smtp.hostinger.com';
  process.env.MAIL_EVENTS_DAILY_CAP_PER_TENANT = '2';
});

describe('outbox', () => {
  it('queues each email once, however often a delivery is re-run', async () => {
    expect(await enqueue(models, [row(1), row(2)])).toBe(2);
    expect(await enqueue(models, [row(1), row(3)])).toBe(1);
    expect(store.outbox.map((m) => m.dedupeKey)).toEqual(['k1', 'k2', 'k3']);
  });

  it('sends from events@ as "<school> via Capabble" with replies to the school, within the daily share', async () => {
    await enqueue(models, [row(1, { unsubscribeUrl: 'https://api/x', ics: 'BEGIN:VCALENDAR', icsMethod: 'PUBLISH' }), row(2), row(3)]);
    const transport = fakeTransport();
    const result = await drainTenant({ dbName: 't', slug: 't' }, { transportOverride: transport, now: new Date(Date.now() + 1000) });
    expect(result).toMatchObject({ sent: 2, capped: 1 });
    const first = transport.sent[0];
    expect(first.from).toEqual({ name: 'Greenfield School via Capabble', address: 'events@capabble.cloud' });
    expect(first.replyTo).toBe('office@greenfield.edu.in');
    expect(first.headers['List-Unsubscribe']).toBe('<https://api/x>');
    expect(first.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(first.icalEvent).toMatchObject({ method: 'PUBLISH' });
    const capped = store.outbox.find((m) => m.dedupeKey === 'k3');
    expect(capped.status).toBe('queued');
    expect(capped.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('uses the school\'s own account when it is set up', async () => {
    store.settings = {
      enabled: true, host: 'smtp.gmail.com', port: 465, secure: true, user: 'office@greenfield.edu.in',
      password: seal('app-password'), fromEmail: 'office@greenfield.edu.in', fromName: 'Greenfield Office', dailyLimit: 100
    };
    await enqueue(models, [row(1)]);
    const transport = fakeTransport();
    await drainTenant({ dbName: 't' }, { transportOverride: transport, now: new Date(Date.now() + 1000) });
    expect(transport.sent[0].from).toEqual({ name: 'Greenfield Office', address: 'office@greenfield.edu.in' });
    expect(store.outbox[0].sender).toBe('school');
  });

  it('stops emailing an address that bounced and retries passing trouble later', async () => {
    await enqueue(models, [row(1), row(2)]);
    const bounce = Object.assign(new Error('550 5.1.1 User unknown'), { responseCode: 550, response: '550 5.1.1 User unknown' });
    const timeout = Object.assign(new Error('Connection timeout'), { code: 'ETIMEDOUT' });
    const transport = fakeTransport((message) => (String(message.to.address).startsWith('parent1') ? bounce : timeout));
    const result = await drainTenant({ dbName: 't' }, { transportOverride: transport, now: new Date(Date.now() + 1000) });
    expect(result).toMatchObject({ failed: 1, retried: 1 });
    expect(store.suppressions.map((s) => s.email)).toEqual(['parent1@mail.in']);
    expect(store.outbox[1]).toMatchObject({ status: 'queued', attempts: 1 });

    await enqueue(models, [row(9, { to: 'parent1@mail.in' })]);
    const again = await drainTenant({ dbName: 't' }, { transportOverride: fakeTransport(), now: new Date(Date.now() + 1000) });
    expect(again.suppressed).toBe(1);
    expect(isPermanent(timeout)).toBe(false);
  });

  it('marks mail skipped when no account is set up anywhere', async () => {
    delete process.env.MAIL_EVENTS_USER;
    await enqueue(models, [row(1)]);
    const result = await drainTenant({ dbName: 't' }, { transportOverride: fakeTransport(), now: new Date(Date.now() + 1000) });
    expect(result.skipped).toBe(1);
    expect(store.outbox[0].status).toBe('skipped');
  });
});

describe('secrets and links', () => {
  it('stores the school password encrypted and refuses a tampered box', () => {
    const box = seal('app-password');
    expect(box.data).not.toContain('app-password');
    expect(open(box)).toBe('app-password');
    expect(open({ ...box, data: Buffer.from('nope').toString('base64') })).toBeNull();
  });

  it('signs unsubscribe tokens', () => {
    const token = tokenFor({ slug: 'greenfield', userId: 'u1', category: 'calendar' });
    expect(readToken(token)).toEqual({ slug: 'greenfield', userId: 'u1', category: 'calendar' });
    expect(readToken(`${token.split('.')[0]}.bad`)).toBeNull();
    expect(readToken('junk')).toBeNull();
  });
});

describe('calendar file', () => {
  const base = { uid: 'abc@greenfield.capabble.cloud', revision: 3, title: 'Annual Day; dress, white', startDate: '2026-11-14', endDate: '2026-11-14' };

  it('writes an all-day event with an exclusive end and a stable UID', () => {
    const ics = buildIcs({ ...base, allDay: true }, { method: 'PUBLISH', now: new Date('2026-10-23T00:00:00Z') });
    expect(ics).toContain('METHOD:PUBLISH');
    expect(ics).toContain('UID:abc@greenfield.capabble.cloud');
    expect(ics).toContain('SEQUENCE:2');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261114');
    expect(ics).toContain('DTEND;VALUE=DATE:20261115');
    expect(ics).toContain('SUMMARY:Annual Day\\; dress\\, white');
    expect(ics.split('\r\n').every((line) => Buffer.byteLength(line) <= 75)).toBe(true);
  });

  it('writes a timed, repeating event in India time and a cancellation', () => {
    const ics = buildIcs({
      ...base,
      allDay: false,
      startTime: '09:30',
      endTime: '11:00',
      recurrence: { freq: 'weekly', byDay: [6], until: '2027-03-31', exDates: ['2026-11-21'] }
    }, { method: 'CANCEL' });
    expect(ics).toContain('BEGIN:VTIMEZONE');
    expect(ics).toContain('DTSTART;TZID=Asia/Kolkata:20261114T093000');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=SA;UNTIL=20270331');
    expect(ics).toContain('EXDATE;TZID=Asia/Kolkata:20261121T093000');
    expect(ics).toContain('METHOD:CANCEL');
    expect(ics).toContain('STATUS:CANCELLED');
  });
});
