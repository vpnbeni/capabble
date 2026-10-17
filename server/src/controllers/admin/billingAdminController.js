// Platform admin billing: thin pass-throughs to billing-service, which validates, stores and audits.
const asyncHandler = require('../../middleware/asyncHandler');
const billing = require('../../services/billingServiceClient');
const { invalidateEntitlement } = require('../../middleware/billingEntitlement');

const actorOf = (req) => ({
  type: 'platform_admin',
  id: req.platformUser?._id ? String(req.platformUser._id) : '',
  requestId: req.headers['x-request-id'] || ''
});

const send = (res, response, status = 200) => res.status(status).json({
  success: true,
  ...(response?.message ? { message: response.message } : {}),
  data: response?.data ?? null
});

// A school's access may have changed: drop the cached entitlement everywhere we know of.
const afterChange = (response) => {
  const slug = response?.data?.account?.tenantSlug;
  invalidateEntitlement(slug || undefined);
  return response;
};

// Forward to billing-service; `change` drops cached entitlements since access may have moved.
const relay = (call, { status = 200, change = false } = {}) => asyncHandler(async (req, res) => {
  const response = await call(req, actorOf(req));
  if (change) afterChange(response);
  send(res, response, status);
});
const pdf = (stream) => asyncHandler(async (req, res) => stream(req, res));

const t = (req) => req.params.tenantId;

const listTenants = relay((req) => billing.listBillingTenants(req.query || {}));
const getTenantById = relay((req) => billing.getBillingTenantById(t(req)));
const previewPlan = relay((req, a) => billing.previewBillingTenantPlan(t(req), req.body, a));
const changePlan = relay((req, a) => billing.changeBillingTenantPlan(t(req), req.body, a), { change: true });
const grantExtension = relay((req, a) => billing.grantBillingTenantExtension(t(req), req.body, a), { change: true });
const setStudents = relay((req, a) => billing.setBillingTenantStudents(t(req), req.body, a));
const cancel = relay((req, a) => billing.cancelBillingTenant(t(req), req.body, a), { change: true });
const updateProfile = relay((req, a) => billing.updateBillingTenantProfile(t(req), req.body, a));
const recordOfflinePayment = relay(
  (req, a) => billing.recordOfflinePayment(t(req), req.params.invoiceId, req.body, a),
  { status: 201, change: true }
);
const voidInvoice = relay(
  (req, a) => billing.voidBillingInvoice(t(req), req.params.invoiceId, req.body, a),
  { change: true }
);
const createCreditNote = relay(
  (req, a) => billing.createBillingCreditNote(t(req), req.params.invoiceId, req.body, a),
  { status: 201, change: true }
);
const setupAutoDebit = relay((req, a) => billing.setupBillingAutoDebit(t(req), a), { status: 201 });
const listAudit = relay((req) => billing.listBillingAudit(req.query || {}));
const runJobs = relay((req, a) => billing.runBillingJobs(a), { change: true });

const invoicePdf = pdf((req, res) => billing.streamInvoicePdf(t(req), req.params.invoiceId, res));
const receiptPdf = pdf((req, res) => billing.streamReceiptPdf(t(req), req.params.paymentId, res));
const creditNotePdf = pdf((req, res) => billing.streamCreditNotePdf(t(req), req.params.creditNoteId, res));

const getCatalog = relay(() => billing.getBillingCatalogAdmin());
const upsertModule = relay((req, a) => billing.upsertBillingModule(req.body, a));
const getModulePrices = relay((req) => billing.getBillingModulePrices(req.params.code));
const setModulePrice = relay((req, a) => billing.setBillingModulePrice(req.params.code, req.body, a), { status: 201 });
const upsertBundle = relay((req, a) => billing.upsertBillingBundle(req.body, a));
const createCoupon = relay((req, a) => billing.createBillingCoupon(req.body, a));
const createAddon = relay((req, a) => billing.createBillingAddon(req.body, a));

module.exports = {
  listTenants,
  getTenantById,
  previewPlan,
  changePlan,
  grantExtension,
  setStudents,
  cancel,
  updateProfile,
  recordOfflinePayment,
  voidInvoice,
  createCreditNote,
  setupAutoDebit,
  listAudit,
  runJobs,
  invoicePdf,
  receiptPdf,
  creditNotePdf,
  getCatalog,
  upsertModule,
  getModulePrices,
  setModulePrice,
  upsertBundle,
  createCoupon,
  createAddon
};
