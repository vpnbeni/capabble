// What the rest of the server needs from billing, as plain function calls into the billing
// module (src/modules/billing). Kept as one small surface so callers don't reach inside it.
const billing = require('../modules/billing');

const isConfigured = () => billing.isConfigured();

// Without a billing database (e.g. a fresh local setup) every school has full access.
const fallbackEntitlement = {
  accessMode: 'full',
  state: 'active',
  allowedModules: ['*'],
  entitledModules: ['*'],
  isReadOnly: false,
  reason: 'billing_not_configured',
  planCode: null,
  trialEndsAt: null,
  graceEndsAt: null
};

const getTenantEntitlement = async (tenantSlug) => {
  if (!isConfigured()) return { ...fallbackEntitlement, tenantSlug };
  return billing.getEntitlement(tenantSlug);
};

// A new trial or grandfathering changes what the school may use: drop the cached
// entitlement so the very next request sees it. (Required lazily: the middleware requires this file.)
const forgetEntitlement = (tenantSlug) => {
  // eslint-disable-next-line global-require
  require('../middleware/billingEntitlement').invalidateEntitlement(tenantSlug);
};

const onboardTenantTrial = async (payload) => {
  if (!isConfigured()) return null;
  const result = await billing.onboardTrial(payload);
  forgetEntitlement(payload.tenantSlug);
  return result;
};

const grandfatherTenant = async (payload) => {
  if (!isConfigured()) return null;
  const result = await billing.grandfather(payload);
  forgetEntitlement(payload.tenantSlug);
  return result;
};

module.exports = {
  isConfigured,
  getTenantEntitlement,
  onboardTenantTrial,
  grandfatherTenant
};
