/**
 * Write in-app notifications. The only place that inserts Notification rows.
 *
 *   await send(tenant, recipients, 'fees.payment_recorded', { amount, receiptNo, ... });
 *
 * `tenant` is the event-bus tenant ref ({ dbName, slug, id }). `recipients` are
 * User documents (or ids). The template for `kind` (templates.js) writes the
 * text per recipient and may skip someone by returning null. Never throws:
 * a notification failing must not break the action that caused it.
 *
 * Each row stored for the first time is also pushed to the recipient's phones
 * (push/outbox.js), unless the template says `push: false`.
 */
const { getTenantConnectionAndModels } = require('../tenancy/tenantConnectionManager');
const { catalog } = require('../rbac/catalog');
const { isPortalUser } = require('../rbac/permissions');
const templates = require('./templates');
const { byIds } = require('./recipients');

const MODEL_KEYS = ['Notification', 'User', 'Role', 'SchoolProfile', 'Device', 'PushOutbox'];

const modelsFor = (tenant, extraKeys = []) => {
  if (!tenant?.dbName) throw new Error('tenant.dbName is required');
  return getTenantConnectionAndModels(tenant.dbName, [...new Set([...MODEL_KEYS, ...extraKeys])]).models;
};

const schoolNameCache = new Map();
const schoolNameFor = async (models, tenant) => {
  const cached = schoolNameCache.get(tenant.dbName);
  if (cached && cached.at > Date.now() - 10 * 60 * 1000) return cached.name;
  const profile = await models.SchoolProfile.findOne({}).select('schoolName').lean();
  const name = profile?.schoolName || '';
  schoolNameCache.set(tenant.dbName, { name, at: Date.now() });
  return name;
};

const canOpenSection = (user, section) => !section || (catalog.portal[user.kind] || []).includes(section);

const toUsers = async (models, recipients) => {
  const list = [].concat(recipients || []).filter(Boolean);
  const docs = list.filter((r) => typeof r === 'object' && r.kind);
  const ids = list.filter((r) => !(typeof r === 'object' && r.kind)).map((r) => (r._id || r));
  const loaded = ids.length ? await byIds(models, ids) : [];
  const seen = new Set();
  return [...docs.filter((u) => u.isActive !== false), ...loaded].filter((u) => {
    const key = String(u._id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const build = (template, kind, data, user, context) => {
  const portal = isPortalUser(user);
  if (template.audience === 'staff' && portal) return null;
  if (template.audience === 'family' && !portal) return null;
  if (portal && !canOpenSection(user, template.section)) return null;

  const text = template.build(data, user, context);
  if (!text) return null;
  const link = portal ? text.portalLink ?? template.portalLink : text.link ?? template.link;
  const dedupe = text.dedupeKey ?? (typeof template.dedupeKey === 'function' ? template.dedupeKey(data, user) : undefined);
  return {
    recipient: user._id,
    kind,
    module: template.module || 'core',
    tone: text.tone || template.tone || 'info',
    title: String(text.title).slice(0, 200),
    body: String(text.body || '').slice(0, 1000),
    link: link || '',
    entity: data.entity || {},
    ...(dedupe ? { dedupeKey: `${kind}:${dedupe}`.slice(0, 200) } : {})
  };
};

/** Insert, ignoring rows whose dedupeKey already exists for that recipient. Returns the rows stored now. */
const insertNew = async (Notification, rows) => {
  if (!rows.length) return [];
  try {
    return await Notification.insertMany(rows, { ordered: false });
  } catch (error) {
    const duplicatesOnly = error?.writeErrors?.length && error.writeErrors.every((e) => (e.code ?? e.err?.code) === 11000);
    if (error?.code === 11000 || duplicatesOnly) {
      if (error.insertedDocs) return error.insertedDocs;
      // Count only: nothing to push for rows we can't name.
      return Array.from({ length: rows.length - (error.writeErrors?.length || 0) }, () => null);
    }
    throw error;
  }
};

/** Insert, ignoring rows whose dedupeKey already exists for that recipient. Returns how many were stored. */
const insertRows = async (Notification, rows) => (await insertNew(Notification, rows)).length;

const send = async (tenant, recipients, kind, data = {}) => {
  try {
    const template = templates[kind];
    if (!template) throw new Error(`Unknown notification kind "${kind}"`);
    const models = modelsFor(tenant);
    const users = await toUsers(models, recipients);
    if (!users.length) return 0;
    const context = { schoolName: await schoolNameFor(models, tenant) };
    const rows = users.map((user) => build(template, kind, data, user, context)).filter(Boolean);
    const stored = await insertNew(models.Notification, rows);
    if (template.push !== false) {
      // eslint-disable-next-line global-require
      await require('../push/outbox').queueForNotifications(models, tenant, stored.filter((row) => row?._id));
    }
    return stored.length;
  } catch (error) {
    console.error(`[notifications] ${kind} not sent: ${error.message}`);
    return 0;
  }
};

module.exports = { send, modelsFor, insertRows, build };
