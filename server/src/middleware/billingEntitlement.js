const { getTenantEntitlement } = require('../services/billingServiceClient');

const ENTITLEMENT_CACHE_TTL_MS = 45 * 1000;
const entitlementCache = new Map();

const BILLING_ERROR_RESPONSE = {
  success: false,
  errorCode: 'billing_access_restricted',
  message: 'Subscription payment is required to perform this action.',
  billingUrl: '/billing'
};

const CORE_ALLOWED_MODULES = new Set(['dashboard', 'candidates', 'subjects', 'datesheets', 'billing', 'auth']);
const SAFE_ALWAYS_ALLOWED_PREFIXES = ['/auth', '/billing', '/onboarding', '/users', '/roles'];

const parseBooleanEnv = (value, fallback) => {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
};

const trimLeadingSlash = (value) => String(value || '').replace(/^\/+/, '');

const resolveModuleFromPath = (path) => {
  const normalized = trimLeadingSlash(path);
  const firstSegment = normalized.split('/')[0] || '';

  if (!firstSegment) return 'unknown';

  const map = {
    auth: 'auth',
    dashboard: 'dashboard',
    candidates: 'candidates',
    subjects: 'subjects',
    datesheets: 'datesheets',
    teachers: 'exam_functionaries',
    duties: 'duties',
    rooms: 'exam_rooms',
    seating: 'seating_plan',
    'seating-plan': 'seating_plan',
    form66: 'form66',
    answersheets: 'answer_sheets',
    export: 'exports',
    undertakings: 'undertaking',
    guidelines: 'guidelines',
    'cbse-circulars': 'cbse_circulars',
    students: 'students',
    dispatch: 'dispatch',
    'centre-datesheet': 'centre_datesheet',
    billing: 'billing'
  };

  return map[firstSegment] || firstSegment;
};

const shouldSkipForPath = (path) => SAFE_ALWAYS_ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));

const isReadOnlyBlockedPath = (path) => {
  if (path.startsWith('/seating-plan/generate/')) {
    return true;
  }

  if (/^\/form66\/dates\/[^/]+\/pdf/.test(path)) {
    return true;
  }

  if (path.startsWith('/export/')) {
    return true;
  }

  return false;
};

const getCachedEntitlement = (tenantSlug) => {
  const cached = entitlementCache.get(tenantSlug);
  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    entitlementCache.delete(tenantSlug);
    return null;
  }

  return cached.value;
};

const setCachedEntitlement = (tenantSlug, value) => {
  entitlementCache.set(tenantSlug, {
    value,
    expiresAt: Date.now() + ENTITLEMENT_CACHE_TTL_MS
  });
};

const blockRequest = (res, accessMode) => res.status(402).json({
  ...BILLING_ERROR_RESPONSE,
  accessMode
});

const billingEntitlementMiddleware = async (req, res, next) => {
  if (!parseBooleanEnv(process.env.BILLING_ENFORCEMENT_ENABLED, true)) {
    return next();
  }

  if (!req.tenant?.slug) {
    return next();
  }

  const requestPath = req.path || '/';
  if (shouldSkipForPath(requestPath)) {
    return next();
  }

  const tenantSlug = req.tenant.slug;
  let entitlement = getCachedEntitlement(tenantSlug);

  if (!entitlement) {
    try {
      entitlement = await getTenantEntitlement(tenantSlug);
      setCachedEntitlement(tenantSlug, entitlement);
    } catch (error) {
      console.error('[billing-entitlement] failed_to_fetch', {
        tenantSlug,
        message: error.message
      });

      // Fail-open for read requests to avoid hard downtime; fail-closed for mutating requests.
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        return res.status(503).json({
          success: false,
          message: 'Billing service temporarily unavailable. Please try again.'
        });
      }

      return next();
    }
  }

  req.billingEntitlement = entitlement;
  res.setHeader('x-billing-access-mode', entitlement.accessMode || 'full');
  res.setHeader('x-billing-state', entitlement.state || 'active');

  const accessMode = entitlement.accessMode || 'full';
  const moduleName = resolveModuleFromPath(requestPath);
  const isWriteMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);

  if (accessMode === 'core_only') {
    if (!parseBooleanEnv(process.env.BILLING_TRIAL_CORE_ONLY_ENABLED, true)) {
      return next();
    }

    const moduleAllowed = CORE_ALLOWED_MODULES.has(moduleName);
    if (!moduleAllowed) {
      return blockRequest(res, accessMode);
    }
  }

  if (accessMode === 'read_only') {
    if (!parseBooleanEnv(process.env.BILLING_READ_ONLY_MODE_ENABLED, true)) {
      return next();
    }

    if (isWriteMethod) {
      return blockRequest(res, accessMode);
    }

    if (isReadOnlyBlockedPath(requestPath)) {
      return blockRequest(res, accessMode);
    }
  }

  return next();
};

module.exports = {
  billingEntitlementMiddleware,
  resolveModuleFromPath,
  isReadOnlyBlockedPath,
  shouldSkipForPath
};
