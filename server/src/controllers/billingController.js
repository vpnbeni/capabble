// School billing: the session and tenant are checked here, the billing module does the rest.
const asyncHandler = require('../middleware/asyncHandler');
const billing = require('../modules/billing');
const { loadEntitlement, invalidateEntitlement } = require('../middleware/billingEntitlement');
const { isModuleActive } = require('../constants/moduleModelKeys');
const { normalizeTenantFeatureToggles } = require('../constants/tenantFeatures');

const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

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

// Razorpay brings the school back to the billing page, which then reconciles.
const callbackUrl = (req) => {
  const origin = req.headers.origin || process.env.CLIENT_URL || '';
  return origin ? `${origin.replace(/\/+$/, '')}/#/billing?paid=1` : undefined;
};

/**
 * Hands a /api/billing/me request to the billing module: which school, who is acting,
 * the live student count for pricing, and where Razorpay should return to. After a
 * successful change the cached entitlement is dropped so access follows at once.
 */
const toBilling = asyncHandler(async (req, res, next) => {
  req.billingTenantKey = req.tenant.slug;
  req.actor = {
    type: 'school_user',
    id: req.user?._id ? String(req.user._id) : '',
    requestId: req.headers['x-request-id'] || ''
  };
  if (WRITE_METHODS.includes(req.method)) {
    const path = req.path || '';
    if (path.startsWith('/subscription') || path === '/trial/preview' || path === '/trial/start') {
      req.body = { ...(req.body || {}), reportedStudents: await activeStudentCount(req) };
    } else if (path === '/pay-now') {
      req.body = { ...(req.body || {}), callbackUrl: callbackUrl(req) };
    }
    res.on('finish', () => {
      if (res.statusCode < 400) invalidateEntitlement(req.tenant.slug);
    });
  }
  next();
});

const getBillingMe = asyncHandler(async (req, res) => {
  const tenantSlug = req.tenant?.slug;
  const [summary, entitlement] = await Promise.all([
    billing.isConfigured()
      ? billing.tenantSummary(tenantSlug).catch((error) => {
        if (error.statusCode === 404) return null;
        throw error;
      })
      : null,
    loadEntitlement(tenantSlug)
  ]);

  res.status(200).json({
    success: true,
    data: {
      ...(summary || {}),
      entitlement,
      liveStudents: await activeStudentCount(req)
    }
  });
});

module.exports = {
  activeStudentCount,
  toBilling,
  getBillingMe
};
