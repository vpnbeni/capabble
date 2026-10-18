// Invoices, payments, receipts and credit notes. Every write runs inside the caller's
// transaction (or opens one), so a document and its effects land together or not at all.
const { and, eq, desc, asc, inArray, ne, sql } = require('drizzle-orm');
const { getDb, transaction } = require('../db/client');
const s = require('../db/schema');
const config = require('../config');
const { audit } = require('./auditService');
const { applyGst, placeOfSupply } = require('../domain/gst');
const { allocateNumber } = require('../domain/numbering');
const { addDays, onInvoicePaid } = require('../domain/stateMachine');
const { SUBSCRIPTION_STATES: S, NUMBER_SERIES } = require('../domain/constants');
const HttpError = require('../utils/httpError');

function buyerSnapshot(account) {
  return {
    tenantName: account.tenantName,
    legalName: account.legalName || account.tenantName,
    gstin: account.gstin || null,
    addressLine1: account.addressLine1,
    addressLine2: account.addressLine2,
    city: account.city,
    postalCode: account.postalCode,
    stateCode: account.stateCode || null,
    country: account.country,
    email: account.billingEmail
  };
}

const outstanding = (invoice) => Math.max(0, invoice.totalPaise - invoice.amountPaidPaise - invoice.amountCreditedPaise);

/**
 * Tax the pre-tax lines, take the next invoice number and store the invoice with
 * its lines. A zero-total invoice (e.g. a 100% coupon) is settled at once.
 */
async function issueInvoice(tx, actor, {
  account,
  subscription = null,
  reason,
  lines,
  periodStart = null,
  periodEnd = null,
  dueAt = null,
  studentsBilled = 0,
  bundleCode = null,
  couponCode = null,
  notes = '',
  now = new Date()
}) {
  if (!lines.length) throw new HttpError(400, 'Nothing to invoice');
  const { supplier } = config;
  const pos = placeOfSupply({ buyerGstin: account.gstin, buyerStateCode: account.stateCode, supplierStateCode: supplier.stateCode });
  const { lines: taxed, totals } = applyGst(lines, { supplierStateCode: supplier.stateCode, placeOfSupply: pos });
  const { number, financialYear } = await allocateNumber(tx, NUMBER_SERIES.INVOICE, now);

  const [invoice] = await tx.insert(s.invoices).values({
    number,
    financialYear,
    accountId: account.id,
    subscriptionId: subscription?.id || null,
    reason,
    status: 'open',
    currency: config.currency,
    periodStart,
    periodEnd,
    issuedAt: now,
    dueAt: dueAt || addDays(now, config.invoiceDueDays),
    studentsBilled,
    bundleCode,
    couponCode,
    supplier,
    buyer: buyerSnapshot(account),
    placeOfSupply: pos,
    ...totals,
    notes
  }).returning();

  await tx.insert(s.invoiceLines).values(taxed.map((line) => ({
    invoiceId: invoice.id,
    position: line.position,
    kind: line.kind,
    moduleCode: line.moduleCode || null,
    addonCode: line.addonCode || null,
    description: line.description,
    hsnSac: line.hsnSac || config.sacCode,
    quantity: line.quantity,
    unitPaise: line.unitPaise,
    amountPaise: line.amountPaise,
    discountPaise: line.discountPaise,
    taxablePaise: line.taxablePaise,
    taxRateBps: line.taxRateBps,
    cgstPaise: line.cgstPaise,
    sgstPaise: line.sgstPaise,
    igstPaise: line.igstPaise
  })));

  await audit(tx, { actor, entityType: 'invoice', entityId: invoice.id, accountId: account.id, action: 'invoice.issued', after: { ...invoice, lines: taxed } });

  if (invoice.totalPaise === 0) {
    return settleInvoice(tx, actor, invoice, { now });
  }
  return invoice;
}

/** Effects of an invoice becoming fully paid: subscription state, ended items, coupon use. */
async function applyPaidEffects(tx, actor, invoice, now) {
  if (!invoice.subscriptionId) return;
  const [sub] = await tx.select().from(s.subscriptions).where(eq(s.subscriptions.id, invoice.subscriptionId)).for('update');
  if (!sub || sub.state === S.CANCELED) return;

  let changes = {};
  if (invoice.reason === 'subscription_create' || invoice.reason === 'renewal') {
    changes = onInvoicePaid(sub, invoice);
  } else if (sub.state === S.PAST_DUE_GRACE || sub.state === S.SUSPENDED_READ_ONLY) {
    const [{ unpaid }] = await tx.select({ unpaid: sql`count(*)::int` }).from(s.invoices)
      .where(and(eq(s.invoices.subscriptionId, sub.id), eq(s.invoices.status, 'open'), ne(s.invoices.id, invoice.id)));
    const periodRunning = sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) > now;
    if (!unpaid && periodRunning) changes = { state: S.ACTIVE, graceEndsAt: null };
  }

  if (invoice.reason === 'renewal') {
    // Removals scheduled for the end of the old period take effect now.
    await tx.update(s.subscriptionItems).set({ endedAt: invoice.periodStart })
      .where(and(eq(s.subscriptionItems.subscriptionId, sub.id), eq(s.subscriptionItems.endsAtPeriodEnd, true), sql`${s.subscriptionItems.endedAt} IS NULL`));
    await tx.update(s.subscriptionAddons).set({ endedAt: invoice.periodStart })
      .where(and(eq(s.subscriptionAddons.subscriptionId, sub.id), eq(s.subscriptionAddons.endsAtPeriodEnd, true), sql`${s.subscriptionAddons.endedAt} IS NULL`));
  }

  if (invoice.couponCode && invoice.discountPaise > 0) {
    changes.couponCyclesUsed = sub.couponCyclesUsed + 1;
    const inserted = await tx.insert(s.couponRedemptions)
      .values({ couponCode: invoice.couponCode, accountId: invoice.accountId, subscriptionId: sub.id })
      .onConflictDoNothing()
      .returning();
    if (inserted.length) {
      await tx.update(s.coupons).set({ redeemedCount: sql`${s.coupons.redeemedCount} + 1` }).where(eq(s.coupons.code, invoice.couponCode));
    }
  }

  if (Object.keys(changes).length) {
    const [after] = await tx.update(s.subscriptions)
      .set({ ...changes, version: sql`${s.subscriptions.version} + 1` })
      .where(eq(s.subscriptions.id, sub.id))
      .returning();
    if (after.state !== sub.state) {
      await audit(tx, { actor, entityType: 'subscription', entityId: sub.id, accountId: sub.accountId, action: 'subscription.state_changed', before: { state: sub.state, currentPeriodEnd: sub.currentPeriodEnd }, after: { state: after.state, currentPeriodEnd: after.currentPeriodEnd, reason: `invoice_paid:${invoice.number}` } });
    }
  }
}

async function settleInvoice(tx, actor, invoice, { now = new Date() } = {}) {
  const [paid] = await tx.update(s.invoices).set({ status: 'paid', paidAt: now }).where(eq(s.invoices.id, invoice.id)).returning();
  await audit(tx, { actor, entityType: 'invoice', entityId: invoice.id, accountId: invoice.accountId, action: 'invoice.paid', before: { status: invoice.status }, after: { status: 'paid', paidAt: now } });
  await applyPaidEffects(tx, actor, paid, now);
  return paid;
}

async function lockInvoice(tx, invoiceId) {
  const [invoice] = await tx.select().from(s.invoices).where(eq(s.invoices.id, invoiceId)).for('update');
  if (!invoice) throw new HttpError(404, 'Invoice not found');
  return invoice;
}

/**
 * Record a captured payment against an invoice. Idempotent per provider payment id:
 * the invoice row is locked first, so a retried webhook sees the earlier payment.
 */
async function recordPayment(tx, actor, {
  invoiceId,
  amountPaise,
  provider,
  providerPaymentId = null,
  providerOrderId = null,
  method = 'unknown',
  reference = '',
  capturedAt = new Date(),
  recordedBy = null
}) {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) throw new HttpError(400, 'Payment amount must be a positive number of paise');
  const invoice = await lockInvoice(tx, invoiceId);

  let existing = null;
  if (providerPaymentId) {
    [existing] = await tx.select().from(s.payments)
      .where(and(eq(s.payments.provider, provider), eq(s.payments.providerPaymentId, providerPaymentId)));
    if (existing && (existing.status === 'captured' || existing.status === 'refunded')) {
      return { payment: existing, invoice, duplicate: true };
    }
  }
  if (invoice.status === 'void') throw new HttpError(409, `Invoice ${invoice.number} is void`);

  const receipt = await allocateNumber(tx, NUMBER_SERIES.RECEIPT, capturedAt);
  const values = {
    accountId: invoice.accountId,
    invoiceId: invoice.id,
    provider,
    providerPaymentId,
    providerOrderId,
    method,
    status: 'captured',
    amountPaise,
    reference,
    failureReason: '',
    receiptNumber: receipt.number,
    capturedAt,
    recordedBy
  };
  // An earlier failed attempt with the same id that later succeeds is updated in place.
  const [payment] = existing
    ? await tx.update(s.payments).set(values).where(eq(s.payments.id, existing.id)).returning()
    : await tx.insert(s.payments).values(values).returning();
  await audit(tx, { actor, entityType: 'payment', entityId: payment.id, accountId: invoice.accountId, action: 'payment.recorded', before: existing, after: payment });

  const amountPaid = invoice.amountPaidPaise + amountPaise;
  let [updated] = await tx.update(s.invoices).set({ amountPaidPaise: amountPaid }).where(eq(s.invoices.id, invoice.id)).returning();
  if (updated.status === 'open' && outstanding(updated) === 0) {
    updated = await settleInvoice(tx, actor, updated, { now: capturedAt });
  }
  return { payment, invoice: updated, duplicate: false };
}

async function recordFailedPayment(tx, actor, { invoiceId, provider, providerPaymentId, amountPaise, method = 'unknown', reason = '' }) {
  const invoice = await lockInvoice(tx, invoiceId);
  const inserted = await tx.insert(s.payments).values({
    accountId: invoice.accountId,
    invoiceId,
    provider,
    providerPaymentId,
    method,
    status: 'failed',
    amountPaise: Math.max(1, amountPaise || invoice.totalPaise),
    failureReason: String(reason).slice(0, 500)
  }).onConflictDoNothing().returning();
  if (inserted.length) {
    await audit(tx, { actor, entityType: 'payment', entityId: inserted[0].id, accountId: invoice.accountId, action: 'payment.failed', after: inserted[0] });
  }
  return inserted[0] || null;
}

async function recordOfflinePayment(actor, invoiceId, { amountPaise, method, reference = '', receivedAt }) {
  return transaction(async (tx) => {
    const invoice = await lockInvoice(tx, invoiceId);
    const due = outstanding(invoice);
    if (invoice.status !== 'open' || due === 0) throw new HttpError(409, `Invoice ${invoice.number} has nothing left to pay`);
    if (amountPaise > due) throw new HttpError(400, `Amount is more than the ${due} paise still due`);
    return recordPayment(tx, actor, {
      invoiceId,
      amountPaise,
      provider: 'offline',
      method,
      reference,
      capturedAt: receivedAt ? new Date(receivedAt) : new Date(),
      recordedBy: actor?.id ? String(actor.id) : null
    });
  });
}

async function voidInvoice(tx, actor, invoiceId, reason = '') {
  const invoice = await lockInvoice(tx, invoiceId);
  if (invoice.status !== 'open') throw new HttpError(409, `Only open invoices can be voided (this one is ${invoice.status})`);
  if (invoice.amountPaidPaise > 0) throw new HttpError(409, 'This invoice has payments; issue a credit note instead');
  const [voided] = await tx.update(s.invoices).set({ status: 'void', voidedAt: new Date(), notes: reason ? `${invoice.notes}\nVoided: ${reason}`.trim() : invoice.notes })
    .where(eq(s.invoices.id, invoiceId)).returning();
  await audit(tx, { actor, entityType: 'invoice', entityId: invoiceId, accountId: invoice.accountId, action: 'invoice.voided', before: { status: invoice.status }, after: { status: 'void', reason } });
  return voided;
}

/** Split a gross credit into taxable value and tax in the same proportion as the invoice. */
function splitCredit(invoice, totalPaise) {
  const tax = invoice.cgstPaise + invoice.sgstPaise + invoice.igstPaise;
  const taxable = invoice.totalPaise === 0 ? totalPaise : Math.round((totalPaise * invoice.taxablePaise) / invoice.totalPaise);
  const creditTax = Math.min(tax, totalPaise - taxable);
  if (invoice.igstPaise > 0) return { taxablePaise: totalPaise - creditTax, cgstPaise: 0, sgstPaise: 0, igstPaise: creditTax };
  const cgst = Math.floor(creditTax / 2);
  return { taxablePaise: totalPaise - creditTax, cgstPaise: cgst, sgstPaise: creditTax - cgst, igstPaise: 0 };
}

/**
 * Issue a credit note for part or all of an invoice. A refund amount (up to what was
 * paid and not yet refunded) is recorded as pending; the provider call happens after commit.
 */
async function createCreditNote(tx, actor, invoiceId, { amountPaise, reason, refundPaise = 0, now = new Date() }) {
  const invoice = await lockInvoice(tx, invoiceId);
  if (invoice.status === 'void' || invoice.status === 'draft') throw new HttpError(409, `Cannot credit a ${invoice.status} invoice`);
  const creditable = invoice.totalPaise - invoice.amountCreditedPaise;
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0 || amountPaise > creditable) {
    throw new HttpError(400, `Credit must be between 1 and ${creditable} paise`);
  }
  if (refundPaise > amountPaise) throw new HttpError(400, 'Refund cannot exceed the credit');

  let payment = null;
  if (refundPaise > 0) {
    const candidates = await tx.select().from(s.payments)
      .where(and(eq(s.payments.invoiceId, invoiceId), eq(s.payments.status, 'captured')))
      .orderBy(desc(s.payments.amountPaise));
    payment = candidates.find((p) => p.amountPaise - p.refundedPaise >= refundPaise) || null;
    if (!payment) throw new HttpError(400, 'No single payment on this invoice can cover that refund');
    await tx.update(s.payments).set({ refundedPaise: payment.refundedPaise + refundPaise }).where(eq(s.payments.id, payment.id));
  }

  const { number, financialYear } = await allocateNumber(tx, NUMBER_SERIES.CREDIT_NOTE, now);
  const [note] = await tx.insert(s.creditNotes).values({
    number,
    financialYear,
    invoiceId,
    accountId: invoice.accountId,
    paymentId: payment?.id || null,
    reason,
    issuedAt: now,
    ...splitCredit(invoice, amountPaise),
    totalPaise: amountPaise,
    refundPaise,
    refundStatus: refundPaise > 0 ? (payment.provider === 'offline' ? 'processed' : 'pending') : 'none',
    createdBy: actor?.id ? String(actor.id) : null
  }).returning();

  let [updated] = await tx.update(s.invoices).set({ amountCreditedPaise: invoice.amountCreditedPaise + amountPaise })
    .where(eq(s.invoices.id, invoiceId)).returning();
  await audit(tx, { actor, entityType: 'credit_note', entityId: note.id, accountId: invoice.accountId, action: 'credit_note.issued', after: note });
  // Crediting the whole unpaid balance settles the invoice.
  if (updated.status === 'open' && outstanding(updated) === 0) {
    updated = await settleInvoice(tx, actor, updated, { now });
  }
  return { creditNote: note, invoice: updated, payment };
}

async function listInvoices(accountId, { limit = 100 } = {}, db = getDb()) {
  return db.select().from(s.invoices)
    .where(and(eq(s.invoices.accountId, accountId), ne(s.invoices.status, 'draft')))
    .orderBy(desc(s.invoices.createdAt))
    .limit(limit);
}

async function getInvoice(invoiceId, db = getDb()) {
  const [invoice] = await db.select().from(s.invoices).where(eq(s.invoices.id, invoiceId));
  if (!invoice) return null;
  const [lines, paymentsRows, notes] = await Promise.all([
    db.select().from(s.invoiceLines).where(eq(s.invoiceLines.invoiceId, invoiceId)).orderBy(asc(s.invoiceLines.position)),
    db.select().from(s.payments).where(eq(s.payments.invoiceId, invoiceId)).orderBy(asc(s.payments.createdAt)),
    db.select().from(s.creditNotes).where(eq(s.creditNotes.invoiceId, invoiceId)).orderBy(asc(s.creditNotes.issuedAt))
  ]);
  return { ...invoice, outstandingPaise: outstanding(invoice), lines, payments: paymentsRows, creditNotes: notes };
}

async function listPayments(accountId, { limit = 100 } = {}, db = getDb()) {
  return db.select({
    payment: s.payments,
    invoiceNumber: s.invoices.number
  }).from(s.payments)
    .leftJoin(s.invoices, eq(s.invoices.id, s.payments.invoiceId))
    .where(eq(s.payments.accountId, accountId))
    .orderBy(desc(s.payments.createdAt))
    .limit(limit)
    .then((rows) => rows.map((r) => ({ ...r.payment, invoiceNumber: r.invoiceNumber })));
}

async function listCreditNotes(accountId, db = getDb()) {
  return db.select().from(s.creditNotes).where(eq(s.creditNotes.accountId, accountId)).orderBy(desc(s.creditNotes.issuedAt));
}

async function openInvoicesFor(subscriptionId, db = getDb()) {
  return db.select().from(s.invoices)
    .where(and(eq(s.invoices.subscriptionId, subscriptionId), eq(s.invoices.status, 'open')))
    .orderBy(asc(s.invoices.dueAt));
}

async function voidUnpaidInvoices(tx, actor, subscriptionId, reasons, note) {
  const rows = await tx.select().from(s.invoices).where(and(
    eq(s.invoices.subscriptionId, subscriptionId),
    eq(s.invoices.status, 'open'),
    eq(s.invoices.amountPaidPaise, 0),
    eq(s.invoices.amountCreditedPaise, 0),
    inArray(s.invoices.reason, reasons)
  ));
  for (const row of rows) await voidInvoice(tx, actor, row.id, note);
  return rows.length;
}

module.exports = {
  outstanding,
  buyerSnapshot,
  issueInvoice,
  settleInvoice,
  recordPayment,
  recordFailedPayment,
  recordOfflinePayment,
  voidInvoice,
  splitCredit,
  createCreditNote,
  listInvoices,
  getInvoice,
  listPayments,
  listCreditNotes,
  openInvoicesFor,
  voidUnpaidInvoices,
  lockInvoice
};
