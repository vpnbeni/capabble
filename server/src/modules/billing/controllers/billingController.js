// Internal API used by the main server (school app and platform admin). JSON: { success, data, message? }.
const { and, eq, desc, inArray } = require('drizzle-orm');
const { getDb, transaction } = require('../db/client');
const s = require('../db/schema');
const accounts = require('../services/accountService');
const catalog = require('../services/catalogService');
const subscriptions = require('../services/subscriptionService');
const trials = require('../services/trialService');
const trialNotices = require('../services/trialNotices');
const invoices = require('../services/invoiceService');
const notifications = require('../services/notificationService');
const { getEntitlement } = require('../services/entitlementService');
const sm = require('../domain/stateMachine');
const HttpError = require('../utils/httpError');
const pdf = require('../services/pdfService');
const billingJob = require('../jobs/billingJob');

const { schoolKey } = require('./request');

const ok = (res, data, status = 200, message) => res.status(status).json({ success: true, data, ...(message ? { message } : {}) });

/* --------------------------------------------------------------- per school */

async function tenantSummary(key) {
  const db = getDb();
  const account = await accounts.requireAccount(key, db);
  const entitlement = await getEntitlement(account.tenantSlug);
  const sub = await subscriptions.findSubscription(db, account.id);
  const [subscription, openInvoices, upcoming] = await Promise.all([
    subscriptions.describeSubscription(db, sub),
    sub ? invoices.openInvoicesFor(sub.id, db) : [],
    subscriptions.estimateRenewal(db, account, sub)
  ]);
  return {
    account,
    subscription,
    entitlement,
    openInvoices: openInvoices.map((inv) => ({ ...inv, outstandingPaise: invoices.outstanding(inv) })),
    upcomingRenewal: upcoming,
    trial: await trialSummary(account, sub, subscription, openInvoices)
  };
}

/** An opt-in trial's first charge: the mandate amount, the conversion invoice, or today's quote. */
async function trialSummary(account, sub, described, openInvoices) {
  if (!sub || sub.state !== 'trialing' || !trials.isOptInTrial(sub)) return null;
  const conversion = openInvoices.find((inv) => inv.reason === 'subscription_create');
  let firstChargePaise = sub.autopayAmountPaise ?? conversion?.totalPaise ?? null;
  if (firstChargePaise == null && described?.items?.length) {
    try {
      const quote = await trials.preview(account.tenantSlug, {
        modules: described.items.map((i) => i.moduleCode),
        bundleCode: sub.bundleCode,
        interval: sub.interval,
        couponCode: sub.couponCode,
        declaredStudents: sub.billedStudents
      }, { reportedStudents: sub.billedStudents });
      firstChargePaise = quote.firstChargePaise;
    } catch {
      firstChargePaise = null; // a module lost its price; the admin sees it
    }
  }
  return { firstChargePaise, trialEndsAt: sub.trialEndsAt, consentText: sub.trialConsentText };
}

async function getTenantBilling(req, res) {
  ok(res, await tenantSummary(schoolKey(req)));
}

async function listTenantInvoices(req, res) {
  const account = await accounts.requireAccount(schoolKey(req));
  const rows = await invoices.listInvoices(account.id);
  ok(res, rows.map((inv) => ({ ...inv, outstandingPaise: invoices.outstanding(inv) })));
}

async function getTenantInvoice(req, res) {
  const account = await accounts.requireAccount(schoolKey(req));
  const invoice = await invoices.getInvoice(req.params.invoiceId);
  if (!invoice || invoice.accountId !== account.id) throw new HttpError(404, 'Invoice not found');
  ok(res, invoice);
}

async function listTenantPayments(req, res) {
  const account = await accounts.requireAccount(schoolKey(req));
  ok(res, await invoices.listPayments(account.id));
}

async function updateTenantProfile(req, res) {
  ok(res, await accounts.updateProfile(req.actor, schoolKey(req), req.body), 200, 'Billing profile saved');
}

async function getCatalog(_req, res) {
  ok(res, await catalog.publicCatalog());
}

async function previewSubscription(req, res) {
  const { reportedStudents, ...selection } = req.body;
  ok(res, await subscriptions.preview(schoolKey(req), selection, { reportedStudents }));
}

async function currentSub(key) {
  const db = getDb();
  const account = await accounts.requireAccount(key, db);
  return subscriptions.findSubscription(db, account.id);
}

async function subscribe(req, res) {
  const { reportedStudents, ...selection } = req.body;
  // During an opt-in trial a change is only a new plan; nothing is invoiced until it ends.
  const sub = await currentSub(schoolKey(req));
  if (sub && sub.state === 'trialing' && trials.isOptInTrial(sub)) {
    const { collectionMode, ...plan } = selection;
    ok(res, await trials.changePlan(req.actor, schoolKey(req), plan, { reportedStudents }), 200, 'Plan updated');
    return;
  }
  const result = await subscriptions.changeSubscription(req.actor, schoolKey(req), selection, { reportedStudents });
  ok(res, result, 200, result.invoice ? `Invoice ${result.invoice.number} issued` : 'Plan updated');
}

async function cancelSubscription(req, res) {
  const sub = await currentSub(schoolKey(req));
  if (sub && sub.state === 'trialing' && !req.body.immediately) {
    ok(res, await trials.cancel(req.actor, schoolKey(req)), 200, 'Trial cancelled. Nothing will be charged');
    return;
  }
  ok(res, await subscriptions.cancel(req.actor, schoolKey(req), req.body), 200, req.body.immediately ? 'Subscription canceled' : 'Subscription will end at the end of the period');
}

async function resumeSubscription(req, res) {
  const sub = await currentSub(schoolKey(req));
  const result = sub && sub.state === 'trialing'
    ? await trials.resume(req.actor, schoolKey(req))
    : await subscriptions.resume(req.actor, schoolKey(req));
  ok(res, result, 200, 'Cancellation withdrawn');
}

/* ------------------------------------------------------------- opt-in trial */

async function previewTrial(req, res) {
  const { reportedStudents, consent, ...selection } = req.body;
  ok(res, await trials.preview(schoolKey(req), selection, { reportedStudents }));
}

async function startTrial(req, res) {
  const { reportedStudents, consent, collectionMode, ...selection } = req.body;
  const result = await trials.start(req.actor, schoolKey(req), selection, { reportedStudents });
  ok(res, result, 201, result.authorizeUrl ? 'Authorise autopay to start your trial' : 'Your free trial has started');
}

async function reconcileTrial(req, res) {
  ok(res, await trials.reconcile(schoolKey(req)));
}

/** Platform admin: email the school an invite to choose its plan and start its trial. */
async function sendTrialInvite(req, res) {
  const account = await accounts.requireAccount(schoolKey(req));
  const status = await trialNotices.trialInvite(account.id, { force: true });
  if (status === 'skipped') throw new HttpError(409, 'This school has no billing email, or email is not set up on the server');
  if (status === 'failed') throw new HttpError(502, "The invite couldn't be emailed. Try again in a few minutes");
  ok(res, { status }, 200, status === 'duplicate' ? 'An invite was already sent today' : 'Trial invite sent');
}

/** Platform admin: start a trial without autopay (e.g. a school that pays by bank transfer). */
async function startTrialWithoutAutopay(req, res) {
  const account = await accounts.requireAccount(schoolKey(req));
  const result = await subscriptions.onboardTrial(req.actor, {
    tenantId: account.tenantId,
    tenantSlug: account.tenantSlug,
    tenantName: account.tenantName,
    trialDays: req.body.days,
    reason: req.body.reason
  });
  if (!result.created) throw new HttpError(409, 'This school already has a live subscription');
  ok(res, result.subscription, 201, 'Trial started');
}

/* --------------------------------------------------------------------- PDFs */

async function invoicePdf(req, res) {
  const account = await accounts.requireAccount(schoolKey(req));
  const invoice = await invoices.getInvoice(req.params.invoiceId);
  if (!invoice || invoice.accountId !== account.id) throw new HttpError(404, 'Invoice not found');
  pdf.renderInvoice(res, invoice);
}

async function receiptPdf(req, res) {
  const account = await accounts.requireAccount(schoolKey(req));
  const [payment] = await getDb().select().from(s.payments).where(and(eq(s.payments.id, req.params.paymentId), eq(s.payments.accountId, account.id)));
  if (!payment || !payment.receiptNumber) throw new HttpError(404, 'Receipt not found');
  const invoice = await invoices.getInvoice(payment.invoiceId);
  pdf.renderReceipt(res, { payment, invoice });
}

async function creditNotePdf(req, res) {
  const account = await accounts.requireAccount(schoolKey(req));
  const [note] = await getDb().select().from(s.creditNotes).where(and(eq(s.creditNotes.id, req.params.creditNoteId), eq(s.creditNotes.accountId, account.id)));
  if (!note) throw new HttpError(404, 'Credit note not found');
  const invoice = await invoices.getInvoice(note.invoiceId);
  pdf.renderCreditNote(res, { note, invoice });
}

async function listTenantCreditNotes(req, res) {
  const account = await accounts.requireAccount(schoolKey(req));
  ok(res, await invoices.listCreditNotes(account.id));
}

async function runJobs(_req, res) {
  ok(res, await billingJob.runOnce());
}

/* -------------------------------------------------------------------- admin */

async function listBillingTenants(req, res) {
  const db = getDb();
  const page = await accounts.listAccounts(req.query, db);
  const ids = page.items.map((a) => a.id);
  const subs = ids.length
    ? await db.select().from(s.subscriptions).where(inArray(s.subscriptions.accountId, ids)).orderBy(desc(s.subscriptions.createdAt))
    : [];
  const latest = new Map();
  for (const sub of subs) {
    const prev = latest.get(sub.accountId);
    if (!prev || (prev.state === 'canceled' && sub.state !== 'canceled')) latest.set(sub.accountId, sub);
  }
  const items = page.items.map((account) => {
    const sub = latest.get(account.id) || null;
    const state = sub ? sm.normalizeState(sub.state) : null;
    return {
      account,
      subscription: sub,
      entitlement: sub ? { state, accessMode: sm.accessModeFor(state), nextDeadline: sm.nextDeadline(sub) } : null
    };
  });
  ok(res, { ...page, items });
}

async function getBillingTenantById(req, res) {
  const summary = await tenantSummary(schoolKey(req));
  const [invoiceRows, paymentRows, creditNotes] = await Promise.all([
    invoices.listInvoices(summary.account.id, { limit: 50 }),
    invoices.listPayments(summary.account.id, { limit: 50 }),
    invoices.listCreditNotes(summary.account.id)
  ]);
  ok(res, {
    ...summary,
    invoices: invoiceRows.map((inv) => ({ ...inv, outstandingPaise: invoices.outstanding(inv) })),
    payments: paymentRows,
    creditNotes
  });
}

async function changeTenantPlan(req, res) {
  const { reportedStudents, ...selection } = req.body;
  const result = await subscriptions.changeSubscription(req.actor, schoolKey(req), selection, { reportedStudents });
  ok(res, result, 200, result.invoice ? `Invoice ${result.invoice.number} issued` : 'Plan updated');
}

async function previewTenantPlan(req, res) {
  const { reportedStudents, ...selection } = req.body;
  ok(res, await subscriptions.preview(schoolKey(req), selection, { reportedStudents }));
}

async function grantTenantExtension(req, res) {
  const subscription = await subscriptions.grantExtension(req.actor, schoolKey(req), req.body.days);
  const account = await accounts.requireAccount(schoolKey(req));
  ok(res, { subscription, entitlement: await getEntitlement(account.tenantSlug) }, 200, `Extended by ${req.body.days} ${req.body.days === 1 ? 'day' : 'days'}`);
}

async function setTenantStudents(req, res) {
  ok(res, await subscriptions.setDeclaredStudents(req.actor, schoolKey(req), req.body.declaredStudents), 200, 'Student count saved');
}

async function cancelTenant(req, res) {
  ok(res, await subscriptions.cancel(req.actor, schoolKey(req), req.body));
}

async function updateTenantProfileAdmin(req, res) {
  ok(res, await accounts.updateProfile(req.actor, schoolKey(req), req.body), 200, 'Billing profile saved');
}

async function requireInvoiceOfTenant(tenantKey, invoiceId) {
  const account = await accounts.requireAccount(tenantKey);
  const [invoice] = await getDb().select().from(s.invoices).where(and(eq(s.invoices.id, invoiceId), eq(s.invoices.accountId, account.id)));
  if (!invoice) throw new HttpError(404, 'Invoice not found');
  return { account, invoice };
}

async function recordOfflinePayment(req, res) {
  await requireInvoiceOfTenant(schoolKey(req), req.params.invoiceId);
  const result = await invoices.recordOfflinePayment(req.actor, req.params.invoiceId, req.body);
  await notifications.notifyPaymentReceivedSafely(result.payment.id);
  ok(res, result, 201, `Receipt ${result.payment.receiptNumber} recorded`);
}

async function voidInvoice(req, res) {
  await requireInvoiceOfTenant(schoolKey(req), req.params.invoiceId);
  const invoice = await transaction((tx) => invoices.voidInvoice(tx, req.actor, req.params.invoiceId, req.body.reason));
  ok(res, invoice, 200, `Invoice ${invoice.number} voided`);
}

async function listAudit(req, res) {
  const { accountId, entityType, entityId, limit } = req.query;
  const where = [];
  if (accountId) where.push(eq(s.auditLog.accountId, accountId));
  if (entityType) where.push(eq(s.auditLog.entityType, entityType));
  if (entityId) where.push(eq(s.auditLog.entityId, entityId));
  const rows = await getDb().select().from(s.auditLog)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(s.auditLog.id)).limit(limit);
  ok(res, rows);
}

/* ------------------------------------------------------------ admin catalog */

async function getAdminCatalog(_req, res) {
  const [modules, bundles, addons, coupons] = await Promise.all([
    catalog.listModules({ includeInactive: true }),
    catalog.listBundles({ includeInactive: true }),
    catalog.listAddons({ includeInactive: true }),
    catalog.listCoupons()
  ]);
  ok(res, { modules, bundles, addons, coupons });
}

async function upsertModule(req, res) {
  ok(res, await catalog.upsertModule(req.actor, req.body), 200, 'Module saved');
}

async function setModulePrice(req, res) {
  ok(res, await catalog.setModulePrice(req.actor, { ...req.body, moduleCode: req.params.code }), 201, 'New price saved');
}

async function priceHistory(req, res) {
  ok(res, await catalog.priceHistory(req.params.code));
}

async function upsertBundle(req, res) {
  ok(res, await catalog.upsertBundle(req.actor, req.body), 200, 'Bundle saved');
}

async function upsertAddon(req, res) {
  ok(res, await catalog.upsertAddon(req.actor, req.body), 200, 'Add-on saved');
}

async function upsertCoupon(req, res) {
  ok(res, await catalog.upsertCoupon(req.actor, req.body), 200, 'Coupon saved');
}

module.exports = {
  tenantSummary,
  invoicePdf,
  receiptPdf,
  creditNotePdf,
  listTenantCreditNotes,
  runJobs,
  getTenantBilling,
  listTenantInvoices,
  getTenantInvoice,
  listTenantPayments,
  updateTenantProfile,
  getCatalog,
  previewSubscription,
  previewTrial,
  startTrial,
  reconcileTrial,
  sendTrialInvite,
  startTrialWithoutAutopay,
  subscribe,
  cancelSubscription,
  resumeSubscription,
  listBillingTenants,
  getBillingTenantById,
  changeTenantPlan,
  previewTenantPlan,
  grantTenantExtension,
  setTenantStudents,
  cancelTenant,
  updateTenantProfileAdmin,
  recordOfflinePayment,
  voidInvoice,
  listAudit,
  getAdminCatalog,
  upsertModule,
  setModulePrice,
  priceHistory,
  upsertBundle,
  upsertAddon,
  upsertCoupon,
  requireInvoiceOfTenant
};
