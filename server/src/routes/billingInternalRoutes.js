// Called by billing-service only (service token), outside the tenant RBAC gate.
const crypto = require('crypto');
const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { getPlatformModels } = require('../tenancy/platformModels');
const { getTenantConnectionAndModels } = require('../tenancy/tenantConnectionManager');
const { normalizeTenantFeatureToggles } = require('../constants/tenantFeatures');
const { isModuleActive, getActiveModelKeys } = require('../constants/moduleModelKeys');

const router = express.Router();

const tokenMatches = (received) => {
  const expected = String(process.env.BILLING_SERVICE_TOKEN || '');
  if (!expected || !received) return false;
  const a = Buffer.from(String(received));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

router.use((req, res, next) => {
  if (!tokenMatches(req.headers['x-billing-service-token'])) {
    return res.status(401).json({ success: false, message: 'Invalid service credentials' });
  }
  return next();
});

// Active students for a school, or null when STDNT is off for it.
router.get('/student-count/:slug', asyncHandler(async (req, res) => {
  const { Tenant } = getPlatformModels();
  const tenant = await Tenant.findOne({ slug: String(req.params.slug).toLowerCase() })
    .select('slug dbName featureToggles')
    .lean();
  if (!tenant) return res.status(404).json({ success: false, message: 'School not found' });
  const toggles = normalizeTenantFeatureToggles(tenant.featureToggles);
  if (!isModuleActive('stdnt', toggles)) return res.json({ success: true, data: { count: null } });
  const { models } = getTenantConnectionAndModels(tenant.dbName, getActiveModelKeys(toggles));
  const count = await models.Student.countDocuments({ isActive: true });
  return res.json({ success: true, data: { count } });
}));

module.exports = router;
