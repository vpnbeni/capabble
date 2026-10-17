// Subscriptions: trials, module selection, changes, renewals, cancellation and extensions.
const { and, eq, ne, isNull, asc, desc, inArray, sql, lte } = require('drizzle-orm');
const { getDb, transaction } = require('../db/client');
const s = require('../db/schema');
const config = require('../config');
const { audit } = require('./auditService');
const accounts = require('./accountService');
const catalog = require('./catalogService');
const invoices = require('./invoiceService');
const { buildLines, prorationFactor, couponIsUsable } = require('../domain/pricing');
const { applyGst, placeOfSupply } = require('../domain/gst');
const sm = require('../domain/stateMachine');
const { SUBSCRIPTION_STATES: S } = require('../domain/constants');
const HttpError = require('../utils/httpError');

const dateLabel = (date) => new Intl.DateTimeFormat('en-IN', {
  timeZone: config.timezone, day: 'numeric', month: 'short', year: 'numeric',
}).format(new Date(date));

const periodLabel = (start, end) => `${dateLabel(start)} – ${dateLabel(new Date(new Date(end).getTime() - 1))}`;

/** The live subscription (anything but canceled), else the latest canceled one. */
async function findSubscription(tx, accountId, { lock = false } = {}) {
  let query = tx.select().from(s.subscriptions)
    .where(and(eq(s.subscriptions.accountId, accountId), ne(s.subscriptions.state, S.CANCELED)));
  if (lock) query = query.for('update');
  const [live] = await query;
  if (live) return live;
  const [last] = await tx.select().from(s.subscriptions)
    .where(eq(s.subscriptions.accountId, accountId))
    .orderBy(desc(s.subscriptions.createdAt)).limit(1);
  return last || null;
}

async function liveItems(tx, subscriptionId) {
  return tx.select().from(s.subscriptionItems)
    .where(and(eq(s.subscriptionItems.subscriptionId, subscriptionId), isNull(s.subscriptionItems.endedAt)))
    .orderBy(asc(s.subscriptionItems.moduleCode));
}

async function liveAddons(tx, subscriptionId) {
  return tx.select({ row: s.subscriptionAddons, addon: s.addons })
    .from(s.subscriptionAddons)
    .innerJoin(s.addons, eq(s.addons.code, s.subscriptionAddons.addonCode))
    .where(and(eq(s.subscriptionAddons.subscriptionId, subscriptionId), isNull(s.subscriptionAddons.endedAt)))
    .then((rows) => rows.map(({ row, addon }) => ({ ...row, name: addon.name, amountPaise: addon.amountPaise, cycle: addon.cycle })));
}

async function updateSubscription(tx, sub, changes) {
  const [after] = await tx.update(s.subscriptions)
    .set({ ...changes, version: sql`${s.subscriptions.version} + 1` })
    .where(and(eq(s.subscriptions.id, sub.id), eq(s.subscriptions.version, sub.version)))
    .returning();
  if (!after) throw new HttpError(409, 'The subscription changed meanwhile; try again');
  return after;
}

/** Persist every transition time has made due (trial end, grace end, period end). */
async function refreshState(tx, sub, actor, now = new Date()) {
  if (!sub) return sub;
  const [oldestUnpaid] = await tx.select({ dueAt: s.invoices.dueAt }).from(s.invoices)
    .where(and(eq(s.invoices.subscriptionId, sub.id), eq(s.invoices.status, 'open'), lte(s.invoices.dueAt, now)))
    .orderBy(asc(s.invoices.dueAt)).limit(1);
  const { changes, reasons } = sm.advance(sub, now, { unpaidDueAt: oldestUnpaid?.dueAt || null });
  if (!Object.keys(changes).length) return sub;
  const after = await updateSubscription(tx, sub, changes);
  await audit(tx, {
    actor,
    entityType: 'subscription',
    entityId: sub.id,
    accountId: sub.accountId,
    action: 'subscription.state_changed',
    before: { state: sub.state },
    after: { state: after.state, reasons },
  });
  if (after.state === S.CANCELED) {
    await invoices.voidUnpaidInvoices(tx, actor, sub.id, ['subscription_create', 'change', 'renewal'], 'Subscription canceled');
  }
  return after;
}

/** Start a trial with full access to every module. Repeated calls never restart a trial. */
async function onboardTrial(actor, input, now = new Date()) {
  return transaction(async (tx) => {
    const account = await accounts.ensureAccount(tx, actor, input);
    const existing = await findSubscription(tx, account.id, { lock: true });
    if (existing && existing.state !== S.CANCELED) return { account, subscription: existing, created: false };
    const trialDays = input.trialDays || config.trialDays;
    const [subscription] = await tx.insert(s.subscriptions).values({
      accountId: account.id,
      state: S.TRIALING,
      interval: input.interval || 'year',
      trialEndsAt: sm.addDays(now, trialDays),
      declaredStudents: input.declaredStudents || 0,
    }).returning();
    await audit(tx, { actor, entityType: 'subscription', entityId: subscription.id, accountId: account.id, action: 'subscription.trial_started', after: subscription });
    return { account, subscription, created: true };
  });
}

/** Existing schools keep full access for `days` before they need a paid plan. */
async function grandfather(actor, input, now = new Date()) {
  return transaction(async (tx) => {
    const account = await accounts.ensureAccount(tx, actor, input);
    const days = input.days || config.grandfatherDays;
    const existing = await findSubscription(tx, account.id, { lock: true });
    const until = sm.addDays(now, days);
    if (existing && existing.state !== S.CANCELED) {
      if (existing.state === S.ACTIVE) return { account, subscription: existing, created: false };
      const after = await updateSubscription(tx, existing, { state: S.GRANDFATHERED, grandfatherEndsAt: until, graceEndsAt: null });
      await audit(tx, { actor, entityType: 'subscription', entityId: existing.id, accountId: account.id, action: 'subscription.grandfathered', before: existing, after });
      return { account, subscription: after, created: false };
    }
    const [subscription] = await tx.insert(s.subscriptions).values({
      accountId: account.id, state: S.GRANDFATHERED, grandfatherEndsAt: until,
    }).returning();
    await audit(tx, { actor, entityType: 'subscription', entityId: subscription.id, accountId: account.id, action: 'subscription.grandfathered', after: subscription });
    return { account, subscription, created: true };
  });
}

/**
 * Validate a module selection and load everything pricing needs: modules with the
 * price for the interval, the bundle (whose modules are always included), coupon, add-ons.
 */
async function resolveSelection(tx, selection, { now = new Date(), cyclesUsed = 0, previousCouponCode = null } = {}) {
  const interval = selection.interval || 'year';
  const bundle = selection.bundleCode ? await catalog.getBundle(selection.bundleCode, tx) : null;
  if (selection.bundleCode && (!bundle || !bundle.active)) throw new HttpError(400, `Bundle ${selection.bundleCode} is not available`);

  const codes = [...new Set([...(selection.modules || []), ...(bundle?.moduleCodes || [])])];
  const rows = codes.length
    ? await tx.select().from(s.modules).where(inArray(s.modules.code, codes))
    : [];
  const byCode = new Map(rows.map((m) => [m.code, m]));
  const prices = await catalog.currentPrices(tx, now, codes.length ? codes : null);

  const chargeable = [];
  for (const code of codes) {
    const mod = byCode.get(code);
    if (!mod || !mod.active) throw new HttpError(400, `Module ${code} is not available`);
    if (mod.isCore) continue;
    const price = prices.get(`${code}:${interval}`);
    if (!price) throw new HttpError(400, `Module ${mod.name} has no ${interval}ly price yet`);
    chargeable.push({ code, name: mod.name, price });
  }

  let coupon = null;
  if (selection.couponCode) {
    coupon = await catalog.getCoupon(selection.couponCode, tx);
    const sameCoupon = previousCouponCode && coupon && coupon.code === previousCouponCode;
    if (!coupon || !couponIsUsable(coupon, { now, cyclesUsed: sameCoupon ? cyclesUsed : 0 })) {
      throw new HttpError(400, `Coupon ${String(selection.couponCode).toUpperCase()} is not valid`);
    }
  }

  const addonRows = [];
  for (const entry of selection.addons || []) {
    const [addon] = await tx.select().from(s.addons).where(eq(s.addons.code, entry.code));
    if (!addon || !addon.active) throw new HttpError(400, `Add-on ${entry.code} is not available`);
    addonRows.push({ ...addon, quantity: entry.quantity || 1 });
  }

  return { interval, bundle, coupon, modules: chargeable, addons: addonRows };
}

const billedStudentsFor = (declared, reported) => Math.max(declared || 0, reported || 0);

function quote(account, lines) {
  const supplier = config.supplier;
  const pos = placeOfSupply({ buyerGstin: account.gstin, buyerStateCode: account.stateCode, supplierStateCode: supplier.stateCode });
  return applyGst(lines, { supplierStateCode: supplier.stateCode, placeOfSupply: pos });
}

/**
 * Work out what a change would cost now and from the next renewal, without writing.
 * `inPaidPeriod` decides whether the change is a fresh start or a mid-period change.
 */
async function planChange(tx, account, sub, selection, { reportedStudents = 0, now = new Date() } = {}) {
  const resolved = await resolveSelection(tx, selection, {
    now, cyclesUsed: sub?.couponCyclesUsed || 0, previousCouponCode: sub?.couponCode || null,
  });
  const declared = selection.declaredStudents ?? sub?.declaredStudents ?? 0;
  const students = billedStudentsFor(declared, reportedStudents);
  const inPaidPeriod = Boolean(sub && (sub.state === S.ACTIVE || sub.state === S.PAST_DUE_GRACE)
    && sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) > now);

  const bundleInfo = resolved.bundle ? { ...resolved.bundle } : null;
  const recurringAddons = resolved.addons;

  let charge;
  if (!inPaidPeriod) {
    // Paid periods run from local midnight, so a yearly period ends the day before it renews.
    const periodStart = sub?.state === S.TRIALING && sub.trialEndsAt && new Date(sub.trialEndsAt) > now
      ? sm.startOfDay(sub.trialEndsAt)
      : sm.startOfDay(now);
    const periodEnd = sm.addInterval(periodStart, resolved.interval);
    const lines = buildLines({
      modules: resolved.modules,
      students,
      bundle: bundleInfo,
      coupon: resolved.coupon,
      addons: recurringAddons,
      intervalLabel: periodLabel(periodStart, periodEnd),
      hsnSac: config.sacCode,
    });
    charge = { kind: 'subscription_create', periodStart, periodEnd, dueAt: periodStart > now ? periodStart : sm.addDays(now, config.invoiceDueDays), lines };
  } else {
    const current = await liveItems(tx, sub.id);
    const currentCodes = new Set(current.map((i) => i.moduleCode));
    const addedModules = resolved.modules.filter((m) => !currentCodes.has(m.code));
    const currentAddons = new Set((await liveAddons(tx, sub.id)).map((a) => a.addonCode));
    const addedAddons = recurringAddons.filter((a) => !currentAddons.has(a.code));
    const proration = prorationFactor(now, new Date(sub.currentPeriodStart), new Date(sub.currentPeriodEnd));
    const lines = (addedModules.length || addedAddons.length) ? buildLines({
      modules: addedModules,
      students: billedStudentsFor(sub.declaredStudents, reportedStudents),
      bundle: bundleInfo,
      coupon: resolved.coupon,
      addons: addedAddons,
      proration,
      intervalLabel: periodLabel(now, sub.currentPeriodEnd),
      hsnSac: config.sacCode,
    }) : [];
    charge = lines.length
      ? { kind: 'change', periodStart: now, periodEnd: new Date(sub.currentPeriodEnd), dueAt: sm.addDays(now, config.invoiceDueDays), lines }
      : null;
  }

  // What the school will pay each period from the next renewal.
  const renewalLines = buildLines({
    modules: resolved.modules,
    students,
    bundle: bundleInfo,
    coupon: resolved.coupon && resolved.coupon.duration !== 'once' ? resolved.coupon : null,
    addons: recurringAddons.filter((a) => a.cycle !== 'one_time'),
    hsnSac: config.sacCode,
  });

  return { resolved, students, declared, inPaidPeriod, charge, renewalLines };
}

function presentQuote(account, plan) {
  const now = plan.charge ? quote(account, plan.charge.lines) : null;
  const renewal = plan.renewalLines.length ? quote(account, plan.renewalLines) : null;
  return {
    effective: plan.inPaidPeriod ? 'mid_period' : 'new_period',
    interval: plan.resolved.interval,
    students: plan.students,
    modules: plan.resolved.modules.map((m) => ({ code: m.code, name: m.name, priceId: m.price.id })),
    bundleCode: plan.resolved.bundle?.code || null,
    couponCode: plan.resolved.coupon?.code || null,
    dueNow: now ? {
      reason: plan.charge.kind,
      periodStart: plan.charge.periodStart,
      periodEnd: plan.charge.periodEnd,
      dueAt: plan.charge.dueAt,
      lines: now.lines,
      ...now.totals,
    } : null,
    perPeriod: renewal ? { lines: renewal.lines, ...renewal.totals } : null,
  };
}

async function preview(key, selection, options = {}) {
  const db = getDb();
  const account = await accounts.requireAccount(key, db);
  const sub = await findSubscription(db, account.id);
  const plan = await planChange(db, account, sub, selection, options);
  return presentQuote(account, plan);
}

async function replaceItems(tx, sub, modules, now) {
  await tx.update(s.subscriptionItems).set({ endedAt: now })
    .where(and(eq(s.subscriptionItems.subscriptionId, sub.id), isNull(s.subscriptionItems.endedAt)));
  if (modules.length) {
    await tx.insert(s.subscriptionItems).values(modules.map((m) => ({
      subscriptionId: sub.id, moduleCode: m.code, priceId: m.price.id, startedAt: now,
    })));
  }
}

async function replaceAddons(tx, sub, addonRows, now) {
  await tx.update(s.subscriptionAddons).set({ endedAt: now })
    .where(and(eq(s.subscriptionAddons.subscriptionId, sub.id), isNull(s.subscriptionAddons.endedAt)));
  if (addonRows.length) {
    await tx.insert(s.subscriptionAddons).values(addonRows.map((a) => ({
      subscriptionId: sub.id, addonCode: a.code, quantity: a.quantity, startedAt: now,
      billedAt: a.cycle === 'one_time' ? now : null,
    })));
  }
}

/**
 * Subscribe or change modules. Outside a paid period this replaces the selection and
 * issues a full-period invoice (starting when the trial ends, if still trialing).
 * Inside a paid period, added modules start now and are charged pro rata; removed
 * modules stay until the period ends. Terms (interval, bundle, coupon, students)
 * apply from the next invoice.
 */
async function changeSubscription(actor, key, selection, { reportedStudents = 0, now = new Date() } = {}) {
  return transaction(async (tx) => {
    const account = await accounts.requireAccount(key, tx);
    let sub = await findSubscription(tx, account.id, { lock: true });
    sub = await refreshState(tx, sub, actor, now);
    if (!sub || sub.state === S.CANCELED) {
      [sub] = await tx.insert(s.subscriptions).values({ accountId: account.id, state: S.SUSPENDED_READ_ONLY }).returning();
    }
    const before = { ...sub, items: await liveItems(tx, sub.id), addons: await liveAddons(tx, sub.id) };
    const plan = await planChange(tx, account, sub, selection, { reportedStudents, now });
    if (!plan.resolved.modules.length) throw new HttpError(400, 'Choose at least one module');

    const terms = {
      interval: plan.resolved.interval,
      bundleCode: plan.resolved.bundle?.code || null,
      couponCode: plan.resolved.coupon?.code || null,
      couponCyclesUsed: plan.resolved.coupon?.code === sub.couponCode ? sub.couponCyclesUsed : 0,
      declaredStudents: plan.declared,
      billedStudents: plan.students,
      cancelAtPeriodEnd: false,
      ...(selection.collectionMode ? { collectionMode: selection.collectionMode } : {}),
    };

    let invoice = null;
    if (!plan.inPaidPeriod) {
      await invoices.voidUnpaidInvoices(tx, actor, sub.id, ['subscription_create', 'change', 'renewal'], 'Replaced by a new plan');
      await replaceItems(tx, sub, plan.resolved.modules, now);
      await replaceAddons(tx, sub, plan.resolved.addons, now);
      sub = await updateSubscription(tx, sub, terms);
      if (plan.charge.lines.length) {
        invoice = await invoices.issueInvoice(tx, actor, {
          account, subscription: sub, reason: 'subscription_create', lines: plan.charge.lines,
          periodStart: plan.charge.periodStart, periodEnd: plan.charge.periodEnd, dueAt: plan.charge.dueAt,
          studentsBilled: plan.students, bundleCode: terms.bundleCode, couponCode: terms.couponCode, now,
        });
      }
    } else {
      const wanted = new Map(plan.resolved.modules.map((m) => [m.code, m]));
      const current = await liveItems(tx, sub.id);
      for (const item of current) {
        const keep = wanted.has(item.moduleCode);
        if (item.endsAtPeriodEnd === keep) {
          await tx.update(s.subscriptionItems).set({ endsAtPeriodEnd: !keep }).where(eq(s.subscriptionItems.id, item.id));
        }
        wanted.delete(item.moduleCode);
      }
      if (wanted.size) {
        await tx.insert(s.subscriptionItems).values([...wanted.values()].map((m) => ({
          subscriptionId: sub.id, moduleCode: m.code, priceId: m.price.id, startedAt: now,
        })));
      }
      const wantedAddons = new Map(plan.resolved.addons.map((a) => [a.code, a]));
      for (const row of await liveAddons(tx, sub.id)) {
        const keep = wantedAddons.has(row.addonCode);
        if (row.endsAtPeriodEnd === keep) {
          await tx.update(s.subscriptionAddons).set({ endsAtPeriodEnd: !keep }).where(eq(s.subscriptionAddons.id, row.id));
        }
        wantedAddons.delete(row.addonCode);
      }
      if (wantedAddons.size) {
        await tx.insert(s.subscriptionAddons).values([...wantedAddons.values()].map((a) => ({
          subscriptionId: sub.id, addonCode: a.code, quantity: a.quantity, startedAt: now, billedAt: a.cycle === 'one_time' ? now : null,
        })));
      }
      sub = await updateSubscription(tx, sub, terms);
      if (plan.charge) {
        invoice = await invoices.issueInvoice(tx, actor, {
          account, subscription: sub, reason: 'change', lines: plan.charge.lines,
          periodStart: plan.charge.periodStart, periodEnd: plan.charge.periodEnd, dueAt: plan.charge.dueAt,
          studentsBilled: plan.students, bundleCode: terms.bundleCode, couponCode: terms.couponCode, now,
        });
      }
    }

    const after = { ...sub, items: await liveItems(tx, sub.id), addons: await liveAddons(tx, sub.id) };
    await audit(tx, { actor, entityType: 'subscription', entityId: sub.id, accountId: account.id, action: 'subscription.changed', before, after });
    const [fresh] = await tx.select().from(s.subscriptions).where(eq(s.subscriptions.id, sub.id));
    return { account, subscription: fresh, invoice, quote: presentQuote(account, plan) };
  });
}

/**
 * Renewal invoice for the next period, issued `renewalLeadDays` before the period ends
 * and due when it ends. Students billed = max(declared, live count from the ERP).
 */
async function createRenewalInvoice(actor, subscriptionId, { reportedStudents = null, now = new Date() } = {}) {
  return transaction(async (tx) => {
    const [sub] = await tx.select().from(s.subscriptions).where(eq(s.subscriptions.id, subscriptionId)).for('update');
    if (!sub || sub.state !== S.ACTIVE || sub.cancelAtPeriodEnd || !sub.currentPeriodEnd) return null;
    const periodStart = new Date(sub.currentPeriodEnd);
    if (periodStart - now > config.renewalLeadDays * 86400000) return null;
    const [already] = await tx.select({ id: s.invoices.id }).from(s.invoices).where(and(
      eq(s.invoices.subscriptionId, sub.id), eq(s.invoices.reason, 'renewal'),
      eq(s.invoices.periodStart, periodStart), ne(s.invoices.status, 'void'),
    ));
    if (already) return null;

    const [account] = await tx.select().from(s.accounts).where(eq(s.accounts.id, sub.accountId));
    const keepModules = (await liveItems(tx, sub.id)).filter((i) => !i.endsAtPeriodEnd).map((i) => i.moduleCode);
    const keepAddons = (await liveAddons(tx, sub.id))
      .filter((a) => !a.endsAtPeriodEnd && a.cycle !== 'one_time')
      .map((a) => ({ code: a.addonCode, quantity: a.quantity }));
    if (!keepModules.length && !keepAddons.length) return null;

    let coupon = null;
    if (sub.couponCode) {
      const row = await catalog.getCoupon(sub.couponCode, tx);
      if (row && couponIsUsable(row, { now, cyclesUsed: sub.couponCyclesUsed })) coupon = row;
    }
    const resolved = await resolveSelection(tx, {
      modules: keepModules, bundleCode: sub.bundleCode, interval: sub.interval, addons: keepAddons,
    }, { now: periodStart });
    const students = billedStudentsFor(sub.declaredStudents, reportedStudents);
    const periodEnd = sm.addInterval(periodStart, sub.interval);
    const lines = buildLines({
      modules: resolved.modules, students, bundle: resolved.bundle, coupon, addons: resolved.addons,
      intervalLabel: periodLabel(periodStart, periodEnd), hsnSac: config.sacCode,
    });
    if (!lines.length) return null;

    // Items now point at the price being charged for the new period.
    for (const mod of resolved.modules) {
      await tx.update(s.subscriptionItems).set({ priceId: mod.price.id })
        .where(and(eq(s.subscriptionItems.subscriptionId, sub.id), eq(s.subscriptionItems.moduleCode, mod.code), isNull(s.subscriptionItems.endedAt)));
    }
    if (students !== sub.billedStudents) await updateSubscription(tx, sub, { billedStudents: students });

    return invoices.issueInvoice(tx, actor, {
      account, subscription: sub, reason: 'renewal', lines, periodStart, periodEnd, dueAt: periodStart,
      studentsBilled: students, bundleCode: sub.bundleCode, couponCode: coupon?.code || null, now,
    });
  });
}

async function cancel(actor, key, { immediately = false, now = new Date() } = {}) {
  return transaction(async (tx) => {
    const account = await accounts.requireAccount(key, tx);
    const sub = await findSubscription(tx, account.id, { lock: true });
    if (!sub || sub.state === S.CANCELED) throw new HttpError(409, 'There is no live subscription to cancel');
    const changes = immediately
      ? { state: S.CANCELED, canceledAt: now, cancelAtPeriodEnd: false }
      : { cancelAtPeriodEnd: true };
    const after = await updateSubscription(tx, sub, changes);
    await invoices.voidUnpaidInvoices(tx, actor, sub.id, immediately ? ['subscription_create', 'change', 'renewal'] : ['renewal'], 'Subscription canceled');
    await audit(tx, { actor, entityType: 'subscription', entityId: sub.id, accountId: account.id, action: immediately ? 'subscription.canceled' : 'subscription.cancel_scheduled', before: sub, after });
    return after;
  });
}

async function resume(actor, key) {
  return transaction(async (tx) => {
    const account = await accounts.requireAccount(key, tx);
    const sub = await findSubscription(tx, account.id, { lock: true });
    if (!sub || sub.state === S.CANCELED || !sub.cancelAtPeriodEnd) throw new HttpError(409, 'Nothing to resume');
    const after = await updateSubscription(tx, sub, { cancelAtPeriodEnd: false });
    await audit(tx, { actor, entityType: 'subscription', entityId: sub.id, accountId: account.id, action: 'subscription.cancel_withdrawn', before: sub, after });
    return after;
  });
}

async function grantExtension(actor, key, days, now = new Date()) {
  return transaction(async (tx) => {
    const account = await accounts.requireAccount(key, tx);
    let sub = await findSubscription(tx, account.id, { lock: true });
    sub = await refreshState(tx, sub, actor, now);
    if (!sub) throw new HttpError(404, 'No subscription to extend');
    const after = await updateSubscription(tx, sub, sm.extend(sub, days, now));
    await audit(tx, { actor, entityType: 'subscription', entityId: sub.id, accountId: account.id, action: 'subscription.extended', before: sub, after: { ...after, days } });
    return after;
  });
}

/** Set the declared student count; it is used from the next invoice. */
async function setDeclaredStudents(actor, key, declaredStudents) {
  return transaction(async (tx) => {
    const account = await accounts.requireAccount(key, tx);
    const sub = await findSubscription(tx, account.id, { lock: true });
    if (!sub || sub.state === S.CANCELED) throw new HttpError(409, 'No live subscription');
    const after = await updateSubscription(tx, sub, { declaredStudents });
    await audit(tx, { actor, entityType: 'subscription', entityId: sub.id, accountId: account.id, action: 'subscription.students_declared', before: { declaredStudents: sub.declaredStudents }, after: { declaredStudents } });
    return after;
  });
}

/** What the next renewal would cost with today's prices, for the school's billing page. */
async function estimateRenewal(db, account, sub) {
  if (!sub || sub.state !== S.ACTIVE || sub.cancelAtPeriodEnd || !sub.currentPeriodEnd) return null;
  const modules = (await liveItems(db, sub.id)).filter((i) => !i.endsAtPeriodEnd).map((i) => i.moduleCode);
  const addonList = (await liveAddons(db, sub.id)).filter((a) => !a.endsAtPeriodEnd && a.cycle !== 'one_time')
    .map((a) => ({ code: a.addonCode, quantity: a.quantity }));
  if (!modules.length && !addonList.length) return null;
  try {
    const resolved = await resolveSelection(db, { modules, bundleCode: sub.bundleCode, interval: sub.interval, addons: addonList });
    let coupon = null;
    if (sub.couponCode) {
      const row = await catalog.getCoupon(sub.couponCode, db);
      if (row && couponIsUsable(row, { cyclesUsed: sub.couponCyclesUsed })) coupon = row;
    }
    const periodStart = new Date(sub.currentPeriodEnd);
    const periodEnd = sm.addInterval(periodStart, sub.interval);
    const lines = buildLines({
      modules: resolved.modules, students: sub.billedStudents || sub.declaredStudents, bundle: resolved.bundle, coupon,
      addons: resolved.addons, intervalLabel: periodLabel(periodStart, periodEnd), hsnSac: config.sacCode,
    });
    const { lines: taxed, totals } = quote(account, lines);
    return { periodStart, periodEnd, dueAt: periodStart, lines: taxed, ...totals };
  } catch (error) {
    if (error.statusCode === 400) return null; // a module lost its price; admin will see it
    throw error;
  }
}

async function describeSubscription(tx, sub) {
  if (!sub) return null;
  const [items, addonRows] = await Promise.all([liveItems(tx, sub.id), liveAddons(tx, sub.id)]);
  const names = items.length
    ? await tx.select({ code: s.modules.code, name: s.modules.name }).from(s.modules).where(inArray(s.modules.code, items.map((i) => i.moduleCode)))
    : [];
  const nameOf = new Map(names.map((n) => [n.code, n.name]));
  return {
    ...sub,
    nextDeadline: sm.nextDeadline(sub),
    items: items.map((i) => ({ ...i, name: nameOf.get(i.moduleCode) || i.moduleCode })),
    addons: addonRows,
  };
}

module.exports = {
  findSubscription,
  liveItems,
  liveAddons,
  refreshState,
  onboardTrial,
  grandfather,
  resolveSelection,
  preview,
  changeSubscription,
  createRenewalInvoice,
  cancel,
  resume,
  grantExtension,
  setDeclaredStudents,
  describeSubscription,
  estimateRenewal,
  periodLabel,
};
