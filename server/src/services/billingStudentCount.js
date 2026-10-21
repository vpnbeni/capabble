// Active-student count for billing renewals, read from the school's own database.
// Returns null when the school doesn't use the Students module.
const { getPlatformModels } = require('../tenancy/platformModels');
const { getTenantConnectionAndModels } = require('../tenancy/tenantConnectionManager');
const { normalizeTenantFeatureToggles } = require('../constants/tenantFeatures');
const { isModuleActive, getActiveModelKeys } = require('../constants/moduleModelKeys');

const countActiveStudents = async (tenantSlug) => {
  const { Tenant } = getPlatformModels();
  const tenant = await Tenant.findOne({ slug: String(tenantSlug).toLowerCase() })
    .select('slug dbName featureToggles')
    .lean();
  if (!tenant) return null;
  const toggles = normalizeTenantFeatureToggles(tenant.featureToggles);
  if (!isModuleActive('stdnt', toggles)) return null;
  const { models } = getTenantConnectionAndModels(tenant.dbName, getActiveModelKeys(toggles));
  return models.Student.countDocuments({ isActive: true });
};

module.exports = { countActiveStudents };
