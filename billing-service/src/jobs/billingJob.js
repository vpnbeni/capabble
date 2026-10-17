// Hourly billing run: persist state changes, issue renewal invoices, send reminder emails.
// Only one instance runs at a time, coordinated by a lease row in billing.job_leases.
const os = require('os');
const { and, eq, ne, lte, inArray } = require('drizzle-orm');
const { getDb, transaction } = require('../db/client');
const s = require('../db/schema');
const config = require('../config');
const subscriptions = require('../services/subscriptionService');
const invoices = require('../services/invoiceService');
const erp = require('../services/erpClient');
const mailer = require('../services/mailer');
const { rupees } = require('../domain/money');
const { SYSTEM_ACTOR } = require('../services/auditService');

const JOB = 'billing-hourly';
const HOLDER = `${os.hostname()}:${process.pid}`;
const DAY_MS = 86400000;

const isoDay = (value) => new Date(value).toISOString().slice(0, 10);
const dateLabel = (value) => new Intl.DateTimeFormat('en-IN', { timeZone: config.timezone, day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
const appUrl = () => process.env.BILLING_APP_URL || 'https://school.capabble.cloud/#/billing';

async function acquireLease(minutes = 30, now = new Date()) {
  const db = getDb();
  await db.insert(s.jobLeases).values({ name: JOB, lockedUntil: new Date(0) }).onConflictDoNothing();
  const rows = await db.update(s.jobLeases)
    .set({ holder: HOLDER, lockedUntil: new Date(now.getTime() + minutes * 60000) })
    .where(and(eq(s.jobLeases.name, JOB), lte(s.jobLeases.lockedUntil, now)))
    .returning();
  return rows.length > 0;
}

async function releaseLease(result) {
  await getDb().update(s.jobLeases)
    .set({ lockedUntil: new Date(), lastRunAt: new Date(), lastResult: result })
    .where(and(eq(s.jobLeases.name, JOB), eq(s.jobLeases.holder, HOLDER)));
}

async function advanceStates(now) {
  const rows = await getDb().select({ id: s.subscriptions.id }).from(s.subscriptions)
    .where(ne(s.subscriptions.state, 'canceled'));
  let changed = 0;
  for (const { id } of rows) {
    await transaction(async (tx) => {
      const [sub] = await tx.select().from(s.subscriptions).where(eq(s.subscriptions.id, id)).for('update');
      const after = await subscriptions.refreshState(tx, sub, SYSTEM_ACTOR, now);
      if (after.state !== sub.state) changed += 1;
    });
  }
  return changed;
}

async function issueRenewals(now) {
  const horizon = new Date(now.getTime() + config.renewalLeadDays * DAY_MS);
  const due = await getDb().select({ sub: s.subscriptions, slug: s.accounts.tenantSlug })
    .from(s.subscriptions)
    .innerJoin(s.accounts, eq(s.accounts.id, s.subscriptions.accountId))
    .where(and(
      eq(s.subscriptions.state, 'active'),
      eq(s.subscriptions.cancelAtPeriodEnd, false),
      lte(s.subscriptions.currentPeriodEnd, horizon),
    ));
  let issued = 0;
  for (const { sub, slug } of due) {
    const reportedStudents = await erp.getStudentCount(slug);
    const invoice = await subscriptions.createRenewalInvoice(SYSTEM_ACTOR, sub.id, { reportedStudents, now });
    if (invoice) issued += 1;
  }
  return issued;
}

/** Each reminder is recorded before it is sent; the unique key makes it once-only. */
async function remind({ accountId, kind, subjectId, dueOn, to, subject, text }) {
  if (!to) return 'skipped';
  const db = getDb();
  const [row] = await db.insert(s.notifications)
    .values({ accountId, kind, subjectId, dueOn, recipient: to, status: 'sent' })
    .onConflictDoNothing()
    .returning();
  if (!row) return 'duplicate';
  try {
    const status = await mailer.sendMail({ to, subject, text });
    if (status !== 'sent') await db.update(s.notifications).set({ status }).where(eq(s.notifications.id, row.id));
    return status;
  } catch (error) {
    await db.update(s.notifications).set({ status: 'failed', error: String(error.message).slice(0, 500) }).where(eq(s.notifications.id, row.id));
    return 'failed';
  }
}

function invoiceText(account, inv, lead) {
  const due = invoices.outstanding(inv);
  return [
    `Dear ${account.legalName || account.tenantName},`,
    '',
    lead,
    '',
    `Invoice: ${inv.number}`,
    `Amount due: ${rupees(due)}`,
    `Due date: ${dateLabel(inv.dueAt)}`,
    '',
    `Pay online (UPI, card or netbanking) or download the invoice: ${appUrl()}`,
    '',
    'Capabble billing',
  ].join('\n');
}

async function sendReminders(now) {
  const db = getDb();
  const counts = {};
  const tally = (kind, status) => { counts[`${kind}:${status}`] = (counts[`${kind}:${status}`] || 0) + 1; };

  const open = await db.select({ inv: s.invoices, account: s.accounts })
    .from(s.invoices)
    .innerJoin(s.accounts, eq(s.accounts.id, s.invoices.accountId))
    .where(eq(s.invoices.status, 'open'));

  for (const { inv, account } of open) {
    if (invoices.outstanding(inv) === 0) continue;
    const to = account.billingEmail;
    const dueAt = new Date(inv.dueAt);
    const issuedRecently = now - new Date(inv.issuedAt) < 2 * DAY_MS;
    if (issuedRecently) {
      tally('invoice_issued', await remind({
        accountId: account.id, kind: 'invoice_issued', subjectId: inv.id, dueOn: isoDay(inv.issuedAt), to,
        subject: `Capabble invoice ${inv.number}`, text: invoiceText(account, inv, 'A new invoice has been issued for your Capabble subscription.'),
      }));
    }
    const daysToDue = (dueAt - now) / DAY_MS;
    if (daysToDue > 0 && daysToDue <= 3) {
      tally('due_soon', await remind({
        accountId: account.id, kind: 'due_soon', subjectId: inv.id, dueOn: isoDay(dueAt), to,
        subject: `Payment due on ${dateLabel(dueAt)}: ${inv.number}`, text: invoiceText(account, inv, 'This is a reminder that your Capabble invoice is due soon.'),
      }));
    }
    if (daysToDue <= 0) {
      // One overdue reminder on the day it falls due, then one a week.
      const weeksOverdue = Math.floor(-daysToDue / 7);
      tally('overdue', await remind({
        accountId: account.id, kind: 'overdue', subjectId: inv.id, dueOn: isoDay(new Date(dueAt.getTime() + weeksOverdue * 7 * DAY_MS)), to,
        subject: `Overdue: Capabble invoice ${inv.number}`, text: invoiceText(account, inv, 'Your Capabble invoice is overdue. Please pay it to keep full access.'),
      }));
    }
  }

  const subs = await db.select({ sub: s.subscriptions, account: s.accounts })
    .from(s.subscriptions)
    .innerJoin(s.accounts, eq(s.accounts.id, s.subscriptions.accountId))
    .where(inArray(s.subscriptions.state, ['trialing', 'past_due_grace', 'suspended_read_only', 'grandfathered']));

  for (const { sub, account } of subs) {
    const to = account.billingEmail;
    const name = account.legalName || account.tenantName;
    const soon = (date, days) => date && new Date(date) > now && new Date(date) - now <= days * DAY_MS;
    if (sub.state === 'trialing' && soon(sub.trialEndsAt, 3)) {
      tally('trial_ending', await remind({
        accountId: account.id, kind: 'trial_ending', subjectId: sub.id, dueOn: isoDay(sub.trialEndsAt), to,
        subject: 'Your Capabble trial ends soon',
        text: `Dear ${name},\n\nYour free trial ends on ${dateLabel(sub.trialEndsAt)}. Choose the modules you want to keep and pay to continue without interruption: ${appUrl()}\n\nCapabble billing`,
      }));
    }
    if (sub.state === 'grandfathered' && soon(sub.grandfatherEndsAt, 7)) {
      tally('grandfather_ending', await remind({
        accountId: account.id, kind: 'grandfather_ending', subjectId: sub.id, dueOn: isoDay(sub.grandfatherEndsAt), to,
        subject: 'Choose your Capabble plan',
        text: `Dear ${name},\n\nYour complimentary access ends on ${dateLabel(sub.grandfatherEndsAt)}. Choose the modules you want to keep: ${appUrl()}\n\nCapabble billing`,
      }));
    }
    if (sub.state === 'past_due_grace' && soon(sub.graceEndsAt, 1)) {
      tally('grace_ending', await remind({
        accountId: account.id, kind: 'grace_ending', subjectId: sub.id, dueOn: isoDay(sub.graceEndsAt), to,
        subject: 'Capabble access becomes read-only tomorrow',
        text: `Dear ${name},\n\nYour payment is overdue. On ${dateLabel(sub.graceEndsAt)} your school's Capabble access becomes read-only until the invoice is paid: ${appUrl()}\n\nCapabble billing`,
      }));
    }
    if (sub.state === 'suspended_read_only' && sub.graceEndsAt) {
      tally('suspended', await remind({
        accountId: account.id, kind: 'suspended', subjectId: sub.id, dueOn: isoDay(sub.graceEndsAt), to,
        subject: 'Capabble access is now read-only',
        text: `Dear ${name},\n\nYour school's Capabble access is read-only because a payment is overdue. Your data is safe. Pay to restore full access: ${appUrl()}\n\nCapabble billing`,
      }));
    }
  }
  return counts;
}

async function runOnce(now = new Date()) {
  if (!(await acquireLease(30, now))) return { skipped: 'another instance holds the lease' };
  const result = { startedAt: now.toISOString() };
  try {
    result.stateChanges = await advanceStates(now);
    result.renewalsIssued = await issueRenewals(now);
    result.reminders = await sendReminders(now);
    // Renewals or payments may have moved states again.
    result.stateChanges += await advanceStates(now);
    return result;
  } catch (error) {
    result.error = error.message;
    throw error;
  } finally {
    await releaseLease(result).catch(() => {});
  }
}

let timer = null;

function start({ intervalMs = 60 * 60 * 1000, initialDelayMs = 30000 } = {}) {
  if (timer || String(process.env.BILLING_SCHEDULER_ENABLED || 'true') !== 'true') return;
  const tick = () => runOnce().then(
    (r) => console.log('[billing-job]', JSON.stringify(r)),
    (e) => console.error('[billing-job] failed', e.message),
  );
  setTimeout(tick, initialDelayMs).unref();
  timer = setInterval(tick, intervalMs);
  timer.unref();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { runOnce, start, stop, acquireLease, sendReminders, issueRenewals, advanceStates };
