/**
 * The outbox for school emails (calendar events today; any bulk school mail later).
 *
 * Emails are written to the school's `mail_outbox` first (enqueue) and sent by
 * a worker, never inside a request:
 *  - from the school's own email account when it has set one up (Settings → School
 *    email), up to its daily limit;
 *  - otherwise from the platform's events mailbox (MAIL_EVENTS_*: events@capabble.cloud),
 *    with a fair daily share per school (MAIL_EVENTS_DAILY_CAP_PER_TENANT).
 * Login codes, password resets, invites and billing never come through here: they
 * keep using utils/mailer.js and no-reply@, so a big school event can't use up
 * that mailbox's daily limit.
 *
 * Each row has a unique dedupeKey, so re-running a delivery never emails twice.
 * Temporary failures retry with backoff; a permanent "no such mailbox" puts the
 * address on the school's suppression list. One worker at a time (lease).
 */
const nodemailer = require('nodemailer');
const { getPlatformModels } = require('../tenancy/platformModels');
const { TENANT_STATUS } = require('../models/platform/Tenant');
const { getTenantConnectionAndModels } = require('../tenancy/tenantConnectionManager');
const { open: openSecret } = require('../utils/secretBox');
const { LOGO_CID, LOGO_PATH } = require('./brand');
const schoolDate = require('../utils/schoolDate');

const MODEL_KEYS = ['MailOutbox', 'MailSuppression', 'SchoolMailSettings', 'SchoolProfile'];
const LEASE = 'mail-outbox';
const TICK_MS = 60 * 1000;
const SWEEP_EVERY = 10; // ticks: look at every school this often, not only ones that queued mail
const BATCH = 40; // emails per school per tick
const MAX_ATTEMPTS = 5;

const clean = (value) => String(value || '').trim();
const int = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** The platform's events mailbox, or null when it isn't configured. */
const platformSender = () => {
  const host = clean(process.env.MAIL_EVENTS_HOST || process.env.SMTP_HOST);
  const user = clean(process.env.MAIL_EVENTS_USER);
  const pass = clean(process.env.MAIL_EVENTS_PASS);
  const fromEmail = clean(process.env.MAIL_EVENTS_FROM || user);
  if (!host || !user || !pass || !fromEmail) return null;
  const port = int(process.env.MAIL_EVENTS_PORT || process.env.SMTP_PORT, 465);
  const secureEnv = clean(process.env.MAIL_EVENTS_SECURE || process.env.SMTP_SECURE);
  return {
    key: 'platform',
    host,
    port,
    secure: secureEnv ? ['1', 'true', 'yes'].includes(secureEnv.toLowerCase()) : port === 465,
    user,
    pass,
    fromEmail,
    dailyLimit: int(process.env.MAIL_EVENTS_DAILY_CAP_PER_TENANT, 300)
  };
};

/** The school's own account when it is switched on and readable. */
const schoolSender = (settings) => {
  if (!settings?.enabled || !settings.host || !settings.user || !settings.fromEmail) return null;
  const pass = openSecret(settings.password);
  if (!pass) return null;
  return {
    key: 'school',
    host: settings.host,
    port: settings.port || 587,
    secure: Boolean(settings.secure),
    user: settings.user,
    pass,
    fromEmail: settings.fromEmail,
    fromName: settings.fromName,
    replyTo: settings.replyTo,
    dailyLimit: settings.dailyLimit || 1500
  };
};

const transports = new Map();
const transportFor = (sender) => {
  const cacheKey = JSON.stringify([sender.host, sender.port, sender.secure, sender.user, sender.pass]);
  if (!transports.has(cacheKey)) {
    transports.set(cacheKey, nodemailer.createTransport({
      host: sender.host,
      port: sender.port,
      secure: sender.secure,
      auth: { user: sender.user, pass: sender.pass },
      pool: true,
      maxConnections: 2,
      // Stay well under shared-hosting rate limits.
      rateDelta: 1000,
      rateLimit: 2,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000
    }));
  }
  return transports.get(cacheKey);
};

/** Permanent recipient errors (no such mailbox, domain doesn't exist). */
const isPermanent = (error) => {
  const code = Number(error?.responseCode);
  const text = String(error?.response || error?.message);
  return code >= 550 && code <= 554 && /user|mailbox|recipient|address|no such|does not exist|unknown/i.test(text);
};

/** Problems with the sending account itself (wrong password): retrying soon won't help. */
const isAuthProblem = (error) => error?.code === 'EAUTH' || Number(error?.responseCode) === 535;

/**
 * Add emails to a school's outbox. `rows`: [{ dedupeKey, to, toName, userId, subject, html, text, ics,
 * icsMethod, unsubscribeUrl, category, entity }]. Rows already queued (same dedupeKey) are skipped.
 * Returns how many were added.
 */
const enqueue = async (models, rows) => {
  const { MailOutbox } = models;
  if (!MailOutbox || !rows.length) return 0;
  try {
    const docs = rows.map((row) => ({ ...row, status: 'queued', nextAttemptAt: new Date() }));
    const inserted = await MailOutbox.insertMany(docs, { ordered: false });
    return inserted.length;
  } catch (error) {
    const duplicates = error?.writeErrors?.length && error.writeErrors.every((e) => (e.code ?? e.err?.code) === 11000);
    if (error?.code === 11000 || duplicates) {
      return error.insertedDocs?.length ?? (rows.length - (error.writeErrors?.length || 0));
    }
    throw error;
  }
};

const pending = new Set();
/** Tell the worker a school has mail waiting, so it doesn't wait for the next full sweep. */
const notifyQueued = (dbName) => { if (dbName) pending.add(dbName); };

const startOfToday = () => schoolDate.startOfDay(schoolDate.today());

const tomorrowMorning = () => schoolDate.startOfDay(schoolDate.addDays(schoolDate.today(), 1));

const messageFor = (mail, { fromName, fromEmail, replyTo }) => {
  const headers = {};
  if (mail.unsubscribeUrl) {
    headers['List-Unsubscribe'] = `<${mail.unsubscribeUrl}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  const attachments = mail.html && mail.html.includes(`cid:${LOGO_CID}`)
    ? [{ filename: 'capabble.png', path: LOGO_PATH, cid: LOGO_CID, contentDisposition: 'inline' }]
    : [];
  const ical = mail.ics
    ? { icalEvent: { method: mail.icsMethod || 'PUBLISH', filename: 'event.ics', content: mail.ics } }
    : {};
  return {
    from: { name: fromName, address: fromEmail },
    replyTo,
    to: mail.toName ? { name: mail.toName, address: mail.to } : mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    headers,
    attachments,
    ...ical
  };
};

/** Send one school's queued mail. Returns { sent, failed, capped, retried, suppressed }. */
const drainTenant = async (tenant, { now = new Date(), transportOverride = null } = {}) => {
  const { models } = getTenantConnectionAndModels(tenant.dbName, MODEL_KEYS);
  const {
    MailOutbox, MailSuppression, SchoolMailSettings, SchoolProfile
  } = models;
  const result = {
    sent: 0, failed: 0, capped: 0, retried: 0, suppressed: 0
  };
  const due = await MailOutbox.find({ status: 'queued', nextAttemptAt: { $lte: now } })
    .sort({ createdAt: 1 }).limit(BATCH).lean();
  if (!due.length) return result;
  const mark = (id, set, inc = false) => MailOutbox.updateOne(
    { _id: id },
    { $set: set, ...(inc ? { $inc: { attempts: 1 } } : {}) }
  );

  const [settings, profile] = await Promise.all([
    SchoolMailSettings.findOne({ key: 'default' }).lean(),
    SchoolProfile.findOne({}).select('schoolName email').lean()
  ]);
  const sender = schoolSender(settings) || platformSender();
  const schoolName = profile?.schoolName || tenant.name || '';
  if (!sender) {
    await MailOutbox.updateMany(
      { _id: { $in: due.map((m) => m._id) } },
      { $set: { status: 'skipped', lastError: 'No email account is set up' } }
    );
    return { ...result, skipped: due.length };
  }

  const sentToday = await MailOutbox.countDocuments({
    sender: sender.key, status: 'sent', sentAt: { $gte: startOfToday() }
  });
  let allowance = Math.max(0, sender.dailyLimit - sentToday);
  const bounced = await MailSuppression.find({ email: { $in: due.map((m) => m.to) } }).select('email').lean();
  const suppressed = new Set(bounced.map((row) => row.email));
  const transport = transportOverride || transportFor(sender);
  const envelope = {
    fromEmail: sender.fromEmail,
    fromName: sender.key === 'school'
      ? sender.fromName || schoolName || 'School'
      : `${schoolName ? `${schoolName} via ` : ''}Capabble`,
    replyTo: sender.key === 'school' ? sender.replyTo || undefined : profile?.email || undefined
  };

  /* eslint-disable no-await-in-loop, no-continue, no-restricted-syntax */
  for (const mail of due) {
    if (suppressed.has(mail.to)) {
      await mark(mail._id, { status: 'suppressed', lastError: 'Address bounced before' });
      result.suppressed += 1;
      continue;
    }
    if (allowance <= 0) {
      // Over today's limit: keep it queued for tomorrow morning, never drop it silently.
      await mark(mail._id, {
        status: 'queued', nextAttemptAt: tomorrowMorning(), lastError: 'Daily email limit reached'
      });
      result.capped += 1;
      continue;
    }
    // Claim it, so a second worker (if the lease ever slipped) skips it.
    const claimed = await MailOutbox.findOneAndUpdate(
      { _id: mail._id, status: 'queued' },
      { $set: { status: 'sending', sender: sender.key } }
    );
    if (!claimed) continue;
    try {
      const info = await transport.sendMail(messageFor(mail, envelope));
      const messageId = String(info?.messageId || '').slice(0, 300);
      await mark(mail._id, {
        status: 'sent', sentAt: new Date(), messageId, lastError: ''
      }, true);
      allowance -= 1;
      result.sent += 1;
    } catch (error) {
      const attempts = (mail.attempts || 0) + 1;
      const message = String(error?.message || error).slice(0, 300);
      if (isPermanent(error)) {
        await MailSuppression.updateOne(
          { email: mail.to },
          { $setOnInsert: { email: mail.to, reason: 'bounced', detail: message } },
          { upsert: true }
        );
        await mark(mail._id, { status: 'failed', lastError: message }, true);
        result.failed += 1;
      } else if (attempts >= MAX_ATTEMPTS) {
        await mark(mail._id, { status: 'failed', lastError: message }, true);
        result.failed += 1;
      } else {
        const delayMin = isAuthProblem(error) ? 60 : 2 ** attempts;
        const nextAttemptAt = new Date(Date.now() + delayMin * 60000);
        await mark(mail._id, { status: 'queued', lastError: message, nextAttemptAt }, true);
        result.retried += 1;
      }
      if (isAuthProblem(error) && sender.key === 'school') {
        // The school's password stopped working: tell the settings page, and stop for now.
        await SchoolMailSettings.updateOne({ key: 'default' }, { $set: { lastTestOk: false, lastError: message } });
        break;
      }
    }
  }
  /* eslint-enable no-await-in-loop, no-continue, no-restricted-syntax */
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
          const result = await drainTenant(tenant);
          if (result.sent || result.failed || result.capped) {
            console.log(`[mail-outbox] ${tenant.slug}: ${JSON.stringify(result)}`);
          }
        } catch (error) {
          console.error(`[mail-outbox] ${tenant.slug} failed: ${error.message}`);
        }
      }
    } finally {
      await releaseLease(LEASE);
    }
  } catch (error) {
    console.error('[mail-outbox] tick failed', error.message);
  } finally {
    running = false;
  }
};

const start = ({ intervalMs = TICK_MS } = {}) => {
  if (timer || String(process.env.MAIL_OUTBOX_ENABLED || 'true') !== 'true') return;
  timer = setInterval(tick, intervalMs);
  timer.unref();
  setTimeout(tick, 30 * 1000).unref();
};

const stop = () => {
  if (timer) clearInterval(timer);
  timer = null;
  transports.forEach((transport) => transport.close?.());
  transports.clear();
};

/** Delivery counts for one entity (e.g. a calendar event), for its send report. */
const summaryFor = async (models, entityId) => {
  const { MailOutbox } = models;
  if (!MailOutbox) return {};
  const rows = await MailOutbox.aggregate([
    { $match: { 'entity.id': String(entityId) } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);
  return Object.fromEntries(rows.map((row) => [row._id, row.count]));
};

module.exports = {
  enqueue,
  notifyQueued,
  drainTenant,
  start,
  stop,
  tick,
  summaryFor,
  platformSender,
  schoolSender,
  isPermanent,
  transportFor
};
