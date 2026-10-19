// One school's billing. Mounted at /api/billing/me after the school's session is checked;
// the mount sets req.billingTenantKey (tenant slug) and req.actor.
const express = require('express');
const Joi = require('joi');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const errorHandler = require('../middleware/errorHandler');
const v = require('../validation/schemas');
const c = require('../controllers/billingController');
const pay = require('../controllers/paymentController');
const { requireBillingDatabase, ensureActor } = require('./guards');

const payNowBody = Joi.object({
  invoiceId: Joi.string().guid(),
  callbackUrl: Joi.string().uri({ scheme: ['http', 'https'] }).max(500),
  // The Razorpay link the school came back from (razorpay_payment_link_id), for reconcile.
  paymentLinkId: Joi.string().pattern(/^plink_[A-Za-z0-9]+$/).max(64)
});

const router = express.Router();
router.use(requireBillingDatabase, ensureActor);

router.get('/', asyncHandler(c.getTenantBilling));
router.get('/catalog', asyncHandler(c.getCatalog));
router.get('/invoices', asyncHandler(c.listTenantInvoices));
router.get('/invoices/:invoiceId', asyncHandler(c.getTenantInvoice));
router.get('/invoices/:invoiceId/pdf', asyncHandler(c.invoicePdf));
router.get('/payments', asyncHandler(c.listTenantPayments));
router.get('/receipts/:paymentId/pdf', asyncHandler(c.receiptPdf));
router.get('/credit-notes', asyncHandler(c.listTenantCreditNotes));
router.get('/credit-notes/:creditNoteId/pdf', asyncHandler(c.creditNotePdf));
router.post('/profile', validate(v.profile), asyncHandler(c.updateTenantProfile));
router.post('/subscription/preview', validate(v.selection), asyncHandler(c.previewSubscription));
router.post('/subscription', validate(v.selection), asyncHandler(c.subscribe));
router.post('/cancel', validate(v.cancel), asyncHandler(c.cancelSubscription));
router.post('/resume', asyncHandler(c.resumeSubscription));
router.post('/pay-now', validate(payNowBody), asyncHandler(pay.payNow));
router.post('/pay-now/reconcile', validate(payNowBody), asyncHandler(pay.reconcile));

router.use(errorHandler);

module.exports = router;
