const { getPlatformConnection } = require('../config/platformDatabase');
const { getTenantModel } = require('../models/platform/Tenant');
const { getTenantConnectionAndModels } = require('./tenantConnectionManager');
const { getTenantModelKeys } = require('./registerTenantModels');

const REQUIRED_TENANT_MODEL_KEYS = [
  'User',
  'Teacher',
  'Student',
  'Subject',
  'Candidate',
  'DateSheet',
  'Room',
  'AnswerSheet',
  'AnswerSheetDispatch',
  'FolderMapping',
  'CBSEDatesheet',
  'CBSECircular',
  'Form66',
  'Form66Upload',
  'Guideline',
  'Undertaking',
  'CentreDetail',
  'SeatingPlanTemplateSetting',
  'SeatingPlanAllocation',
  'DutyAllocationSetting',
  'DutyAssignment',
  'DutySelection',
];

const runTenantModelStartupSanityCheck = async () => {
  const registeredKeys = getTenantModelKeys();
  const missingKeys = REQUIRED_TENANT_MODEL_KEYS.filter((key) => !registeredKeys.includes(key));

  if (missingKeys.length > 0) {
    console.error(
      `[tenant-model-sanity] Missing tenant model registrations: ${missingKeys.join(', ')}`
    );
    console.error(
      '[tenant-model-sanity] Add missing models to server/src/tenancy/registerTenantModels.js'
    );
    return;
  }

  const platformConnection = getPlatformConnection();
  const Tenant = getTenantModel(platformConnection);
  const sampleTenant = await Tenant.findOne({ status: 'active' }).select('slug dbName').lean();

  if (!sampleTenant?.dbName) {
    console.warn(
      '[tenant-model-sanity] No active tenant found; skipped tenant registration probe.'
    );
    return;
  }

  const { models } = getTenantConnectionAndModels(sampleTenant.dbName, REQUIRED_TENANT_MODEL_KEYS);
  const unresolvedKeys = REQUIRED_TENANT_MODEL_KEYS.filter((key) => !models[key]);

  if (unresolvedKeys.length > 0) {
    console.error(
      `[tenant-model-sanity] Failed to resolve tenant models for '${sampleTenant.slug}': ${unresolvedKeys.join(', ')}`
    );
    return;
  }

  console.log(
    `[tenant-model-sanity] Verified ${REQUIRED_TENANT_MODEL_KEYS.length} tenant models for '${sampleTenant.slug}'.`
  );
};

module.exports = {
  runTenantModelStartupSanityCheck,
};

