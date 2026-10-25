/**
 * Push notifications to the Capabble app, through Expo's push service.
 *
 * Every in-app notification (notifications/send.js) is also queued here for each
 * phone its recipient is signed in on (queueForNotifications), and a worker sends
 * the queue, never inside a request:
 *  - up to 100 pushes per request to Expo; 429, 5xx and network errors retry with backoff;
 *  - a phone Expo calls DeviceNotRegistered (app removed, token gone) is switched off;
 *  - 15 minutes after sending, receipts say whether Apple or Google took it.
 * Each row has a unique dedupeKey (notification + phone), so re-running never pushes twice.
 * One worker at a time (lease), like the mail outbox.
 *
 * Off with PUSH_OUTBOX_ENABLED=false. EXPO_ACCESS_TOKEN is only needed once
 * "enhanced push security" is turned on for the project in Expo.
 */
const { getPlatformModels } = require('../tenancy/platformModels');
const { TENANT_STATUS } = require('../models/platform/Tenant');
const { getTenantConnectionAndModels } = require('../tenancy/tenantConnectionManager');

const MODEL_KEYS = ['Device', 'PushOutbox', 'User'];
const LEASE = 'push-outbox';
const SEND_URL = 'https://exp.host/--/api/v2/push/send';
const RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const TICK_MS = 30 * 1000;
const SWEEP_EVERY = 20; // ticks: look at every school this often, not only ones that queued pushes
const BATCH = 500; // pushes per school per tick
const CHUNK = 100; // Expo's limit per send request
const RECEIPT_CHUNK = 1000; // Expo's limit per receipts request
const RECEIPT_AFTER_MS = 15 * 60 * 1000;
const RECEIPT_GIVE_UP_MS = 24 * 60 * 60 * 1000; // Expo keeps receipts a day
const MAX_ATTEMPTS = 5;
const TOKEN = /^(ExponentPushToken|ExpoPushToken)\[[^\]]{10,}\]$/;

const isPushToken = (value) => typeof value === 'string' && TOKEN.test(value.trim());

const pending = new Set();
/** Tell the worker a school has pushes waiting, so it doesn't wait for the next full sweep. */
const notifyQueued = (dbName) => { if (dbName) pending.add(dbName); };

/**
 * Queue pushes for notification rows just stored (Notification documents with
 * recipient, kind, title, body, link, entity). Only phones still signed in to
 * that login get one. Returns how many were queued; never throws.
 */
const queueForNotifications = async (models, tenant, notifications) => {
  try {
    const { Device, PushOutbox, User } = models;
    if (!Device || !PushOutbox || !notifications?.length) return 0;
    const userIds = [...new Set(notifications.map((row) => String(row.recipient)))];
    const devices = await Device.find({ user: { $in: userIds }, disabledAt: null })
      .select('user token tokenVersion').lean();
    if (!devices.length) return 0;
    const users = await User.find({ _id: { $in: [...new Set(devices.map((d) => String(d.user)))] } })
      .select('tokenVersion isActive').lean();
    const current = new Map(users.filter((u) => u.isActive !== false).map((u) => [String(u._id), u.tokenVersion || 0]));
    const byUser = new Map();
    devices.forEach((device) => {
      const key = String(device.user);
      // Signed out everywhere since this phone registered: it must sign in again first.
      if (!current.has(key) || (device.tokenVersion || 0) !== current.get(key)) return;
      byUser.set(key, [...(byUser.get(key) || []), device]);
    });

    const rows = [];
    notifications.forEach((note) => {
      (byUser.get(String(note.recipient)) || []).forEach((device) => {
        rows.push({
          dedupeKey: `${note._id}:${device._id}`,
          user: note.recipient,
          device: device._id,
          token: device.token,
          notification: note._id,
          kind: note.kind,
          title: note.title,
          body: note.body || '',
          data: {
            notificationId: String(note._id),
            kind: note.kind,
            link: note.link || '',
            school: tenant?.slug || '',
            ...(note.entity?.type ? { entity: { type: note.entity.type, id: note.entity.id } } : {})
          },
          status: 'queued',
          nextAttemptAt: new Date()
        });
      });
    });
    if (!rows.length) return 0;
    let queued;
    try {
      queued = (await PushOutbox.insertMany(rows, { ordered: false })).length;
    } catch (error) {
      const duplicates = error?.writeErrors?.length
        && error.writeErrors.every((e) => (e.code ?? e.err?.code) === 11000);
      if (!(error?.code === 11000 || duplicates)) throw error;
      queued = error.insertedDocs?.length ?? (rows.length - (error.writeErrors?.length || 0));
    }
    notifyQueued(tenant?.dbName);
    return queued;
  } catch (error) {
    console.error(`[push] not queued: ${error.message}`);
    return 0;
  }
};

const headers = () => ({
  accept: 'application/json',
  'accept-encoding': 'gzip, deflate',
  'content-type': 'application/json',
  ...(process.env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {})
});

/** POST to Expo. Returns { status, body }; network failures come back as status 0. */
const post = async (fetchImpl, url, payload) => {
  try {
    const response = await fetchImpl(url, { method: 'POST', headers: headers(), body: JSON.stringify(payload) });
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { status: response.status, body };
  } catch (error) {
    return { status: 0, body: null, error: error.message };
  }
};

const messageFor = (row) => ({
  to: row.token,
  title: row.title,
  body: row.body || undefined,
  data: row.data || {},
  sound: 'default',
  priority: 'high',
  channelId: 'default'
});

const disableDevice = (Device, id, reason) => Device.updateOne(
  { _id: id, disabledAt: null },
  { $set: { disabledAt: new Date(), disabledReason: String(reason).slice(0, 120) } }
);

const retryable = (status) => status === 0 || status === 429 || status >= 500;

/** Send one school's queued pushes. Returns { sent, failed, retried, devicesOff }. */
const drainTenant = async (tenant, { now = new Date(), fetchImpl = global.fetch } = {}) => {
  const { models } = getTenantConnectionAndModels(tenant.dbName, MODEL_KEYS);
  const { PushOutbox, Device } = models;
  const result = {
    sent: 0, failed: 0, retried: 0, devicesOff: 0
  };
  // A send cut off by a restart is left 'sending': after 10 minutes it is queued again.
  await PushOutbox.updateMany(
    { status: 'sending', updatedAt: { $lt: new Date(now.getTime() - 10 * 60000) } },
    { $set: { status: 'queued', lastError: 'Interrupted; trying again' } }
  );
  const due = await PushOutbox.find({ status: 'queued', nextAttemptAt: { $lte: now } })
    .sort({ createdAt: 1 }).limit(BATCH).lean();
  if (!due.length) return result;
  await PushOutbox.updateMany(
    { _id: { $in: due.map((row) => row._id) }, status: 'queued' },
    { $set: { status: 'sending' } }
  );

  const retryLater = (row, message, attempts) => {
    if (attempts >= MAX_ATTEMPTS) {
      result.failed += 1;
      return { status: 'failed', lastError: message };
    }
    result.retried += 1;
    return { status: 'queued', lastError: message, nextAttemptAt: new Date(now.getTime() + 2 ** attempts * 60000) };
  };

  /* eslint-disable no-await-in-loop, no-restricted-syntax */
  for (let start = 0; start < due.length; start += CHUNK) {
    const chunk = due.slice(start, start + CHUNK);
    const response = await post(fetchImpl, SEND_URL, chunk.map(messageFor));
    const tickets = Array.isArray(response.body?.data) ? response.body.data : null;
    const updates = chunk.map((row, index) => {
      const attempts = (row.attempts || 0) + 1;
      if (response.status !== 200 || !tickets) {
        const message = `Expo push ${response.status || 'unreachable'}: ${
          response.body?.errors?.[0]?.message || response.error || 'no tickets'}`.slice(0, 300);
        // A bad request won't get better by retrying.
        if (!retryable(response.status)) {
          result.failed += 1;
          return { row, set: { status: 'failed', lastError: message } };
        }
        return { row, set: retryLater(row, message, attempts) };
      }
      const ticket = tickets[index] || {};
      if (ticket.status === 'ok') {
        result.sent += 1;
        return { row, set: { status: 'sent', ticketId: String(ticket.id || ''), sentAt: new Date(), lastError: '' } };
      }
      const code = ticket.details?.error || '';
      const message = `${code || 'error'}: ${ticket.message || ''}`.slice(0, 300);
      if (code === 'DeviceNotRegistered') {
        result.failed += 1;
        return { row, set: { status: 'failed', lastError: message }, disable: code };
      }
      if (code === 'MessageRateExceeded') return { row, set: retryLater(row, message, attempts) };
      result.failed += 1;
      return { row, set: { status: 'failed', lastError: message } };
    });
    for (const { row, set, disable } of updates) {
      await PushOutbox.updateOne({ _id: row._id }, { $set: set, $inc: { attempts: 1 } });
      if (disable) {
        const changed = await disableDevice(Device, row.device, disable);
        result.devicesOff += changed?.modifiedCount || 0;
      }
    }
  }
  /* eslint-enable no-await-in-loop, no-restricted-syntax */
  return result;
};

/** Read Expo's receipts for pushes sent 15+ minutes ago. Returns { delivered, failed, devicesOff }. */
const checkReceipts = async (tenant, { now = new Date(), fetchImpl = global.fetch } = {}) => {
  const { models } = getTenantConnectionAndModels(tenant.dbName, MODEL_KEYS);
  const { PushOutbox, Device } = models;
  const result = { delivered: 0, failed: 0, devicesOff: 0 };
  const rows = await PushOutbox.find({
    status: 'sent',
    ticketId: { $ne: '' },
    receiptCheckedAt: null,
    sentAt: { $lte: new Date(now.getTime() - RECEIPT_AFTER_MS) }
  }).select('ticketId device sentAt').limit(RECEIPT_CHUNK).lean();
  if (!rows.length) return result;
  const response = await post(fetchImpl, RECEIPTS_URL, { ids: rows.map((row) => row.ticketId) });
  if (response.status !== 200 || !response.body?.data) return result;
  const receipts = response.body.data;

  /* eslint-disable no-await-in-loop, no-restricted-syntax, no-continue */
  for (const row of rows) {
    const receipt = receipts[row.ticketId];
    if (!receipt) {
      // No receipt yet; after a day Expo has dropped it, so stop asking.
      if (row.sentAt < new Date(now.getTime() - RECEIPT_GIVE_UP_MS)) {
        await PushOutbox.updateOne({ _id: row._id }, { $set: { receiptCheckedAt: now } });
      }
      continue;
    }
    if (receipt.status === 'ok') {
      await PushOutbox.updateOne({ _id: row._id }, { $set: { status: 'delivered', receiptCheckedAt: now } });
      result.delivered += 1;
      continue;
    }
    const code = receipt.details?.error || '';
    await PushOutbox.updateOne({ _id: row._id }, {
      $set: {
        status: 'failed',
        receiptCheckedAt: now,
        lastError: `${code || 'error'}: ${receipt.message || ''}`.slice(0, 300)
      }
    });
    result.failed += 1;
    if (code === 'DeviceNotRegistered') {
      const changed = await disableDevice(Device, row.device, code);
      result.devicesOff += changed?.modifiedCount || 0;
    }
    if (code === 'InvalidCredentials' || code === 'MismatchSenderId') {
      console.error(`[push] ${tenant.slug}: ${code}. Check the app's push credentials in Expo (eas credentials).`);
    }
  }
  /* eslint-enable no-await-in-loop, no-restricted-syntax, no-continue */
  return result;
};

let timer = null;
let running = false;
let ticks = 0;

const tick = async () => {
  if (running) return;
  running = true;
  ticks += 1;
  try {
    // eslint-disable-next-line global-require
    const { acquireLease, releaseLease } = require('../modules/dataLifecycle/lease');
    if (!await acquireLease(LEASE, 5)) return;
    try {
      const sweep = ticks % SWEEP_EVERY === 1;
      const filter = { status: TENANT_STATUS.ACTIVE };
      if (!sweep) {
        if (!pending.size) return;
        filter.dbName = { $in: [...pending] };
      }
      pending.clear();
      const tenants = await getPlatformModels().Tenant.find(filter).select('slug dbName name').lean();
      // eslint-disable-next-line no-restricted-syntax
      for (const tenant of tenants) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const sent = await drainTenant(tenant);
          // eslint-disable-next-line no-await-in-loop
          const receipts = sweep ? await checkReceipts(tenant) : null;
          if (sent.sent || sent.failed || receipts?.failed) {
            console.log(`[push] ${tenant.slug}: ${JSON.stringify({ ...sent, receipts })}`);
          }
        } catch (error) {
          console.error(`[push] ${tenant.slug} failed: ${error.message}`);
        }
      }
    } finally {
      await releaseLease(LEASE);
    }
  } catch (error) {
    console.error('[push] tick failed', error.message);
  } finally {
    running = false;
  }
};

const start = ({ intervalMs = TICK_MS } = {}) => {
  if (timer || String(process.env.PUSH_OUTBOX_ENABLED || 'true') !== 'true') return;
  timer = setInterval(tick, intervalMs);
  timer.unref();
  setTimeout(tick, 30 * 1000).unref();
};

const stop = () => {
  if (timer) clearInterval(timer);
  timer = null;
};

module.exports = {
  queueForNotifications,
  notifyQueued,
  drainTenant,
  checkReceipts,
  isPushToken,
  start,
  stop,
  tick
};
