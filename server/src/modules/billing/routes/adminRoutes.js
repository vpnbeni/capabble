// Platform admin billing. Mounted at /api/admin/billing after the platform admin is
// checked; the mount sets req.actor. Schools are named by account id, tenant id or slug.
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const errorHandler = require('../middleware/errorHandler');
const v = require('../validation/schemas');
const c = require('../controllers/billingController');
const pay = require('../controllers/paymentController');
const { requireBillingDatabase, ensureActor } = require('./guards');

const router = express.Router();
router.use(requireBillingDatabase, ensureActor);

// Schools
router.get('/tenants', validate(v.listQuery, 'query'), asyncHandler(c.listBillingTenants));
router.get('/tenants/:tenantId', asyncHandler(c.getBillingTenantById));
router.post('/tenants/:tenantId/change-plan/preview', validate(v.selection), asyncHandler(c.previewTenantPlan));
router.post('/tenants/:tenantId/change-plan', validate(v.selection), asyncHandler(c.changeTenantPlan));
router.post('/tenants/:tenantId/grant-extension', validate(v.extension), asyncHandler(c.grantTenantExtension));
router.post('/tenants/:tenantId/students', validate(v.students), asyncHandler(c.setTenantStudents));
router.post('/tenants/:tenantId/cancel', validate(v.cancel), asyncHandler(c.cancelTenant));
router.post('/tenants/:tenantId/profile', validate(v.profile), asyncHandler(c.updateTenantProfileAdmin));
router.post('/tenants/:tenantId/autodebit', asyncHandler(pay.setupAutoDebit));
router.post('/tenants/:tenantId/invoices/:invoiceId/payments/offline', validate(v.offlinePayment), asyncHandler(c.recordOfflinePayment));
router.post('/tenants/:tenantId/invoices/:invoiceId/void', validate(v.voidInput), asyncHandler(c.voidInvoice));
router.post('/tenants/:tenantId/invoices/:invoiceId/credit-notes', validate(v.creditNote), asyncHandler(pay.createCreditNote));
router.get('/tenants/:tenantId/invoices/:invoiceId/pdf', asyncHandler(c.invoicePdf));
router.get('/tenants/:tenantId/receipts/:paymentId/pdf', asyncHandler(c.receiptPdf));
router.get('/tenants/:tenantId/credit-notes/:creditNoteId/pdf', asyncHandler(c.creditNotePdf));
router.get('/audit', validate(v.auditQuery, 'query'), asyncHandler(c.listAudit));
router.post('/jobs/run', asyncHandler(c.runJobs));

// Catalog
router.get('/catalog', asyncHandler(c.getAdminCatalog));
router.post('/modules', validate(v.moduleInput), asyncHandler(c.upsertModule));
router.get('/modules/:code/prices', asyncHandler(c.priceHistory));
router.post('/modules/:code/prices', validate(v.priceInput), asyncHandler(c.setModulePrice));
router.post('/bundles', validate(v.bundleInput), asyncHandler(c.upsertBundle));
router.post('/addons', validate(v.addonInput), asyncHandler(c.upsertAddon));
router.post('/coupons', validate(v.couponInput), asyncHandler(c.upsertCoupon));

router.use(errorHandler);

module.exports = router;
