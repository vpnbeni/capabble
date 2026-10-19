// Opt-in trials. The school chooses its modules (or a bundle), agrees to what it will pay when
// the trial ends, authorises autopay when that is required, and only then does the trial start.
// Every module is open during the trial; the choice decides what is billed and what stays on.
const { and, or, eq, ne, isNotNull, isNull, inArray } = require('drizzle-orm');
const { getDb, transaction } = require('../db/client');
const s = require('../db/schema');
const config = require('../config');
const razorpay = require('../providers/razorpay');
const accounts = require('./accountService');
const invoices = require('./invoiceService');
const subscriptions = require('./subscriptionService');
const { audit } = require('./auditService');
const sm = require('../domain/stateMachine');
const { rupees } = require('../domain/money');
const { SUBSCRIPTION_STATES: S } = require('../domain/constants');
const HttpError = require('../utils/httpError');

const PROVIDER_ACTOR = Object.freeze({ type: 'provider', id: 'razorpay' });

// Reminder and pre-debit notice dates shown on the review step and in the emails.
const REMINDER_DAYS_BEFORE = 7;
const NOTICE_DAYS_BEFORE = 1;

const isOptInTrial = (sub) => Boolean(sub && sub.trialConsentAt);

/** The words the school agrees to. Stored on the subscription as given. */
function consentText({ amountPaise, chargeOn, interval, autopay }) {
  const every = interval === 'month' ? 'month' : 'year';
  return autopay
    ? `I authorise Capabble to charge ${rupees(amountPaise)} on ${subscriptions.dateLabel(chargeOn)} and every ${every} after that, until I cancel. I can cancel any time before ${subscriptions.dateLabel(chargeOn)} and pay nothing.`
    : `I understand Capabble will invoice ${rupees(amountPaise)} on ${subscriptions.dateLabel(chargeOn)} and every ${every} after that, until I cancel. I can cancel any time before ${subscriptions.dateLabel(chargeOn)} and pay nothing.`;
}

function timeline(trialEndsAt, now) {
  return {
    startsAt: now,
    reminderOn: sm.addDays(trialEndsAt, -REMINDER_DAYS_BEFORE),
    noticeOn: sm.addDays(trialEndsAt, -NOTICE_DAYS_BEFORE),
    trialEndsAt
  };
}

/**
 * Has this school already used its free trial? A trial counts once it started; trials from
 * before opt-in (no consent recorded) count too. A checkout that never got autopay does not.
 */
async function hadTrial(tx, accountId) {
  const [row] = await tx.select({ id: s.subscriptions.id }).from(s.subscriptions).where(and(
    eq(s.subscriptions.accountId, accountId),
    or(
      isNotNull(s.subscriptions.trialStartedAt),
      and(isNull(s.subscriptions.trialConsentAt), isNotNull(s.subscriptions.trialEndsAt))
    )
  )).limit(1);
  return Boolean(row);
}

/** What a trial with this selection would cost when it ends, and the dates the school will see. */
async function planTrial(tx, account, selection, { reportedStudents = 0, now = new Date(), trialEndsAt = null } = {}) {
  const endsAt = trialEndsAt || sm.addDays(now, config.trialDays);
  const asTrial = { state: S.TRIALING, trialEndsAt: endsAt, couponCyclesUsed: 0 };
  const plan = await subscriptions.planChange(tx, account, asTrial, selection, { reportedStudents, now });
  if (!plan.resolved.modules.length) throw new HttpError(400, 'Choose at least one module');
  const firstCharge = subscriptions.quote(account, plan.charge.lines).totals;
  const autopay = config.trialRequiresMandate && firstCharge.totalPaise > 0;
  return {
    plan,
    autopay,
    firstChargePaise: firstCharge.totalPaise,
    dates: timeline(endsAt, now),
    consent: consentText({ amountPaise: firstCharge.totalPaise, chargeOn: endsAt, interval: plan.resolved.interval, autopay })
  };
}

function presentTrial(account, trial) {
  return {
    trialDays: config.trialDays,
    autopay: trial.autopay,
    firstChargePaise: trial.firstChargePaise,
    ...trial.dates,
    consentText: trial.consent,
    quote: subscriptions.presentQuote(account, trial.plan)
  };
}

async function preview(key, selection, { reportedStudents = 0, now = new Date() } = {}) {
  const db = getDb();
  const account = await accounts.requireAccount(key, db);
  const sub = await subscriptions.findSubscription(db, account.id);
  const trialEndsAt = sub && sub.state === S.TRIALING ? sub.trialEndsAt : null;
  return presentTrial(account, await planTrial(db, account, selection, { reportedStudents, now, trialEndsAt }));
}

/** Store the selection and terms on a trial (or a checkout waiting for autopay). */
async function applySelection(tx, sub, trial, now) {
  const { plan } = trial;
  await subscriptions.replaceItems(tx, sub, plan.resolved.modules, now);
  await subscriptions.replaceAddons(tx, sub, plan.resolved.addons, now);
  return subscriptions.updateSubscription(tx, sub, {
    interval: plan.resolved.interval,
    bundleCode: plan.resolved.bundle?.code || null,
    couponCode: plan.resolved.coupon?.code || null,
    couponCyclesUsed: 0,
    declaredStudents: plan.declared,
    billedStudents: plan.students,
    cancelAtPeriodEnd: false
  });
}

/**
 * Create (or replace) the Razorpay mandate for a trial. The school authorises it now and the
 * first charge is taken when the trial ends. Returns the URL the school authorises on.
 */
async function createMandate(actor, subId, now = new Date()) {
  const db = getDb();
  const [sub] = await db.select().from(s.subscriptions).where(eq(s.subscriptions.id, subId));
  const [account] = await db.select().from(s.accounts).where(eq(s.accounts.id, sub.accountId));
  if (sub.providerSubscriptionId) {
    await razorpay.cancelAutoDebit(sub.providerSubscriptionId).catch((error) => {
      console.warn('[billing] old trial mandate not cancelled', { subscriptionId: sub.id, message: error.message });
    });
  }
  const rzSub = await razorpay.createAutoDebit({
    account,
    subscription: sub,
    amountPaise: sub.autopayAmountPaise,
    interval: sub.interval,
    startAt: sub.trialEndsAt,
    expireBy: sm.addDays(now, sm.INCOMPLETE_TTL_HOURS / 24)
  });
  await transaction(async (tx) => {
    const [fresh] = await tx.select().from(s.subscriptions).where(eq(s.subscriptions.id, sub.id)).for('update');
    await subscriptions.updateSubscription(tx, fresh, { providerSubscriptionId: rzSub.id, collectionMode: 'manual_link' });
    await audit(tx, { actor, entityType: 'subscription', entityId: sub.id, accountId: sub.accountId, action: 'subscription.autodebit_created', after: { providerSubscriptionId: rzSub.id, amountPaise: sub.autopayAmountPaise, startAt: sub.trialEndsAt } });
  });
  return { authorizeUrl: rzSub.short_url, providerSubscriptionId: rzSub.id };
}

/**
 * The school opts in. Without a required mandate the trial starts now; with one, the
 * subscription waits (`incomplete`) until the school authorises autopay.
 */
async function start(actor, key, selection, { reportedStudents = 0, now = new Date() } = {}) {
  const result = await transaction(async (tx) => {
    const account = await accounts.requireAccount(key, tx);
    let sub = await subscriptions.findSubscription(tx, account.id, { lock: true });
    sub = await subscriptions.refreshState(tx, sub, actor, now);
    if (sub && sub.state !== S.CANCELED && sub.state !== S.INCOMPLETE) {
      throw new HttpError(409, sub.state === S.TRIALING ? 'Your trial has already started. Change your plan from Billing.' : 'Your school already has a plan');
    }
    if (await hadTrial(tx, account.id)) throw new HttpError(409, 'Your school has already used its free trial. Choose a plan and pay to carry on.');

    const trial = await planTrial(tx, account, selection, { reportedStudents, now });
    const fields = {
      state: trial.autopay ? S.INCOMPLETE : S.TRIALING,
      trialEndsAt: trial.dates.trialEndsAt,
      trialConsentAt: now,
      trialConsentText: trial.consent,
      trialStartedAt: trial.autopay ? null : now,
      autopayAmountPaise: trial.autopay ? trial.firstChargePaise : null,
      collectionMode: 'manual_link'
    };
    const live = sub && sub.state === S.INCOMPLETE ? sub : null;
    let row = live
      ? await subscriptions.updateSubscription(tx, live, fields)
      : (await tx.insert(s.subscriptions).values({ accountId: account.id, ...fields }).returning())[0];
    row = await applySelection(tx, row, trial, now);
    await audit(tx, {
      actor,
      entityType: 'subscription',
      entityId: row.id,
      accountId: account.id,
      action: trial.autopay ? 'subscription.trial_checkout_started' : 'subscription.trial_started',
      after: { ...row, consent: trial.consent, modules: trial.plan.resolved.modules.map((m) => m.code) }
    });
    return { account, subscription: row, trial };
  });

  const out = { state: result.subscription.state, ...presentTrial(result.account, result.trial) };
  if (result.trial.autopay) {
    Object.assign(out, await createMandate(actor, result.subscription.id, now));
  } else {
    // eslint-disable-next-line global-require -- notices load mail templates; keep them out of the request path's require graph
    await require('./trialNotices').trialStarted(result.subscription.id);
  }
  return out;
}

/** Autopay authorised (webhook or the school coming back): the trial starts, or keeps going. */
async function activate(rzSub, { actor = PROVIDER_ACTOR, now = new Date() } = {}) {
  const outcome = await transaction(async (tx) => {
    const [sub] = await tx.select().from(s.subscriptions).where(eq(s.subscriptions.providerSubscriptionId, rzSub.id)).for('update');
    if (!sub) return null;
    const method = rzSub.payment_method || sub.autopayMethod || null;
    if (sub.state === S.INCOMPLETE) {
      const startAt = rzSub.start_at ? new Date(Number(rzSub.start_at) * 1000) : sub.trialEndsAt;
      const after = await subscriptions.updateSubscription(tx, sub, {
        state: S.TRIALING, trialStartedAt: now, trialEndsAt: startAt, collectionMode: 'auto_debit', autopayMethod: method
      });
      await audit(tx, { actor, entityType: 'subscription', entityId: sub.id, accountId: sub.accountId, action: 'subscription.trial_started', before: { state: sub.state }, after: { state: after.state, trialEndsAt: after.trialEndsAt, autopayMethod: method } });
      return { sub: after, started: true };
    }
    if (sub.collectionMode !== 'auto_debit') {
      const after = await subscriptions.updateSubscription(tx, sub, { collectionMode: 'auto_debit', autopayMethod: method });
      await audit(tx, { actor, entityType: 'subscription', entityId: sub.id, accountId: sub.accountId, action: 'subscription.autodebit_authorised', after: { autopayMethod: method } });
      return { sub: after, started: false };
    }
    return { sub, started: false };
  });
  if (!outcome) return 'ignored';
  if (outcome.started) {
    // eslint-disable-next-line global-require
    await require('./trialNotices').trialStarted(outcome.sub.id);
  }
  return 'processed';
}

/** The school is back from authorising: ask Razorpay rather than wait for the webhook. */
async function reconcile(key, { now = new Date() } = {}) {
  const db = getDb();
  const account = await accounts.requireAccount(key, db);
  const sub = await subscriptions.findSubscription(db, account.id);
  if (sub?.providerSubscriptionId && sub.collectionMode !== 'auto_debit') {
    const rzSub = await razorpay.fetchSubscription(sub.providerSubscriptionId);
    if (['authenticated', 'active'].includes(rzSub.status)) await activate(rzSub, { actor: PROVIDER_ACTOR, now });
  }
  const [fresh] = sub ? await db.select().from(s.subscriptions).where(eq(s.subscriptions.id, sub.id)) : [];
  return { state: fresh?.state || null, autopay: fresh?.collectionMode === 'auto_debit', trialEndsAt: fresh?.trialEndsAt || null };
}

/**
 * Change the plan during an opt-in trial. Nothing is invoiced now. If the first charge
 * changes and autopay is required, the school authorises a new mandate for the new amount.
 */
async function changePlan(actor, key, selection, { reportedStudents = 0, now = new Date() } = {}) {
  const result = await transaction(async (tx) => {
    const account = await accounts.requireAccount(key, tx);
    const sub = await subscriptions.findSubscription(tx, account.id, { lock: true });
    if (!sub || sub.state !== S.TRIALING || !isOptInTrial(sub)) throw new HttpError(409, 'There is no trial to change');
    const trial = await planTrial(tx, account, selection, { reportedStudents, now, trialEndsAt: sub.trialEndsAt });
    const before = { ...sub, items: await subscriptions.liveItems(tx, sub.id) };
    let after = await applySelection(tx, sub, trial, now);
    const needsMandate = trial.autopay && trial.firstChargePaise !== sub.autopayAmountPaise;
    after = await subscriptions.updateSubscription(tx, after, {
      trialConsentAt: now,
      trialConsentText: trial.consent,
      autopayAmountPaise: trial.autopay ? trial.firstChargePaise : null
    });
    // A conversion invoice already issued for the old plan is replaced at the next run.
    await invoices.voidUnpaidInvoices(tx, actor, sub.id, ['subscription_create'], 'Plan changed during the trial');
    await audit(tx, { actor, entityType: 'subscription', entityId: sub.id, accountId: account.id, action: 'subscription.changed', before, after: { ...after, consent: trial.consent } });
    return { account, subscription: after, trial, needsMandate };
  });
  const out = { state: result.subscription.state, ...presentTrial(result.account, result.trial) };
  if (result.needsMandate || (result.trial.autopay && !result.subscription.providerSubscriptionId)) {
    Object.assign(out, await createMandate(actor, result.subscription.id, now));
  }
  return out;
}

/** Cancel a trial: nothing is charged, the mandate is cancelled, access stays until the trial ends. */
async function cancel(actor, key) {
  const after = await subscriptions.cancel(actor, key, { immediately: false });
  if (after.providerSubscriptionId) {
    await razorpay.cancelAutoDebit(after.providerSubscriptionId).catch((error) => {
      console.error('[billing] trial mandate not cancelled', { subscriptionId: after.id, message: error.message });
    });
    await transaction(async (tx) => {
      const [fresh] = await tx.select().from(s.subscriptions).where(eq(s.subscriptions.id, after.id)).for('update');
      await subscriptions.updateSubscription(tx, fresh, { providerSubscriptionId: null, collectionMode: 'manual_link' });
      await audit(tx, { actor, entityType: 'subscription', entityId: after.id, accountId: after.accountId, action: 'subscription.autodebit_cancelled', before: { providerSubscriptionId: after.providerSubscriptionId } });
    });
  }
  // eslint-disable-next-line global-require
  await require('./trialNotices').trialCanceled(after.id);
  return after;
}

/** Withdraw a trial cancellation. Autopay was cancelled with it, so it is set up again. */
async function resume(actor, key, { now = new Date() } = {}) {
  const after = await subscriptions.resume(actor, key);
  if (config.trialRequiresMandate && after.autopayAmountPaise > 0 && !after.providerSubscriptionId
    && after.trialEndsAt && new Date(after.trialEndsAt) > now) {
    return { ...after, ...(await createMandate(actor, after.id, now)) };
  }
  return after;
}

/**
 * The invoice that ends a trial: the first paid period, from the trial end. Issued
 * `renewalLeadDays` before the trial ends, like a renewal, and due when it ends.
 */
async function createConversionInvoice(actor, subscriptionId, { now = new Date() } = {}) {
  return transaction(async (tx) => {
    const [sub] = await tx.select().from(s.subscriptions).where(eq(s.subscriptions.id, subscriptionId)).for('update');
    if (!sub || !isOptInTrial(sub) || sub.cancelAtPeriodEnd || sub.currentPeriodEnd) return null;
    if (![S.TRIALING, S.PAST_DUE_GRACE].includes(sub.state)) return null;
    const [already] = await tx.select({ id: s.invoices.id }).from(s.invoices).where(and(
      eq(s.invoices.subscriptionId, sub.id),
      eq(s.invoices.reason, 'subscription_create'),
      ne(s.invoices.status, 'void')
    ));
    if (already) return null;
    const [account] = await tx.select().from(s.accounts).where(eq(s.accounts.id, sub.accountId));
    const items = await subscriptions.liveItems(tx, sub.id);
    if (!items.length) return null;
    const addons = (await subscriptions.liveAddons(tx, sub.id)).map((a) => ({ code: a.addonCode, quantity: a.quantity }));
    // Students are the number agreed at opt-in, so the charge matches the mandate.
    const trial = await planTrial(tx, account, {
      modules: items.map((i) => i.moduleCode),
      bundleCode: sub.bundleCode,
      interval: sub.interval,
      couponCode: sub.couponCode,
      declaredStudents: sub.billedStudents,
      addons
    }, { reportedStudents: sub.billedStudents, now, trialEndsAt: new Date(sub.trialEndsAt) > now ? sub.trialEndsAt : now });
    const { charge } = trial.plan;
    if (sub.autopayAmountPaise && trial.firstChargePaise !== sub.autopayAmountPaise) {
      await audit(tx, { actor, entityType: 'subscription', entityId: sub.id, accountId: sub.accountId, action: 'subscription.autodebit_amount_mismatch', after: { mandatePaise: sub.autopayAmountPaise, invoicePaise: trial.firstChargePaise } });
    }
    return invoices.issueInvoice(tx, actor, {
      account,
      subscription: sub,
      reason: 'subscription_create',
      lines: charge.lines,
      periodStart: charge.periodStart,
      periodEnd: charge.periodEnd,
      dueAt: charge.dueAt,
      studentsBilled: trial.plan.students,
      bundleCode: sub.bundleCode,
      couponCode: sub.couponCode,
      now
    });
  });
}

/** Opt-in trials ending within the lead time that have no conversion invoice yet. */
async function issueConversionInvoices(actor, now = new Date()) {
  const horizon = sm.addDays(now, config.renewalLeadDays);
  const rows = await getDb().select({ id: s.subscriptions.id, trialEndsAt: s.subscriptions.trialEndsAt })
    .from(s.subscriptions)
    .where(and(
      inArray(s.subscriptions.state, [S.TRIALING, S.PAST_DUE_GRACE]),
      isNotNull(s.subscriptions.trialConsentAt),
      isNull(s.subscriptions.currentPeriodEnd),
      eq(s.subscriptions.cancelAtPeriodEnd, false)
    ));
  let issued = 0;
  for (const row of rows) {
    if (row.trialEndsAt && new Date(row.trialEndsAt) > horizon) continue;
    if (await createConversionInvoice(actor, row.id, { now })) issued += 1;
  }
  return issued;
}

module.exports = {
  REMINDER_DAYS_BEFORE,
  NOTICE_DAYS_BEFORE,
  isOptInTrial,
  preview,
  start,
  activate,
  reconcile,
  changePlan,
  cancel,
  resume,
  createConversionInvoice,
  issueConversionInvoices
};
