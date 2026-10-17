// Modules, versioned prices, bundles, add-ons and coupons.
const { and, eq, isNull, lte, or, gt, asc, desc, inArray } = require('drizzle-orm');
const { getDb, transaction } = require('../db/client');
const s = require('../db/schema');
const { audit } = require('./auditService');
const HttpError = require('../utils/httpError');

const activePriceWhere = (now) => and(
  lte(s.modulePrices.effectiveFrom, now),
  or(isNull(s.modulePrices.effectiveTo), gt(s.modulePrices.effectiveTo, now)),
);

/** Prices in force at `now`, keyed by `${moduleCode}:${interval}`. */
async function currentPrices(db = getDb(), now = new Date(), moduleCodes = null) {
  const where = moduleCodes
    ? and(activePriceWhere(now), inArray(s.modulePrices.moduleCode, moduleCodes))
    : activePriceWhere(now);
  const rows = await db.select().from(s.modulePrices).where(where);
  return new Map(rows.map((row) => [`${row.moduleCode}:${row.interval}`, row]));
}

async function listModules({ includeInactive = false } = {}, db = getDb()) {
  const rows = await db.select().from(s.modules)
    .where(includeInactive ? undefined : eq(s.modules.active, true))
    .orderBy(asc(s.modules.sortOrder), asc(s.modules.code));
  const prices = await currentPrices(db);
  return rows.map((mod) => ({
    ...mod,
    prices: {
      month: prices.get(`${mod.code}:month`) || null,
      year: prices.get(`${mod.code}:year`) || null,
    },
  }));
}

async function upsertModule(actor, input) {
  return transaction(async (tx) => {
    const [before] = await tx.select().from(s.modules).where(eq(s.modules.code, input.code));
    const values = {
      code: input.code,
      name: input.name,
      description: input.description ?? before?.description ?? '',
      isCore: input.isCore ?? before?.isCore ?? false,
      active: input.active ?? before?.active ?? true,
      sortOrder: input.sortOrder ?? before?.sortOrder ?? 100,
    };
    const [after] = await tx.insert(s.modules).values(values)
      .onConflictDoUpdate({ target: s.modules.code, set: values })
      .returning();
    await audit(tx, { actor, entityType: 'module', entityId: after.code, action: before ? 'module.updated' : 'module.created', before, after });
    return after;
  });
}

/**
 * A new price version. The open version for the same module and interval is
 * closed at the new version's start, so history is kept and invoices that
 * reference an old price keep pointing at what was charged.
 */
async function setModulePrice(actor, input) {
  const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();
  return transaction(async (tx) => {
    const [mod] = await tx.select().from(s.modules).where(eq(s.modules.code, input.moduleCode));
    if (!mod) throw new HttpError(404, `Module ${input.moduleCode} not found`);
    if (mod.isCore) throw new HttpError(400, 'Core is always included and has no price');

    const [open] = await tx.select().from(s.modulePrices)
      .where(and(
        eq(s.modulePrices.moduleCode, input.moduleCode),
        eq(s.modulePrices.interval, input.interval),
        isNull(s.modulePrices.effectiveTo),
      ))
      .for('update');
    if (open && open.effectiveFrom >= effectiveFrom) {
      throw new HttpError(409, 'A newer price already starts on or after that date');
    }
    if (open) {
      await tx.update(s.modulePrices).set({ effectiveTo: effectiveFrom }).where(eq(s.modulePrices.id, open.id));
    }
    const [created] = await tx.insert(s.modulePrices).values({
      moduleCode: input.moduleCode,
      interval: input.interval,
      basePaise: input.basePaise,
      includedStudents: input.includedStudents ?? 500,
      perStudentPaise: input.perStudentPaise ?? 0,
      effectiveFrom,
    }).returning();
    await audit(tx, {
      actor, entityType: 'module_price', entityId: `${input.moduleCode}:${input.interval}`, action: 'price.changed', before: open || null, after: created,
    });
    return created;
  });
}

async function priceHistory(moduleCode, db = getDb()) {
  return db.select().from(s.modulePrices)
    .where(eq(s.modulePrices.moduleCode, moduleCode))
    .orderBy(asc(s.modulePrices.interval), desc(s.modulePrices.effectiveFrom));
}

async function listBundles({ includeInactive = false } = {}, db = getDb()) {
  const rows = await db.select().from(s.bundles)
    .where(includeInactive ? undefined : eq(s.bundles.active, true))
    .orderBy(asc(s.bundles.code));
  const links = await db.select().from(s.bundleModules);
  return rows.map((bundle) => ({
    ...bundle,
    moduleCodes: links.filter((l) => l.bundleCode === bundle.code).map((l) => l.moduleCode).sort(),
  }));
}

async function getBundle(code, db = getDb()) {
  if (!code) return null;
  const [bundle] = await db.select().from(s.bundles).where(eq(s.bundles.code, code));
  if (!bundle) return null;
  const links = await db.select().from(s.bundleModules).where(eq(s.bundleModules.bundleCode, code));
  return { ...bundle, moduleCodes: links.map((l) => l.moduleCode).sort() };
}

async function upsertBundle(actor, input) {
  return transaction(async (tx) => {
    const before = await getBundle(input.code, tx);
    const known = await tx.select({ code: s.modules.code }).from(s.modules)
      .where(and(inArray(s.modules.code, input.moduleCodes), eq(s.modules.isCore, false)));
    if (known.length !== new Set(input.moduleCodes).size) {
      throw new HttpError(400, 'A bundle can only contain known, non-core modules');
    }
    const values = {
      code: input.code,
      name: input.name,
      description: input.description ?? before?.description ?? '',
      discountBps: input.discountBps,
      active: input.active ?? before?.active ?? true,
    };
    await tx.insert(s.bundles).values(values).onConflictDoUpdate({ target: s.bundles.code, set: values });
    await tx.delete(s.bundleModules).where(eq(s.bundleModules.bundleCode, input.code));
    await tx.insert(s.bundleModules).values([...new Set(input.moduleCodes)].map((moduleCode) => ({ bundleCode: input.code, moduleCode })));
    const after = await getBundle(input.code, tx);
    await audit(tx, { actor, entityType: 'bundle', entityId: input.code, action: before ? 'bundle.updated' : 'bundle.created', before, after });
    return after;
  });
}

async function listAddons({ includeInactive = false } = {}, db = getDb()) {
  return db.select().from(s.addons)
    .where(includeInactive ? undefined : eq(s.addons.active, true))
    .orderBy(asc(s.addons.code));
}

async function upsertAddon(actor, input) {
  return transaction(async (tx) => {
    const [before] = await tx.select().from(s.addons).where(eq(s.addons.code, input.code));
    const values = {
      code: input.code,
      name: input.name,
      description: input.description ?? before?.description ?? '',
      amountPaise: input.amountPaise,
      cycle: input.cycle,
      active: input.active ?? before?.active ?? true,
    };
    const [after] = await tx.insert(s.addons).values(values)
      .onConflictDoUpdate({ target: s.addons.code, set: values }).returning();
    await audit(tx, { actor, entityType: 'addon', entityId: after.code, action: before ? 'addon.updated' : 'addon.created', before, after });
    return after;
  });
}

async function listCoupons(db = getDb()) {
  return db.select().from(s.coupons).orderBy(desc(s.coupons.createdAt));
}

async function getCoupon(code, db = getDb()) {
  if (!code) return null;
  const [coupon] = await db.select().from(s.coupons).where(eq(s.coupons.code, String(code).toUpperCase()));
  return coupon || null;
}

async function upsertCoupon(actor, input) {
  const code = String(input.code).toUpperCase();
  return transaction(async (tx) => {
    const [before] = await tx.select().from(s.coupons).where(eq(s.coupons.code, code));
    if (before && before.redeemedCount > 0
      && (input.percentBps !== before.percentBps || (input.fixedPaise ?? null) !== (before.fixedPaise ?? null))) {
      throw new HttpError(409, 'This coupon has been used; create a new code to change its discount');
    }
    const values = {
      code,
      description: input.description ?? before?.description ?? '',
      percentBps: input.percentBps ?? null,
      fixedPaise: input.fixedPaise ?? null,
      duration: input.duration || 'once',
      durationCycles: input.duration === 'repeating' ? input.durationCycles : null,
      maxRedemptions: input.maxRedemptions ?? null,
      moduleCodes: input.moduleCodes && input.moduleCodes.length ? input.moduleCodes : null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      active: input.active ?? before?.active ?? true,
    };
    const [after] = await tx.insert(s.coupons).values(values)
      .onConflictDoUpdate({ target: s.coupons.code, set: values }).returning();
    await audit(tx, { actor, entityType: 'coupon', entityId: code, action: before ? 'coupon.updated' : 'coupon.created', before, after });
    return after;
  });
}

/** What a school can buy: active modules with a price for the interval, bundles and add-ons. */
async function publicCatalog() {
  const [mods, bundles, addons] = await Promise.all([listModules(), listBundles(), listAddons()]);
  return {
    modules: mods.filter((m) => !m.isCore),
    coreModules: mods.filter((m) => m.isCore).map((m) => ({ code: m.code, name: m.name })),
    bundles,
    addons,
  };
}

module.exports = {
  currentPrices,
  listModules,
  upsertModule,
  setModulePrice,
  priceHistory,
  listBundles,
  getBundle,
  upsertBundle,
  listAddons,
  upsertAddon,
  listCoupons,
  getCoupon,
  upsertCoupon,
  publicCatalog,
};
