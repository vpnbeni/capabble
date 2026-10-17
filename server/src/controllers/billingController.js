const asyncHandler = require('../middleware/asyncHandler');
const billing = require('../services/billingServiceClient');
const { loadEntitlement, invalidateEntitlement } = require('../middleware/billingEntitlement');
const { isModuleActive } = require('../constants/moduleModelKeys');
const { normalizeTenantFeatureToggles } = require('../constants/tenantFeatures');

const actorOf = (req) => ({
  type: 'school_user',
  id: req.user?._id ? String(req.user._id) : '',
  requestId: req.headers['x-request-id'] || ''
});

const send = (res, response, status = 200) => res.status(status).json({
  success: true,
  ...(response?.message ? { message: response.message } : {}),
  data: response?.data ?? null
});

/** Live active-student count when STDNT is on; billing bills max(declared, this). */
const activeStudentCount = async (req) => {
  const toggles = normalizeTenantFeatureToggles(req.tenant?.featureToggles);
  if (!isModuleActive('stdnt', toggles) || !req.models?.Student) return null;
  try {
    return await req.models.Student.countDocuments({ isActive: true });
  } catch {
    return null;
  }
};

const getBillingMe = asyncHandler(async (req, res) => {
  const tenantSlug = req.tenant?.slug;
  const [summary, entitlement] = await Promise.all([
    billing.getTenantBilling(tenantSlug).catch((error) => {
      if (error.statusCode === 404) return { data: null };
      throw error;
    }),
    loadEntitlement(tenantSlug)
  ]);

  res.status(200).json({
    success: true,
    data: {
      ...(summary?.data || {}),
      entitlement,
      liveStudents: await activeStudentCount(req)
    }
  });
});

const getBillingInvoices = asyncHandler(async (req, res) => {
  send(res, await billing.getTenantInvoices(req.tenant.slug));
});

const getBillingInvoice = asyncHandler(async (req, res) => {
  send(res, await billing.getTenantInvoice(req.tenant.slug, req.params.invoiceId));
});

const getBillingPayments = asyncHandler(async (req, res) => {
  send(res, await billing.getTenantPayments(req.tenant.slug));
});

const getBillingCreditNotes = asyncHandler(async (req, res) => {
  send(res, await billing.getTenantCreditNotes(req.tenant.slug));
});

const getCatalog = asyncHandler(async (_req, res) => {
  send(res, await billing.getCatalog());
});

const previewSubscription = asyncHandler(async (req, res) => {
  const reportedStudents = await activeStudentCount(req);
  send(res, await billing.previewSubscription(req.tenant.slug, { ...req.body, reportedStudents }, actorOf(req)));
});

const subscribe = asyncHandler(async (req, res) => {
  const reportedStudents = await activeStudentCount(req);
  const response = await billing.subscribe(req.tenant.slug, { ...req.body, reportedStudents }, actorOf(req));
  invalidateEntitlement(req.tenant.slug);
  send(res, response);
});

const cancelSubscription = asyncHandler(async (req, res) => {
  const response = await billing.cancelSubscription(req.tenant.slug, req.body, actorOf(req));
  invalidateEntitlement(req.tenant.slug);
  send(res, response);
});

const resumeSubscription = asyncHandler(async (req, res) => {
  const response = await billing.resumeSubscription(req.tenant.slug, actorOf(req));
  invalidateEntitlement(req.tenant.slug);
  send(res, response);
});

// Razorpay brings the school back to the billing page, which then reconciles.
const callbackUrl = (req) => {
  const origin = req.headers.origin || process.env.CLIENT_URL || '';
  return origin ? `${origin.replace(/\/+$/, '')}/#/billing?paid=1` : undefined;
};

const payNow = asyncHandler(async (req, res) => {
  const body = { ...req.body, callbackUrl: callbackUrl(req) };
  send(res, await billing.createPayNowLink(req.tenant.slug, body, actorOf(req)));
});

const reconcilePayment = asyncHandler(async (req, res) => {
  const response = await billing.reconcilePayment(req.tenant.slug, req.body, actorOf(req));
  if (response?.data?.recorded?.length) invalidateEntitlement(req.tenant.slug);
  send(res, response);
});

const updateBillingProfile = asyncHandler(async (req, res) => {
  send(res, await billing.updateTenantBillingProfile(req.tenant.slug, req.body, actorOf(req)));
});

const invoicePdf = asyncHandler(async (req, res) => {
  await billing.streamInvoicePdf(req.tenant.slug, req.params.invoiceId, res);
});

const receiptPdf = asyncHandler(async (req, res) => {
  await billing.streamReceiptPdf(req.tenant.slug, req.params.paymentId, res);
});

const creditNotePdf = asyncHandler(async (req, res) => {
  await billing.streamCreditNotePdf(req.tenant.slug, req.params.creditNoteId, res);
});

module.exports = {
  activeStudentCount,
  getBillingMe,
  getBillingInvoices,
  getBillingInvoice,
  getBillingPayments,
  getBillingCreditNotes,
  getCatalog,
  previewSubscription,
  subscribe,
  cancelSubscription,
  resumeSubscription,
  payNow,
  reconcilePayment,
  updateBillingProfile,
  invoicePdf,
  receiptPdf,
  creditNotePdf
};
