const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { ensureServiceAuth } = require('../middleware/serviceAuth');
const attachActor = require('../middleware/actor');
const validate = require('../middleware/validate');
const v = require('../validation/schemas');
const c = require('../controllers/internalController');
const pay = require('../controllers/paymentController');
const Joi = require('joi');

const payNowBody = Joi.object({ invoiceId: Joi.string().guid(), callbackUrl: Joi.string().uri({ scheme: ['http', 'https'] }).max(500) });

const router = express.Router();

router.use(ensureServiceAuth);
router.use(attachActor);

// Onboarding and entitlements (contract used by the main server's billingEntitlement middleware).
router.post('/tenants/onboard', validate(v.tenantIdentity), asyncHandler(c.onboardTenant));
router.post('/tenants/grandfather', validate(v.tenantIdentity), asyncHandler(c.grandfatherTenantHandler));
router.get('/entitlements/:tenantSlug', asyncHandler(c.getTenantEntitlement));

// One school (school app).
router.get('/catalog', asyncHandler(c.getCatalog));
router.get('/tenant/:tenantSlug', asyncHandler(c.getTenantBilling));
router.get('/tenant/:tenantSlug/catalog', asyncHandler(c.getCatalog));
router.get('/tenant/:tenantSlug/invoices', asyncHandler(c.listTenantInvoices));
router.get('/tenant/:tenantSlug/invoices/:invoiceId', asyncHandler(c.getTenantInvoice));
router.get('/tenant/:tenantSlug/payments', asyncHandler(c.listTenantPayments));
router.get('/tenant/:tenantSlug/credit-notes', asyncHandler(c.listTenantCreditNotes));
router.get('/tenant/:tenantSlug/invoices/:invoiceId/pdf', asyncHandler(c.invoicePdf));
router.get('/tenant/:tenantSlug/receipts/:paymentId/pdf', asyncHandler(c.receiptPdf));
router.get('/tenant/:tenantSlug/credit-notes/:creditNoteId/pdf', asyncHandler(c.creditNotePdf));
router.post('/tenant/:tenantSlug/profile', validate(v.profile), asyncHandler(c.updateTenantProfile));
router.post('/tenant/:tenantSlug/subscription/preview', validate(v.selection), asyncHandler(c.previewSubscription));
router.post('/tenant/:tenantSlug/subscription', validate(v.selection), asyncHandler(c.subscribe));
router.post('/tenant/:tenantSlug/cancel', validate(v.cancel), asyncHandler(c.cancelSubscription));
router.post('/tenant/:tenantSlug/resume', asyncHandler(c.resumeSubscription));
router.post('/tenant/:tenantSlug/pay-now', validate(payNowBody), asyncHandler(pay.payNow));
router.post('/tenant/:tenantSlug/pay-now/reconcile', validate(payNowBody), asyncHandler(pay.reconcile));

// Platform admin: schools.
router.get('/admin/tenants', validate(v.listQuery, 'query'), asyncHandler(c.listBillingTenants));
router.get('/admin/tenants/:tenantId', asyncHandler(c.getBillingTenantById));
router.post('/admin/tenants/:tenantId/change-plan/preview', validate(v.selection), asyncHandler(c.previewTenantPlan));
router.post('/admin/tenants/:tenantId/change-plan', validate(v.selection), asyncHandler(c.changeTenantPlan));
router.post('/admin/tenants/:tenantId/grant-extension', validate(v.extension), asyncHandler(c.grantTenantExtension));
router.post('/admin/tenants/:tenantId/students', validate(v.students), asyncHandler(c.setTenantStudents));
router.post('/admin/tenants/:tenantId/cancel', validate(v.cancel), asyncHandler(c.cancelTenant));
router.post('/admin/tenants/:tenantId/profile', validate(v.profile), asyncHandler(c.updateTenantProfileAdmin));
router.post('/admin/tenants/:tenantId/invoices/:invoiceId/payments/offline', validate(v.offlinePayment), asyncHandler(c.recordOfflinePayment));
router.post('/admin/tenants/:tenantId/invoices/:invoiceId/void', validate(v.voidInput), asyncHandler(c.voidInvoice));
router.post('/admin/tenants/:tenantId/invoices/:invoiceId/credit-notes', validate(v.creditNote), asyncHandler(pay.createCreditNote));
router.post('/admin/tenants/:tenantId/autodebit', asyncHandler(pay.setupAutoDebit));
router.post('/admin/jobs/run', asyncHandler(c.runJobs));
router.get('/admin/audit', validate(v.auditQuery, 'query'), asyncHandler(c.listAudit));

// Platform admin: catalog.
router.get('/admin/catalog', asyncHandler(c.getAdminCatalog));
router.post('/admin/modules', validate(v.moduleInput), asyncHandler(c.upsertModule));
router.get('/admin/modules/:code/prices', asyncHandler(c.priceHistory));
router.post('/admin/modules/:code/prices', validate(v.priceInput), asyncHandler(c.setModulePrice));
router.post('/admin/bundles', validate(v.bundleInput), asyncHandler(c.upsertBundle));
router.post('/admin/addons', validate(v.addonInput), asyncHandler(c.upsertAddon));
router.post('/admin/coupons', validate(v.couponInput), asyncHandler(c.upsertCoupon));

module.exports = router;
