// Online payments: pay-now links, reconciliation, Razorpay webhooks, refunds and auto-debit.
const crypto = require('crypto');
const { and, eq, asc, sql, gt } = require('drizzle-orm');
const { getDb, transaction } = require('../db/client');
const s = require('../db/schema');
const config = require('../config');
const razorpay = require('../providers/razorpay');
const accounts = require('./accountService');
const invoices = require('./invoiceService');
const subscriptions = require('./subscriptionService');
const { audit } = require('./auditService');
const HttpError = require('../utils/httpError');

const PROVIDER_ACTOR = Object.freeze({ type: 'provider', id: 'razorpay' });

const methodOf = (payment) => {
  const m = String(payment?.method || '').toLowerCase();
  return ['upi', 'card', 'netbanking', 'wallet', 'emi'].includes(m) ? m : 'unknown';
};

/** The invoice a school should pay next: the oldest open one with money still due. */
async function nextPayableInvoice(accountId, invoiceId = null, db = getDb()) {
  const rows = await db.select().from(s.invoices)
    .where(and(eq(s.invoices.accountId, accountId), eq(s.invoices.status, 'open'), gt(s.invoices.totalPaise, 0)))
    .orderBy(asc(s.invoices.dueAt));
  const candidates = rows.filter((inv) => invoices.outstanding(inv) > 0);
  if (invoiceId) return candidates.find((inv) => inv.id === invoiceId) || null;
  return candidates[0] || null;
}

/**
 * A Razorpay payment link (UPI, cards, netbanking) for the outstanding amount.
 * An unpaid link for the same amount is reused; a stale one is cancelled first.
 */
async function payNow(tenantSlug, { invoiceId = null, callbackUrl = null } = {}) {
  const account = await accounts.requireAccount(tenantSlug);
  const invoice = await nextPayableInvoice(account.id, invoiceId);
  if (!invoice) throw new HttpError(409, 'There is nothing to pay right now');
  const amountPaise = invoices.outstanding(invoice);

  if (invoice.paymentLinkId) {
    const existing = await razorpay.fetchPaymentLink(invoice.paymentLinkId).catch(() => null);
    if (existing && existing.status === 'created' && Number(existing.amount) === amountPaise) {
      return { invoice, payment: null, paymentLink: { id: existing.id, url: existing.short_url } };
    }
    if (existing && existing.status === 'created') await razorpay.cancelPaymentLink(existing.id).catch(() => {});
    if (existing && existing.status === 'paid') {
      await reconcile(tenantSlug, { invoiceId: invoice.id });
      throw new HttpError(409, 'This invoice has just been paid');
    }
  }

  const suffix = invoice.paymentLinkId ? `-${Date.now().toString(36)}` : '';
  const link = await razorpay.createPaymentLink({
    invoice, account, amountPaise, referenceId: `${invoice.number}${suffix}`, callbackUrl,
  });
  const updated = await transaction(async (tx) => {
    const [row] = await tx.update(s.invoices).set({ paymentLinkId: link.id, paymentLinkUrl: link.short_url })
      .where(eq(s.invoices.id, invoice.id)).returning();
    await audit(tx, { actor: { type: 'system', id: 'pay-now' }, entityType: 'invoice', entityId: invoice.id, accountId: account.id, action: 'invoice.payment_link_created', after: { paymentLinkId: link.id, amountPaise } });
    return row;
  });
  return { invoice: updated, payment: null, paymentLink: { id: link.id, url: link.short_url } };
}

async function applyCapturedPayment(invoiceId, payment, actor = PROVIDER_ACTOR) {
  return transaction((tx) => invoices.recordPayment(tx, actor, {
    invoiceId,
    amountPaise: Number(payment.amount),
    provider: 'razorpay',
    providerPaymentId: payment.id || payment.payment_id,
    providerOrderId: payment.order_id || null,
    method: methodOf(payment),
    reference: payment.acquirer_data?.rrn || payment.acquirer_data?.upi_transaction_id || '',
    capturedAt: payment.created_at ? new Date(Number(payment.created_at) * 1000) : new Date(),
  }));
}

/**
 * After the school returns from Razorpay: ask Razorpay whether the link is paid and record
 * the payment if the webhook hasn't arrived yet. Safe to call any number of times.
 */
async function reconcile(tenantSlug, { invoiceId = null } = {}) {
  const account = await accounts.requireAccount(tenantSlug);
  const rows = await getDb().select().from(s.invoices)
    .where(and(eq(s.invoices.accountId, account.id), sql`${s.invoices.paymentLinkId} IS NOT NULL`, eq(s.invoices.status, 'open')));
  const targets = invoiceId ? rows.filter((r) => r.id === invoiceId) : rows;
  const recorded = [];
  for (const inv of targets) {
    const link = await razorpay.fetchPaymentLink(inv.paymentLinkId);
    for (const p of link.payments || []) {
      if (p.status !== 'captured') continue;
      const result = await applyCapturedPayment(inv.id, { id: p.payment_id, amount: p.amount, method: p.method, created_at: p.created_at });
      if (!result.duplicate) recorded.push(result.payment);
    }
  }
  return { recorded, invoices: await Promise.all(targets.map((r) => invoices.getInvoice(r.id))) };
}

/* ------------------------------------------------------------------ webhooks */

async function findInvoiceForPayment(entity, linkEntity) {
  const db = getDb();
  const invoiceId = linkEntity?.notes?.invoice_id || entity?.notes?.invoice_id;
  if (invoiceId) {
    const [inv] = await db.select().from(s.invoices).where(eq(s.invoices.id, invoiceId));
    if (inv) return inv;
  }
  if (linkEntity?.id) {
    const [inv] = await db.select().from(s.invoices).where(eq(s.invoices.paymentLinkId, linkEntity.id));
    if (inv) return inv;
  }
  return null;
}

async function onPaymentCaptured(payload) {
  const payment = payload.payment?.entity;
  const link = payload.payment_link?.entity || null;
  if (!payment || payment.status !== 'captured') return 'ignored';
  const invoice = await findInvoiceForPayment(payment, link);
  if (!invoice) return 'ignored'; // not one of ours, or payment_link.paid will carry the link
  await applyCapturedPayment(invoice.id, payment);
  return 'processed';
}

async function onPaymentFailed(payload) {
  const payment = payload.payment?.entity;
  if (!payment) return 'ignored';
  const invoice = await findInvoiceForPayment(payment, null);
  if (!invoice) return 'ignored';
  await transaction((tx) => invoices.recordFailedPayment(tx, PROVIDER_ACTOR, {
    invoiceId: invoice.id,
    provider: 'razorpay',
    providerPaymentId: payment.id,
    amountPaise: Number(payment.amount),
    method: methodOf(payment),
    reason: payment.error_description || payment.error_reason || 'payment_failed',
  }));
  return 'processed';
}

async function onRefund(payload, status) {
  const refund = payload.refund?.entity;
  if (!refund) return 'ignored';
  return transaction(async (tx) => {
    const [note] = await tx.select().from(s.creditNotes).where(eq(s.creditNotes.providerRefundId, refund.id));
    if (!note) return 'ignored';
    await tx.update(s.creditNotes).set({ refundStatus: status }).where(eq(s.creditNotes.id, note.id));
    await audit(tx, { actor: PROVIDER_ACTOR, entityType: 'credit_note', entityId: note.id, accountId: note.accountId, action: `credit_note.refund_${status}`, before: { refundStatus: note.refundStatus }, after: { refundStatus: status, refundId: refund.id } });
    return 'processed';
  });
}

async function subscriptionForProvider(providerSubscriptionId) {
  const [sub] = await getDb().select().from(s.subscriptions).where(eq(s.subscriptions.providerSubscriptionId, providerSubscriptionId));
  return sub || null;
}

/** Auto-debit charge: pay the matching open invoice, issuing the renewal first if needed. */
async function onSubscriptionCharged(payload) {
  const rzSub = payload.subscription?.entity;
  const payment = payload.payment?.entity;
  if (!rzSub || !payment) return 'ignored';
  const sub = await subscriptionForProvider(rzSub.id);
  if (!sub) return 'ignored';
  const amount = Number(payment.amount);
  let invoice = (await invoices.openInvoicesFor(sub.id)).find((inv) => invoices.outstanding(inv) === amount);
  if (!invoice) {
    await subscriptions.createRenewalInvoice(PROVIDER_ACTOR, sub.id, { now: new Date(sub.currentPeriodEnd || Date.now()) });
    invoice = (await invoices.openInvoicesFor(sub.id)).find((inv) => invoices.outstanding(inv) === amount);
  }
  if (!invoice) throw new Error(`Auto-debit charge ${payment.id} of ${amount} paise matches no open invoice`);
  await applyCapturedPayment(invoice.id, payment);
  return 'processed';
}

async function onSubscriptionStopped(payload, reason) {
  const rzSub = payload.subscription?.entity;
  if (!rzSub) return 'ignored';
  return transaction(async (tx) => {
    const [sub] = await tx.select().from(s.subscriptions).where(eq(s.subscriptions.providerSubscriptionId, rzSub.id)).for('update');
    if (!sub) return 'ignored';
    const [after] = await tx.update(s.subscriptions)
      .set({ collectionMode: 'manual_link', providerSubscriptionId: null, version: sql`${s.subscriptions.version} + 1` })
      .where(eq(s.subscriptions.id, sub.id)).returning();
    await audit(tx, { actor: PROVIDER_ACTOR, entityType: 'subscription', entityId: sub.id, accountId: sub.accountId, action: `subscription.autodebit_${reason}`, before: { collectionMode: sub.collectionMode, providerSubscriptionId: sub.providerSubscriptionId }, after: { collectionMode: after.collectionMode } });
    return 'processed';
  });
}

const HANDLERS = {
  'payment_link.paid': onPaymentCaptured,
  'payment.captured': onPaymentCaptured,
  'payment.failed': onPaymentFailed,
  'refund.processed': (p) => onRefund(p, 'processed'),
  'refund.failed': (p) => onRefund(p, 'failed'),
  'subscription.charged': onSubscriptionCharged,
  'subscription.halted': (p) => onSubscriptionStopped(p, 'halted'),
  'subscription.cancelled': (p) => onSubscriptionStopped(p, 'cancelled'),
};

/**
 * Store the event once per Razorpay event id, then process it. A retry of a processed
 * event is a no-op; a retry of a failed one runs again. Errors propagate so Razorpay retries.
 */
async function handleWebhook({ rawBody, signature, eventIdHeader }) {
  if (!razorpay.verifySignature(rawBody, signature)) throw new HttpError(401, 'Invalid webhook signature');
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw new HttpError(400, 'Webhook body is not JSON');
  }
  const eventId = eventIdHeader || `sha256:${crypto.createHash('sha256').update(rawBody).digest('hex')}`;
  const eventType = String(event.event || 'unknown');
  const db = getDb();

  const inserted = await db.insert(s.webhookEvents)
    .values({ provider: 'razorpay', eventId, eventType, payload: event, attempts: 1 })
    .onConflictDoNothing()
    .returning();
  let record = inserted[0];
  if (!record) {
    const [existing] = await db.select().from(s.webhookEvents)
      .where(and(eq(s.webhookEvents.provider, 'razorpay'), eq(s.webhookEvents.eventId, eventId)));
    if (existing.status === 'processed' || existing.status === 'ignored') {
      return { duplicate: true, status: existing.status };
    }
    [record] = await db.update(s.webhookEvents)
      .set({ attempts: sql`${s.webhookEvents.attempts} + 1`, status: 'received' })
      .where(eq(s.webhookEvents.id, existing.id)).returning();
  }

  const handler = HANDLERS[eventType];
  try {
    const status = handler ? await handler(event.payload || {}) : 'ignored';
    await db.update(s.webhookEvents).set({ status, processedAt: new Date(), error: '' }).where(eq(s.webhookEvents.id, record.id));
    return { duplicate: false, status };
  } catch (error) {
    await db.update(s.webhookEvents).set({ status: 'failed', error: String(error.message).slice(0, 1000) }).where(eq(s.webhookEvents.id, record.id));
    throw error;
  }
}

/* ------------------------------------------------------------------- refunds */

/** Send a pending refund to Razorpay after the credit note is committed. */
async function sendRefund(creditNoteId, actor) {
  const db = getDb();
  const [note] = await db.select().from(s.creditNotes).where(eq(s.creditNotes.id, creditNoteId));
  if (!note || note.refundStatus !== 'pending' || !note.paymentId || note.providerRefundId) return note;
  const [payment] = await db.select().from(s.payments).where(eq(s.payments.id, note.paymentId));
  if (!payment || payment.provider !== 'razorpay') return note;
  try {
    const refund = await razorpay.refundPayment(payment.providerPaymentId, {
      amountPaise: note.refundPaise, receipt: note.number, notes: { credit_note_id: note.id },
    });
    return transaction(async (tx) => {
      const [after] = await tx.update(s.creditNotes)
        .set({ providerRefundId: refund.id, refundStatus: refund.status === 'processed' ? 'processed' : 'pending' })
        .where(eq(s.creditNotes.id, note.id)).returning();
      await audit(tx, { actor, entityType: 'credit_note', entityId: note.id, accountId: note.accountId, action: 'credit_note.refund_sent', after: { refundId: refund.id, status: refund.status } });
      return after;
    });
  } catch (error) {
    return transaction(async (tx) => {
      // The money never left: give the refundable balance back to the payment.
      await tx.update(s.payments).set({ refundedPaise: sql`${s.payments.refundedPaise} - ${note.refundPaise}` }).where(eq(s.payments.id, payment.id));
      const [after] = await tx.update(s.creditNotes).set({ refundStatus: 'failed' }).where(eq(s.creditNotes.id, note.id)).returning();
      await audit(tx, { actor, entityType: 'credit_note', entityId: note.id, accountId: note.accountId, action: 'credit_note.refund_failed', after: { error: error.message } });
      return after;
    });
  }
}

/* --------------------------------------------------------------- auto-debit */

async function setupAutoDebit(actor, tenantKey) {
  if (!config.autoDebitEnabled) throw new HttpError(403, 'Auto-debit is not enabled');
  const account = await accounts.requireAccount(tenantKey);
  const sub = await subscriptions.findSubscription(getDb(), account.id);
  if (!sub || sub.state !== 'active') throw new HttpError(409, 'Auto-debit can be set up on an active subscription');
  if (sub.providerSubscriptionId) throw new HttpError(409, 'Auto-debit is already set up');
  const estimate = await subscriptions.estimateRenewal(getDb(), account, sub);
  if (!estimate) throw new HttpError(409, 'Nothing to renew yet');
  const rzSub = await razorpay.createAutoDebit({ account, subscription: sub, amountPaise: estimate.totalPaise, interval: sub.interval });
  await transaction(async (tx) => {
    await tx.update(s.subscriptions).set({ providerSubscriptionId: rzSub.id, collectionMode: 'hybrid_auto_manual', version: sql`${s.subscriptions.version} + 1` }).where(eq(s.subscriptions.id, sub.id));
    await audit(tx, { actor, entityType: 'subscription', entityId: sub.id, accountId: account.id, action: 'subscription.autodebit_created', after: { providerSubscriptionId: rzSub.id, amountPaise: estimate.totalPaise } });
  });
  return { authorizeUrl: rzSub.short_url, providerSubscriptionId: rzSub.id };
}

module.exports = {
  payNow,
  reconcile,
  handleWebhook,
  sendRefund,
  setupAutoDebit,
  nextPayableInvoice,
};
