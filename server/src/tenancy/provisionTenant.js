const crypto = require('crypto');
const { ADMINISTRATOR_ROLE } = require('../rbac/catalog');
const { getPlatformModels } = require('./platformModels');
const { getTenantConnectionAndModels } = require('./tenantConnectionManager');
const { syncTenantUserDirectoryEntry } = require('./tenantUserDirectoryService');
const { isValidSlug } = require('./resolveTenantFromRequest');
const { ensureTenantActiveDatesheet } = require('../services/cbseDatesheetRolloutService');
const { getDefaultTenantFeatureToggles } = require('../services/tenantFeatureDefaultsService');

const generateRandomPassword = () => crypto.randomBytes(12).toString('base64url');

const resolveDbName = (slug, customDbName) => {
  if (customDbName) {
    return customDbName.trim();
  }

  const prefix = process.env.TENANT_DB_PREFIX || 'capabble_tenant_';
  return `${prefix}${slug.replace(/-/g, '_')}`;
};

const provisionTenant = async ({
  slug,
  name,
  adminEmail,
  adminPassword,
  schoolCode,
  affiliationNo,
  udiseCode,
  createdBy = null,
  dbName
}) => {
  const normalizedSlug = (slug || '').trim().toLowerCase();

  if (!isValidSlug(normalizedSlug)) {
    const error = new Error('Invalid tenant slug');
    error.statusCode = 400;
    error.errorCode = 'invalid_slug';
    throw error;
  }

  const resolvedDbName = resolveDbName(normalizedSlug, dbName);
  const email = (adminEmail || '').trim().toLowerCase();

  if (!email) {
    const error = new Error('adminEmail is required');
    error.statusCode = 400;
    error.errorCode = 'invalid_admin_email';
    throw error;
  }

  const { Tenant } = getPlatformModels();

  const existingTenant = await Tenant.findOne({
    $or: [
      { slug: normalizedSlug },
      { dbName: resolvedDbName }
    ]
  }).lean();

  if (existingTenant) {
    const error = new Error('Tenant with same slug or database already exists');
    error.statusCode = 409;
    error.errorCode = 'slug_taken';
    throw error;
  }

  const generatedPassword = adminPassword || generateRandomPassword();
  const defaultFeatureToggles = await getDefaultTenantFeatureToggles();

  const tenant = await Tenant.create({
    slug: normalizedSlug,
    name: name?.trim() || normalizedSlug,
    dbName: resolvedDbName,
    adminEmail: email,
    featureToggles: defaultFeatureToggles,
    metadata: {
      createdBy,
      schoolCode: String(schoolCode || '').trim(),
      affiliationNo: String(affiliationNo || '').trim(),
      udiseCode: String(udiseCode || '').trim(),
    }
  });

  try {
    const { models } = getTenantConnectionAndModels(tenant.dbName, ['User', 'CBSEDatesheet']);

    const existingUser = await models.User.findOne({ email }).lean();
    if (existingUser) {
      const error = new Error('Tenant admin email already exists in tenant database');
      error.statusCode = 409;
      error.errorCode = 'admin_email_taken';
      throw error;
    }

    const tenantAdmin = await models.User.create({
      email,
      password: generatedPassword,
      kind: 'staff',
      roles: [ADMINISTRATOR_ROLE],
      role: 'admin',
      isActive: true,
      isEmailVerified: false
    });

    await syncTenantUserDirectoryEntry({
      tenantSlug: tenant.slug,
      tenantDbName: tenant.dbName,
      tenantUserId: tenantAdmin._id,
      email: tenantAdmin.email,
      role: tenantAdmin.role,
      isActive: tenantAdmin.isActive
    });

    try {
      await ensureTenantActiveDatesheet(models.CBSEDatesheet);
    } catch (seedError) {
      console.warn(
        `Failed to seed CBSE datesheet for tenant ${tenant.slug}: ${seedError.message}`
      );
    }

    return {
      tenant,
      tenantAdmin,
      generatedPassword: adminPassword ? null : generatedPassword
    };
  } catch (error) {
    await Tenant.findByIdAndDelete(tenant._id);
    throw error;
  }
};

module.exports = {
  provisionTenant
};
