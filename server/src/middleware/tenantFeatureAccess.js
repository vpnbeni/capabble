const { normalizeTenantFeatureToggles, FEATURE_MODULE } = require('../constants/tenantFeatures');

// A feature switched off because its module isn't paid for is a 402 (pay to unlock),
// not a 403 (switched off by the platform admin).
const notSubscribed = (res, featureKeys) => res.status(402).json({
  success: false,
  errorCode: 'module_not_subscribed',
  message: 'Your school has not subscribed to this module.',
  module: FEATURE_MODULE[featureKeys[0]] || null,
  featureKeys,
  billingUrl: '/billing'
});

const disabledByBilling = (req, featureKeys) => {
  const off = req.tenant?.billingDisabledFeatures;
  return Array.isArray(off) && off.length > 0 && featureKeys.every((key) => off.includes(key));
};

const requireTenantFeature = (featureKey) => (req, res, next) => {
  const toggles = normalizeTenantFeatureToggles(req.tenant?.featureToggles);
  const isEnabled = toggles[featureKey] !== false;

  if (!isEnabled) {
    if (disabledByBilling(req, [featureKey])) return notSubscribed(res, [featureKey]);
    return res.status(403).json({
      success: false,
      message: `Feature '${featureKey}' is not available for your account`,
      featureKey
    });
  }

  return next();
};

const requireAnyTenantFeature = (...featureKeys) => (req, res, next) => {
  const toggles = normalizeTenantFeatureToggles(req.tenant?.featureToggles);
  const isEnabled = featureKeys.some((featureKey) => toggles[featureKey] !== false);
  if (!isEnabled) {
    if (disabledByBilling(req, featureKeys)) return notSubscribed(res, featureKeys);
    return res.status(403).json({
      success: false,
      message: 'This feature is not available for your account',
      featureKeys
    });
  }
  return next();
};

module.exports = {
  requireTenantFeature,
  requireAnyTenantFeature
};
