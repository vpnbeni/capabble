const express = require('express');
const { protect } = require('../middleware/auth');
const { validateJoi } = require('../middleware/validation');
const v = require('../validations/billingValidation');
const billingController = require('../controllers/billingController');

const router = express.Router();

router.use(protect);

// Reads need core.billing.read; writes need core.billing.manage (catalog route rule for /billing).
router.get('/me', billingController.getBillingMe);
router.get('/catalog', billingController.getCatalog);
router.get('/me/invoices', billingController.getBillingInvoices);
router.get('/me/invoices/:invoiceId', billingController.getBillingInvoice);
router.get('/me/invoices/:invoiceId/pdf', billingController.invoicePdf);
router.get('/me/payments', billingController.getBillingPayments);
router.get('/me/receipts/:paymentId/pdf', billingController.receiptPdf);
router.get('/me/credit-notes', billingController.getBillingCreditNotes);
router.get('/me/credit-notes/:creditNoteId/pdf', billingController.creditNotePdf);

router.post('/me/subscription/preview', validateJoi(v.selectionSchema), billingController.previewSubscription);
router.post('/me/subscription', validateJoi(v.selectionSchema), billingController.subscribe);
router.post('/me/cancel', validateJoi(v.cancelSchema), billingController.cancelSubscription);
router.post('/me/resume', billingController.resumeSubscription);
router.post('/me/pay-now', validateJoi(v.payNowSchema), billingController.payNow);
router.post('/me/pay-now/reconcile', validateJoi(v.payNowSchema), billingController.reconcilePayment);
router.post('/me/update-billing-profile', validateJoi(v.billingProfileSchema), billingController.updateBillingProfile);

module.exports = router;
