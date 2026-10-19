const billingClient = require('../services/billingServiceClient');
const { applyBillingEntitlement } = require('../constants/tenantFeatures');

// Fresh for 45s. If billing is unreachable (e.g. its database is waking up), the last
// known entitlement keeps being used for up to 24h instead of failing requests.
const ENTITLEMENT_CACHE_TTL_MS = 45 * 1000;
const ENTITLEMENT_STALE_MAX_MS = 24 * 60 * 60 * 1000;
const entitlementCache = new Map();
const inflight = new Map();

const BILLING_ERROR_RESPONSE = {
  success: false,
  errorCode: 'billing_access_restricted',
  message: 'Subscription payment is required to perform this action.',
  billingUrl: '/billing'
};

const CORE_ALLOWED_MODULES = new Set(['dashboard', 'candidates', 'subjects', 'datesheets', 'billing', 'auth']);
const SAFE_ALWAYS_ALLOWED_PREFIXES = ['/auth', '/billing', '/onboarding', '/users', '/roles'];
const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

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

/**
 * Entitlement for a school, from cache when fresh. Concurrent misses share one request.
 * On failure a stale value (≤ 24h) is returned with `stale: true`; otherwise it throws.
 */
const loadEntitlement = async (tenantSlug, { now = Date.now() } = {}) => {
  const cached = entitlementCache.get(tenantSlug);
  if (cached && now - cached.fetchedAt < ENTITLEMENT_CACHE_TTL_MS) return cached.value;

  if (!inflight.has(tenantSlug)) {
    inflight.set(tenantSlug, billingClient.getTenantEntitlement(tenantSlug)
      .then((value) => {
        entitlementCache.set(tenantSlug, { value, fetchedAt: Date.now() });
        return value;
      })
      .finally(() => inflight.delete(tenantSlug)));
  }

  try {
    return await inflight.get(tenantSlug);
  } catch (error) {
    if (cached && now - cached.fetchedAt < ENTITLEMENT_STALE_MAX_MS) {
      console.warn('[billing-entitlement] using last known entitlement', { tenantSlug, message: error.message });
      return { ...cached.value, stale: true };
    }
    throw error;
  }
};

const invalidateEntitlement = (tenantSlug) => {
  if (tenantSlug) entitlementCache.delete(tenantSlug);
  else entitlementCache.clear();
};

/*
 * A school with no billing account (signup ran while billing was down, or one created before
 * billing existed) starts its free trial on its first request, instead of landing read-only.
 * onboardTrial is idempotent; concurrent requests share one call.
 */
const trialStarts = new Map();
const startTrialIfMissing = async (tenant, entitlement) => {
  if (entitlement?.reason !== 'billing_account_missing') return entitlement;
  const { slug } = tenant;
  if (!trialStarts.has(slug)) {
    trialStarts.set(slug, billingClient.onboardTenantTrial({
      tenantId: String(tenant.id || slug),
      tenantSlug: slug,
      tenantName: tenant.name || slug,
      billingEmail: tenant.adminEmail || null
    })
      .then(() => console.info(`[billing-entitlement] status=trial_started_on_first_request tenantSlug=${slug}`))
      .finally(() => trialStarts.delete(slug)));
  }
  try {
    await trialStarts.get(slug);
  } catch (error) {
    console.error('[billing-entitlement] trial_start_failed', { tenantSlug: slug, message: error.message });
    return entitlement;
  }
  invalidateEntitlement(slug);
  return loadEntitlement(slug);
};

// Writes a read-only school may still make: opening an academic session is how it reads its data.
const READ_ONLY_ALLOWED_WRITES = [{ method: 'POST', path: /^\/sessions\/?$/ }];
const isAllowedWhileReadOnly = (method, path) => READ_ONLY_ALLOWED_WRITES
  .some((rule) => rule.method === method && rule.path.test(path));

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
  const skipBlocking = shouldSkipForPath(requestPath);
  const tenantSlug = req.tenant.slug;
  let entitlement;

  try {
    entitlement = await startTrialIfMissing(req.tenant, await loadEntitlement(tenantSlug));
  } catch (error) {
    console.error('[billing-entitlement] failed_to_fetch', {
      tenantSlug,
      message: error.message
    });

    if (skipBlocking) return next();
    // Nothing known about this school: reads go through, writes wait for billing.
    if (WRITE_METHODS.includes(req.method)) {
      return res.status(503).json({
        success: false,
        message: 'Billing service temporarily unavailable. Please try again.'
      });
    }

    return next();
  }

  req.billingEntitlement = entitlement;
  res.setHeader('x-billing-access-mode', entitlement.accessMode || 'full');
  res.setHeader('x-billing-state', entitlement.state || 'active');

  // Modules the school hasn't paid for are switched off for everything downstream:
  // requireTenantFeature (402), the user payload sent to the app, search and portals.
  if (req.tenant.featureToggles) {
    const { toggles, billingDisabled } = applyBillingEntitlement(
      req.tenant.featureToggles,
      entitlement.entitledModules
    );
    req.tenant.featureToggles = toggles;
    req.tenant.billingDisabledFeatures = billingDisabled;
  }

  if (skipBlocking) {
    return next();
  }

  const accessMode = entitlement.accessMode || 'full';
  const moduleName = resolveModuleFromPath(requestPath);
  const isWriteMethod = WRITE_METHODS.includes(req.method);

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

    if (isWriteMethod && !isAllowedWhileReadOnly(req.method, requestPath)) {
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
  loadEntitlement,
  invalidateEntitlement,
  resolveModuleFromPath,
  isReadOnlyBlockedPath,
  shouldSkipForPath,
  _cache: entitlementCache
};
