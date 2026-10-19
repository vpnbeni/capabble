// Billing emails: each one is recorded before it is sent, and the unique key
// (account, kind, subject, day) makes it once-only even if a job or webhook runs twice.
const { eq } = require('drizzle-orm');
const { getDb } = require('../db/client');
const s = require('../db/schema');
const config = require('../config');
const mailer = require('./mailer');
const invoices = require('./invoiceService');
const pdf = require('./pdfService');
const { rupees } = require('../domain/money');
const mailTemplates = require('../../../mail/templates');

const isoDay = (value) => new Date(value).toISOString().slice(0, 10);
const dateLabel = (value) => new Intl.DateTimeFormat('en-IN', {
  timeZone: config.timezone, day: 'numeric', month: 'short', year: 'numeric'
}).format(new Date(value));
const appUrl = () => process.env.BILLING_APP_URL || 'https://school.capabble.cloud/#/billing';

const METHOD_LABELS = {
  upi: 'UPI',
  card: 'Card',
  netbanking: 'Netbanking',
  wallet: 'Wallet',
  emi: 'EMI',
  offline_bank: 'Bank transfer',
  offline_cheque: 'Cheque',
  offline_cash: 'Cash'
};
const methodLabel = (method) => METHOD_LABELS[method] || 'Online payment';

/** Returns 'sent', 'skipped' (mail not set up or no address), 'duplicate' or 'failed'. */
async function sendOnce({ accountId, kind, subjectId, dueOn, to, message }) {
  if (!to) return 'skipped';
  const db = getDb();
  const [row] = await db.insert(s.notifications)
    .values({ accountId, kind, subjectId, dueOn, recipient: to, status: 'sent' })
    .onConflictDoNothing()
    .returning();
  if (!row) return 'duplicate';
  try {
    const status = await mailer.sendMail({ to, ...message });
    if (status !== 'sent') await db.update(s.notifications).set({ status }).where(eq(s.notifications.id, row.id));
    return status;
  } catch (error) {
    await db.update(s.notifications)
      .set({ status: 'failed', error: String(error.message).slice(0, 500) })
      .where(eq(s.notifications.id, row.id));
    return 'failed';
  }
}

/**
 * "Payment received" to the school's billing email, with the receipt (and the invoice once it
 * is paid in full) attached. Called after the payment's transaction has committed.
 */
async function notifyPaymentReceived(paymentId) {
  const db = getDb();
  const [payment] = await db.select().from(s.payments).where(eq(s.payments.id, paymentId));
  if (!payment || payment.status !== 'captured' || !payment.receiptNumber) return 'skipped';
  const [account] = await db.select().from(s.accounts).where(eq(s.accounts.id, payment.accountId));
  const invoice = await invoices.getInvoice(payment.invoiceId);
  if (!account || !invoice) return 'skipped';

  const paidInFull = invoice.status === 'paid' || invoices.outstanding(invoice) === 0;
  const message = mailTemplates.paymentReceived({
    name: account.legalName || account.tenantName,
    amount: rupees(payment.amountPaise),
    receiptNumber: payment.receiptNumber,
    invoiceNumber: invoice.number,
    paidOn: dateLabel(payment.capturedAt || payment.createdAt),
    method: methodLabel(payment.method),
    balanceDue: paidInFull ? null : rupees(invoices.outstanding(invoice)),
    url: appUrl()
  });
  const attachments = [
    {
      filename: `${payment.receiptNumber}.pdf`,
      content: await pdf.receiptPdfBuffer({ payment, invoice }),
      contentType: 'application/pdf'
    }
  ];
  if (paidInFull) {
    attachments.push({
      filename: `${invoice.number}.pdf`,
      content: await pdf.invoicePdfBuffer(invoice),
      contentType: 'application/pdf'
    });
  }

  return sendOnce({
    accountId: account.id,
    kind: 'payment_received',
    subjectId: payment.id,
    dueOn: isoDay(payment.capturedAt || payment.createdAt),
    to: account.billingEmail,
    message: { ...message, attachments }
  });
}

/** For callers that must not fail because of email (webhooks, admin actions). */
function notifyPaymentReceivedSafely(paymentId) {
  return notifyPaymentReceived(paymentId).catch((error) => {
    console.error('[billing] payment_received email failed', { paymentId, message: error.message });
    return 'failed';
  });
}

module.exports = {
  sendOnce, notifyPaymentReceived, notifyPaymentReceivedSafely, methodLabel, dateLabel, isoDay, appUrl
};
