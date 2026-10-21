const { transaction } = require('../db/client');
const payments = require('../services/paymentService');
const invoices = require('../services/invoiceService');
const { requireInvoiceOfTenant } = require('./billingController');

const { schoolKey } = require('./request');

const ok = (res, data, status = 200, message) => res.status(status).json({ success: true, data, ...(message ? { message } : {}) });

async function payNow(req, res) {
  ok(res, await payments.payNow(schoolKey(req), req.body));
}

async function reconcile(req, res) {
  const result = await payments.reconcile(schoolKey(req), req.body);
  ok(res, result, 200, result.recorded.length ? 'Payment received' : 'No new payment yet');
}

async function webhook(req, res) {
  const result = await payments.handleWebhook({
    rawBody: req.rawBody,
    signature: req.headers['x-razorpay-signature'],
    eventIdHeader: req.headers['x-razorpay-event-id']
  });
  res.status(200).json({ success: true, ...result });
}

// Credit note first (one transaction), then the Razorpay refund once it is committed.
async function createCreditNote(req, res) {
  await requireInvoiceOfTenant(schoolKey(req), req.params.invoiceId);
  const result = await transaction((tx) => invoices.createCreditNote(tx, req.actor, req.params.invoiceId, req.body));
  if (result.creditNote.refundStatus === 'pending') {
    result.creditNote = await payments.sendRefund(result.creditNote.id, req.actor);
  }
  const failed = result.creditNote.refundStatus === 'failed';
  ok(res, result, 201, failed
    ? `Credit note ${result.creditNote.number} issued, but the refund failed; refund it by hand`
    : `Credit note ${result.creditNote.number} issued`);
}

async function setupAutoDebit(req, res) {
  ok(res, await payments.setupAutoDebit(req.actor, schoolKey(req)), 201, 'Ask the school to authorise auto-debit');
}

module.exports = { payNow, reconcile, webhook, createCreditNote, setupAutoDebit };
