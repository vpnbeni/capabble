// Billing accounts: one per school (tenant), keyed by the tenant's id and slug.
const { eq, or, ilike, sql, desc } = require('drizzle-orm');
const { getDb, transaction } = require('../db/client');
const s = require('../db/schema');
const { audit } = require('./auditService');
const { normalizeGstin, isValidGstin, isValidStateCode } = require('../domain/gst');
const HttpError = require('../utils/httpError');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findAccountBySlug(slug, db = getDb()) {
  const [account] = await db.select().from(s.accounts).where(eq(s.accounts.tenantSlug, String(slug).toLowerCase()));
  return account || null;
}

/** Admin routes may name a school by account id, tenant id or slug. */
async function findAccount(key, db = getDb()) {
  const value = String(key);
  const conditions = [eq(s.accounts.tenantId, value), eq(s.accounts.tenantSlug, value.toLowerCase())];
  if (UUID_PATTERN.test(value)) conditions.push(eq(s.accounts.id, value));
  const [account] = await db.select().from(s.accounts).where(or(...conditions));
  return account || null;
}

async function requireAccount(key, db = getDb()) {
  const account = await findAccount(key, db);
  if (!account) throw new HttpError(404, 'Billing account not found');
  return account;
}

/** Create or refresh the account inside the caller's transaction. */
async function ensureAccount(tx, actor, { tenantId, tenantSlug, tenantName, billingEmail }) {
  const slug = String(tenantSlug).toLowerCase();
  const [before] = await tx.select().from(s.accounts).where(eq(s.accounts.tenantSlug, slug));
  if (before) {
    const changes = {};
    if (tenantName && tenantName !== before.tenantName) changes.tenantName = tenantName;
    if (tenantId && tenantId !== before.tenantId) changes.tenantId = String(tenantId);
    if (!Object.keys(changes).length) return before;
    const [after] = await tx.update(s.accounts).set(changes).where(eq(s.accounts.id, before.id)).returning();
    await audit(tx, { actor, entityType: 'account', entityId: after.id, accountId: after.id, action: 'account.updated', before, after });
    return after;
  }
  const [created] = await tx.insert(s.accounts).values({
    tenantId: String(tenantId || slug),
    tenantSlug: slug,
    tenantName: tenantName || slug,
    billingEmail: String(billingEmail || '').toLowerCase(),
    legalName: tenantName || ''
  }).returning();
  await audit(tx, { actor, entityType: 'account', entityId: created.id, accountId: created.id, action: 'account.created', after: created });
  return created;
}

const PROFILE_FIELDS = ['billingEmail', 'legalName', 'gstin', 'addressLine1', 'addressLine2', 'city', 'postalCode', 'stateCode'];

function cleanProfile(input) {
  const out = {};
  for (const key of PROFILE_FIELDS) {
    if (input[key] !== undefined) out[key] = typeof input[key] === 'string' ? input[key].trim() : input[key];
  }
  // v1 clients sent a nested address and placeOfSupply.
  if (input.address && typeof input.address === 'object') {
    if (input.address.line1 !== undefined) out.addressLine1 = String(input.address.line1).trim();
    if (input.address.line2 !== undefined) out.addressLine2 = String(input.address.line2).trim();
    if (input.address.city !== undefined) out.city = String(input.address.city).trim();
    if (input.address.postalCode !== undefined) out.postalCode = String(input.address.postalCode).trim();
  }
  if (input.placeOfSupply !== undefined && out.stateCode === undefined) out.stateCode = input.placeOfSupply;

  if (out.billingEmail !== undefined) {
    out.billingEmail = out.billingEmail.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.billingEmail)) throw new HttpError(400, 'Enter a valid billing email');
  }
  if (out.gstin !== undefined) {
    out.gstin = normalizeGstin(out.gstin);
    if (out.gstin && !isValidGstin(out.gstin)) throw new HttpError(400, 'GSTIN is not valid');
  }
  if (out.stateCode !== undefined) {
    out.stateCode = out.stateCode ? String(out.stateCode).padStart(2, '0') : null;
    if (out.stateCode && !isValidStateCode(out.stateCode)) throw new HttpError(400, 'State code is not valid');
  }
  // A GSTIN fixes the state of registration.
  if (out.gstin) out.stateCode = out.gstin.slice(0, 2);
  return out;
}

async function updateProfile(actor, key, input) {
  const changes = cleanProfile(input);
  return transaction(async (tx) => {
    const before = await requireAccount(key, tx);
    if (!Object.keys(changes).length) return before;
    const [after] = await tx.update(s.accounts).set(changes).where(eq(s.accounts.id, before.id)).returning();
    await audit(tx, { actor, entityType: 'account', entityId: after.id, accountId: after.id, action: 'account.profile_updated', before, after });
    return after;
  });
}

async function listAccounts({ page = 1, limit = 25, search = '' } = {}, db = getDb()) {
  const where = search
    ? or(ilike(s.accounts.tenantName, `%${search}%`), ilike(s.accounts.tenantSlug, `%${search}%`), ilike(s.accounts.legalName, `%${search}%`))
    : undefined;
  const [{ total }] = await db.select({ total: sql`count(*)::int` }).from(s.accounts).where(where);
  const items = await db.select().from(s.accounts).where(where)
    .orderBy(desc(s.accounts.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);
  return { items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}

module.exports = {
  findAccountBySlug,
  findAccount,
  requireAccount,
  ensureAccount,
  updateProfile,
  listAccounts,
  cleanProfile
};
