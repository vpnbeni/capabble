// Trial emails: the invite to opt in, the confirmation, reminders before the first charge,
// the pre-debit notice, and what happens when the trial converts, fails to charge or is
// cancelled. Every send goes through sendOnce, so a job or webhook running twice sends once.
const { and, eq, ne, isNull } = require('drizzle-orm');
const { getDb } = require('../db/client');
const s = require('../db/schema');
const config = require('../config');
const catalog = require('./catalogService');
const invoices = require('./invoiceService');
const subscriptions = require('./subscriptionService');
const { sendOnce, dateLabel, isoDay, appUrl, methodLabel } = require('./notificationService');
const { rupees } = require('../domain/money');
const sm = require('../domain/stateMachine');
const { SUBSCRIPTION_STATES: S } = require('../domain/constants');
const mailTemplates = require('../../../mail/templates');

const { REMINDER_DAYS_BEFORE, NOTICE_DAYS_BEFORE } = require('./trialService');

const DAY_MS = 86400000;

// The school picks its plan here; links in trial emails point at it.
const getStartedUrl = () => appUrl().replace(/#\/billing.*$/, '#/get-started');

// One line per module for the trial emails, when the catalog has no description.
const BLURBS = {
  stdnt: 'Admissions, profiles and class lists',
  staaf: 'Staff records, leave and documents',
  attnd: 'Daily attendance for every class',
  acdmc: 'Curriculum plans and coverage',
  timetable: 'Clash-free timetables and substitutions',
  actvt: 'Clubs, houses and events',
  mdcl: 'Clinic visits and health records',
  asets: 'What the school owns and where it is',
  libry: 'Issue and return books',
  appnt: 'Parent and visitor meetings',
  cpitl: 'Fees, receipts and expenses',
  trnst: 'Routes, stops and riders',
  exmcl: 'Marks entry and report cards',
  cntr: 'CBSE exam centre, end to end'
};
const moduleCards = (mods) => mods.map((m) => ({ name: m.name, blurb: m.description || BLURBS[m.code] || '' }));
const sellable = async () => (await catalog.listModules()).filter((m) => !m.isCore && m.active);

const MANDATE_METHODS = { card: 'Card', upi: 'UPI AutoPay', emandate: 'Bank mandate (eNACH)', nach: 'Bank mandate (NACH)' };

/** Everything a trial email needs: names, the plan, the amount and the dates. */
async function factsFor(subId, db = getDb()) {
  const [sub] = await db.select().from(s.subscriptions).where(eq(s.subscriptions.id, subId));
  if (!sub) return null;
  const [account] = await db.select().from(s.accounts).where(eq(s.accounts.id, sub.accountId));
  const mods = await sellable();
  const plannedCodes = new Set((await subscriptions.liveItems(db, sub.id)).map((i) => i.moduleCode));
  const planned = mods.filter((m) => plannedCodes.has(m.code));
  const others = mods.filter((m) => !plannedCodes.has(m.code));
  const [conversion] = await db.select().from(s.invoices).where(and(
    eq(s.invoices.subscriptionId, sub.id), eq(s.invoices.reason, 'subscription_create'), ne(s.invoices.status, 'void')
  ));
  const amountPaise = sub.autopayAmountPaise ?? (conversion ? conversion.totalPaise : null);
  return {
    sub,
    account,
    to: account.billingEmail,
    name: account.legalName || account.tenantName,
    url: appUrl(),
    autopay: sub.collectionMode === 'auto_debit',
    amount: amountPaise != null ? rupees(amountPaise) : 'the amount on your plan',
    trialEndsOn: sub.trialEndsAt ? dateLabel(sub.trialEndsAt) : '',
    planned: planned.map((m) => m.name),
    others: others.map((m) => m.name),
    allModules: moduleCards(mods),
    conversion
  };
}

const send = (facts, kind, dueOn, message) => sendOnce({
  accountId: facts.account.id, kind, subjectId: facts.sub.id, dueOn, to: facts.to, message
});

const safely = (label, fn) => fn().catch((error) => {
  console.error(`[billing] ${label} email failed`, { message: error.message });
  return 'failed';
});

/** The trial is on: what's included, the dates, the amount and how to cancel. */
function trialStarted(subId) {
  return safely('trial_started', async () => {
    const f = await factsFor(subId);
    if (!f || !f.sub.trialEndsAt) return 'skipped';
    return send(f, 'trial_started', isoDay(f.sub.trialStartedAt || new Date()), mailTemplates.trialStarted({
      name: f.name,
      url: f.url,
      trialEndsOn: f.trialEndsOn,
      amount: f.amount,
      interval: f.sub.interval,
      planned: f.planned,
      allModules: f.allModules,
      reminderOn: dateLabel(sm.addDays(f.sub.trialEndsAt, -REMINDER_DAYS_BEFORE)),
      noticeOn: dateLabel(sm.addDays(f.sub.trialEndsAt, -NOTICE_DAYS_BEFORE)),
      autopay: f.autopay
    }));
  });
}

function trialCanceled(subId) {
  return safely('trial_canceled', async () => {
    const f = await factsFor(subId);
    if (!f) return 'skipped';
    return send(f, 'trial_canceled', isoDay(new Date()), mailTemplates.trialCanceled({
      name: f.name, url: f.url, trialEndsOn: f.trialEndsOn
    }));
  });
}

/** Invite a school with no plan to choose one and start its trial. */
function trialInvite(accountId, { force = false } = {}) {
  return safely('trial_invite', async () => {
    const db = getDb();
    const [account] = await db.select().from(s.accounts).where(eq(s.accounts.id, accountId));
    if (!account) return 'skipped';
    // An admin's resend goes out the same day; the automatic one goes once per account.
    const dueOn = force ? isoDay(new Date()) : '2000-01-01';
    const status = await sendOnce({
      accountId: account.id,
      kind: 'trial_invite',
      subjectId: account.id,
      dueOn,
      to: account.billingEmail,
      message: mailTemplates.trialInvite({
        name: account.legalName || account.tenantName, url: getStartedUrl(), trialDays: config.trialDays, allModules: moduleCards(await sellable())
      })
    });
    // A failed send must not count as sent, or the invite could never go out.
    if (status === 'failed') {
      await db.delete(s.notifications).where(and(
        eq(s.notifications.accountId, account.id), eq(s.notifications.kind, 'trial_invite'), eq(s.notifications.dueOn, dueOn)
      ));
    }
    return status;
  });
}

const LEGACY_KIND = 'legacy_trial_choose_plan';
// Once per subscription, whenever it runs.
const LEGACY_DUE_ON = '2000-01-01';

/**
 * Schools put on a trial before opt-in (trialing, never agreed to terms): ask them to choose
 * the modules they'll keep. They keep their trial, so the link is Billing, not Get started.
 * Dry run unless apply; returns one row per school with what happened or would happen.
 */
async function inviteLegacyTrials({ apply = false, now = new Date() } = {}) {
  const db = getDb();
  const rows = await db.select({ sub: s.subscriptions, account: s.accounts })
    .from(s.subscriptions)
    .innerJoin(s.accounts, eq(s.accounts.id, s.subscriptions.accountId))
    .where(and(eq(s.subscriptions.state, S.TRIALING), isNull(s.subscriptions.trialConsentAt)));
  const allModules = rows.length ? moduleCards(await sellable()) : [];
  const results = [];

  for (const { sub, account } of rows) {
    const row = {
      tenantSlug: account.tenantSlug,
      to: account.billingEmail,
      trialEndsOn: sub.trialEndsAt ? dateLabel(sub.trialEndsAt) : ''
    };
    const recorded = and(
      eq(s.notifications.accountId, account.id),
      eq(s.notifications.kind, LEGACY_KIND),
      eq(s.notifications.subjectId, sub.id)
    );
    const [already] = await db.select({ id: s.notifications.id }).from(s.notifications).where(recorded);
    if (!sub.trialEndsAt || new Date(sub.trialEndsAt) <= now) row.status = 'trial_over';
    else if (!account.billingEmail) row.status = 'no_email';
    else if (already) row.status = 'already_sent';
    else if (!apply) row.status = 'would_send';
    else {
      row.status = await safely(LEGACY_KIND, () => sendOnce({
        accountId: account.id,
        kind: LEGACY_KIND,
        subjectId: sub.id,
        dueOn: LEGACY_DUE_ON,
        to: account.billingEmail,
        message: mailTemplates.legacyTrialChoosePlan({
          name: account.legalName || account.tenantName,
          url: appUrl(),
          daysLeft: Math.max(1, Math.ceil((new Date(sub.trialEndsAt) - now) / DAY_MS)),
          trialEndsOn: row.trialEndsOn,
          allModules
        })
      }));
      // Not sent (mail not set up, or the send failed): forget it, so a rerun tries again.
      if (row.status === 'failed' || row.status === 'skipped') {
        await db.delete(s.notifications).where(recorded);
      }
    }
    results.push(row);
  }
  return results;
}

/**
 * Hourly: midpoint nudge, 7 and 3 day reminders, the 24h pre-debit notice, the welcome once
 * the first charge is paid, and the failed-charge notice. Only opt-in trials; trials from
 * before opt-in keep the old single reminder in the billing job.
 */
async function sendTrialReminders(now = new Date()) {
  const db = getDb();
  const counts = {};
  const tally = (kind, status) => { counts[`${kind}:${status}`] = (counts[`${kind}:${status}`] || 0) + 1; };
  const subs = await db.select({ id: s.subscriptions.id, sub: s.subscriptions }).from(s.subscriptions)
    .where(ne(s.subscriptions.state, S.CANCELED));

  for (const { id, sub } of subs) {
    if (!sub.trialConsentAt || !sub.trialStartedAt || !sub.trialEndsAt) continue;
    const endsAt = new Date(sub.trialEndsAt);
    const left = (endsAt - now) / DAY_MS;
    const endDay = isoDay(endsAt);

    if (sub.state === S.TRIALING && !sub.cancelAtPeriodEnd) {
      const length = (endsAt - new Date(sub.trialStartedAt)) / DAY_MS;
      const f = await factsFor(id, db);
      if (left > 3 && (now - new Date(sub.trialStartedAt)) / DAY_MS >= length / 2 && length >= 10) {
        tally('trial_midpoint', await send(f, 'trial_midpoint', endDay, mailTemplates.trialMidpoint({
          name: f.name, url: f.url, daysLeft: Math.ceil(left), others: f.others
        })));
      }
      const ending = (kind, days) => send(f, kind, endDay, mailTemplates.trialEnding({
        name: f.name, url: f.url, daysLeft: days, trialEndsOn: f.trialEndsOn, amount: f.amount, planned: f.planned, others: f.others, autopay: f.autopay
      }));
      if (left > 3 && left <= REMINDER_DAYS_BEFORE) tally('trial_ending_7', await ending('trial_ending_7', Math.ceil(left)));
      if (left > NOTICE_DAYS_BEFORE && left <= 3) tally('trial_ending_3', await ending('trial_ending_3', Math.ceil(left)));
      if (f.autopay && left > 0 && left <= NOTICE_DAYS_BEFORE) {
        tally('predebit_notice', await send(f, 'predebit_notice', endDay, mailTemplates.preDebitNotice({
          name: f.name, url: f.url, amount: f.amount, chargeOn: f.trialEndsOn, method: MANDATE_METHODS[sub.autopayMethod] || methodLabel(sub.autopayMethod)
        })));
      }
    }

    // First paid period started from the trial: say what stayed and what closed.
    if (sub.state === S.ACTIVE && sub.currentPeriodStart && new Date(sub.currentPeriodStart) - endsAt < 31 * DAY_MS) {
      const f = await factsFor(id, db);
      tally('trial_converted', await send(f, 'trial_converted', endDay, mailTemplates.trialConverted({
        name: f.name, url: f.url, planned: f.planned, others: f.others
      })));
    }

    // Autopay was authorised but the trial ended without a payment.
    if (sub.state === S.PAST_DUE_GRACE && !sub.currentPeriodEnd && sub.autopayMethod && left <= 0) {
      const f = await factsFor(id, db);
      tally('trial_charge_failed', await send(f, 'trial_charge_failed', endDay, mailTemplates.trialChargeFailed({
        name: f.name,
        url: f.url,
        amount: f.conversion ? rupees(invoices.outstanding(f.conversion)) : f.amount,
        graceEndsOn: sub.graceEndsAt ? dateLabel(sub.graceEndsAt) : ''
      })));
    }
  }
  return counts;
}

module.exports = {
  getStartedUrl, factsFor, trialStarted, trialCanceled, trialInvite, inviteLegacyTrials, sendTrialReminders
};
