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

const onboardTenantTrial = async (payload) => (isConfigured() ? billing.onboardTrial(payload) : null);

const grandfatherTenant = async (payload) => (isConfigured() ? billing.grandfather(payload) : null);

module.exports = {
  isConfigured,
  getTenantEntitlement,
  onboardTenantTrial,
  grandfatherTenant
};
