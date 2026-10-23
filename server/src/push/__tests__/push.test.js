process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const store = { devices: [], outbox: [], users: [] };

// In-memory stand-ins for the school's push collections.
const matches = (row, filter) => Object.entries(filter).every(([key, cond]) => {
  const value = row[key];
  if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
    if ('$in' in cond) return cond.$in.map(String).includes(String(value));
    if ('$ne' in cond) return value !== cond.$ne;
    if ('$lte' in cond) return value <= cond.$lte;
    if ('$lt' in cond) return value < cond.$lt;
  }
  if (cond === null) return value === null || value === undefined;
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
const collection = (name) => ({
  find: (filter) => query(store[name].filter((row) => matches(row, filter))),
  updateOne: async (filter, update) => {
    const row = store[name].find((r) => matches(r, filter));
    if (row) apply(row, update);
    return { modifiedCount: row ? 1 : 0 };
  },
  updateMany: async (filter, update) => { store[name].filter((r) => matches(r, filter)).forEach((r) => apply(r, update)); }
});
const mockModels = {
  Device: collection('devices'),
  User: collection('users'),
  PushOutbox: {
    ...collection('outbox'),
    insertMany: async (rows) => {
      const dupes = rows.filter((row) => store.outbox.some((r) => r.dedupeKey === row.dedupeKey));
      const fresh = rows.filter((row) => !dupes.includes(row));
      store.outbox.push(...fresh.map((row, i) => ({
        _id: `p${store.outbox.length + i}`, attempts: 0, createdAt: new Date(), ticketId: '', receiptCheckedAt: null, ...row
      })));
      if (dupes.length) throw Object.assign(new Error('dup'), { code: 11000, insertedDocs: fresh, writeErrors: dupes.map(() => ({ code: 11000 })) });
      return fresh;
    }
  }
};

jest.mock('../../tenancy/tenantConnectionManager', () => ({ getTenantConnectionAndModels: () => ({ models: mockModels }) }));

const {
  queueForNotifications, drainTenant, checkReceipts, isPushToken
} = require('../outbox');
const { registerDevice, unregisterDevice } = require('../controller');

const tenant = { dbName: 'tenant_red', slug: 'red' };
const TOKEN_A = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const TOKEN_B = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';

const fakeFetch = (reply) => jest.fn(async (url, init) => {
  const { status = 200, body } = reply(url, JSON.parse(init.body));
  return { status, json: async () => body };
});

const note = (id, recipient, extra = {}) => ({
  _id: id, recipient, kind: 'fees.due_soon', title: 'Fee due on 10 Nov', body: 'Term 2 fee', link: '/portal/fees', ...extra
});

beforeEach(() => {
  store.devices = [
    { _id: 'd1', user: 'parent1', token: TOKEN_A, tokenVersion: 2, disabledAt: null },
    // Signed out everywhere after registering (user is now on tokenVersion 2).
    { _id: 'd2', user: 'parent1', token: TOKEN_B, tokenVersion: 1, disabledAt: null },
    { _id: 'd3', user: 'parent2', token: 'ExponentPushToken[cccccccccccccccccccccc]', tokenVersion: 0, disabledAt: new Date() }
  ];
  store.users = [{ _id: 'parent1', tokenVersion: 2 }, { _id: 'parent2', tokenVersion: 0 }];
  store.outbox = [];
});

describe('queueing pushes', () => {
  it('pushes only to phones still signed in to that login', async () => {
    const queued = await queueForNotifications(mockModels, tenant, [note('n1', 'parent1'), note('n2', 'parent2')]);
    expect(queued).toBe(1);
    expect(store.outbox[0]).toMatchObject({
      dedupeKey: 'n1:d1',
      token: TOKEN_A,
      title: 'Fee due on 10 Nov',
      data: { notificationId: 'n1', kind: 'fees.due_soon', link: '/portal/fees', school: 'red' }
    });
  });

  it('never queues the same notification for a phone twice', async () => {
    await queueForNotifications(mockModels, tenant, [note('n1', 'parent1')]);
    await queueForNotifications(mockModels, tenant, [note('n1', 'parent1')]);
    expect(store.outbox).toHaveLength(1);
  });

  it('skips logins that were deactivated', async () => {
    store.users[0].isActive = false;
    expect(await queueForNotifications(mockModels, tenant, [note('n1', 'parent1')])).toBe(0);
  });

  it('only accepts Expo push tokens', () => {
    expect(isPushToken(TOKEN_A)).toBe(true);
    expect(isPushToken('ExponentPushToken[]')).toBe(false);
    expect(isPushToken('fcm:abc')).toBe(false);
  });
});

describe('sending pushes', () => {
  beforeEach(async () => {
    store.devices[1].tokenVersion = 2; // both of parent1's phones are signed in
    await queueForNotifications(mockModels, tenant, [note('n1', 'parent1')]);
  });

  it('marks accepted pushes sent and switches off phones that removed the app', async () => {
    const fetchImpl = fakeFetch((url, messages) => {
      expect(url).toMatch(/push\/send$/);
      expect(messages[0]).toMatchObject({ to: TOKEN_A, title: 'Fee due on 10 Nov', sound: 'default' });
      return {
        body: {
          data: [
            { status: 'ok', id: 'ticket-1' },
            { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } }
          ]
        }
      };
    });
    const result = await drainTenant(tenant, { fetchImpl });
    expect(result).toMatchObject({ sent: 1, failed: 1, devicesOff: 1 });
    expect(store.outbox[0]).toMatchObject({ status: 'sent', ticketId: 'ticket-1', attempts: 1 });
    expect(store.outbox[1].status).toBe('failed');
    expect(store.devices[1].disabledAt).toBeInstanceOf(Date);
  });

  it('retries later when Expo is down', async () => {
    const result = await drainTenant(tenant, { fetchImpl: fakeFetch(() => ({ status: 503, body: null })) });
    expect(result.retried).toBe(2);
    expect(store.outbox[0].status).toBe('queued');
    expect(store.outbox[0].nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('does not retry a request Expo refused', async () => {
    const result = await drainTenant(tenant, {
      fetchImpl: fakeFetch(() => ({ status: 400, body: { errors: [{ message: 'bad' }] } }))
    });
    expect(result.failed).toBe(2);
    expect(store.outbox[0].lastError).toMatch(/400: bad/);
  });
});

describe('push receipts', () => {
  it('records delivery and switches off phones Apple or Google no longer know', async () => {
    const sentAt = new Date(Date.now() - 20 * 60 * 1000);
    store.outbox = [
      { _id: 'p1', status: 'sent', ticketId: 't1', device: 'd1', sentAt, receiptCheckedAt: null },
      { _id: 'p2', status: 'sent', ticketId: 't2', device: 'd2', sentAt, receiptCheckedAt: null },
      { _id: 'p3', status: 'sent', ticketId: 't3', device: 'd1', sentAt: new Date(), receiptCheckedAt: null }
    ];
    const fetchImpl = fakeFetch((url, payload) => {
      expect(payload.ids).toEqual(['t1', 't2']); // p3 was sent too recently to ask
      return {
        body: {
          data: {
            t1: { status: 'ok' },
            t2: { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } }
          }
        }
      };
    });
    const result = await checkReceipts(tenant, { fetchImpl });
    expect(result).toEqual({ delivered: 1, failed: 1, devicesOff: 1 });
    expect(store.outbox[0].status).toBe('delivered');
    expect(store.devices[1].disabledAt).toBeInstanceOf(Date);
  });
});

describe('device registration', () => {
  // asyncHandler doesn't return the handler's promise.
  const flush = () => new Promise(setImmediate);
  const res = () => {
    const r = {};
    r.status = jest.fn(() => r);
    r.json = jest.fn(() => r);
    return r;
  };

  it('refuses something that is not an Expo push token', async () => {
    const response = res();
    await registerDevice({ body: { token: 'abc', platform: 'ios' }, models: mockModels, user: { _id: 'parent1' } }, response, jest.fn());
    expect(response.status).toHaveBeenCalledWith(400);
  });

  it('stores the phone against the signed-in login and its session version', async () => {
    const findOneAndUpdate = jest.fn(() => query({ _id: 'd9', platform: 'android' }));
    const response = res();
    await registerDevice({
      body: { token: TOKEN_A, platform: 'android', appVersion: '1.0.0' },
      models: { Device: { findOneAndUpdate } },
      user: { _id: 'parent9', tokenVersion: 4 }
    }, response, jest.fn());
    await flush();
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { token: TOKEN_A },
      { $set: expect.objectContaining({ user: 'parent9', tokenVersion: 4, disabledAt: null }) },
      expect.objectContaining({ upsert: true })
    );
    expect(response.status).toHaveBeenCalledWith(200);
  });

  it('only removes the signed-in login\'s own phone', async () => {
    const deleteOne = jest.fn(async () => ({ deletedCount: 1 }));
    await unregisterDevice({ params: { token: TOKEN_A }, models: { Device: { deleteOne } }, user: { _id: 'parent1' } }, res(), jest.fn());
    await flush();
    expect(deleteOne).toHaveBeenCalledWith({ token: TOKEN_A, user: 'parent1' });
  });
});
