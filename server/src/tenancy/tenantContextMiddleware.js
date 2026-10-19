const { resolveTenantFromRequest } = require('./resolveTenantFromRequest');
const { getTenantConnectionAndModels } = require('./tenantConnectionManager');
const { setRequestContext } = require('./requestContext');
const { getPlatformModels } = require('./platformModels');
const { connectPlatformDB } = require('../config/platformDatabase');
const { TENANT_STATUS } = require('../models/platform/Tenant');
const { normalizeTenantFeatureToggles } = require('../constants/tenantFeatures');
const { getActiveModelKeys } = require('../constants/moduleModelKeys');

const buildTenantResolutionDebugContext = (req, resolution) => {
  const headers = req.headers || {};
  const forwardedHost = headers['x-forwarded-host'];
  const normalizedForwardedHost = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : (forwardedHost || '');

  return {
    method: req.method,
    originalUrl: req.originalUrl || req.url,
    rootApiDomain: (process.env.ROOT_API_DOMAIN || 'api.capabble.cloud').toLowerCase(),
    hostHeader: headers.host || null,
    xForwardedHostHeader: normalizedForwardedHost || null,
    originHeader: headers.origin || null,
    refererHeader: headers.referer || null,
    tenantHeader: headers['x-tenant-slug'] || null,
    tenantQuery: req.query?.tenant || null,
    resolution,
  };
};

const platformContextMiddleware = async (req, res, next) => {
  try {
    const resolution = resolveTenantFromRequest(req);
    const rootApiDomain = (process.env.ROOT_API_DOMAIN || 'api.capabble.cloud').toLowerCase();
    const rootAppDomain = (process.env.ROOT_APP_DOMAIN || 'school.capabble.cloud').toLowerCase();
    const isRequestToRootApiHost = resolution.host === rootApiDomain;

    console.log('[platform-debug]', {
      rootApiDomain,
      rootAppDomain,
      host: req.headers.host,
      xForwardedHost: req.headers['x-forwarded-host'],
      origin: req.headers.origin,
      referer: req.headers.referer,
      resolution,
    });

    // Platform admin routes must be served when request is to root API host (or localhost).
    // Allow when: request host is root API (e.g. api.capabble.cloud) even if origin/referer
    // imply a tenant (e.g. ib.capabble.cloud), so resolve-tenant and admin auth work from tenant app.
    if (!resolution.isPlatformHost && !resolution.isLocalHost && !isRequestToRootApiHost) {
      return res.status(404).json({
        success: false,
        message: 'Platform admin routes are not available on tenant API hosts',
      });
    }

    await connectPlatformDB();
    req.platformModels = getPlatformModels();

    setRequestContext({
      scope: 'platform',
      platformModels: req.platformModels,
    });

    return next();
  } catch (error) {
    return next(error);
  }
};

const tenantContextMiddleware = async (req, res, next) => {
  try {
    const resolution = resolveTenantFromRequest(req);

    if (!resolution.tenantSlug) {
      console.warn(
        `[tenant-context] tenant resolution failed ${JSON.stringify(
          buildTenantResolutionDebugContext(req, resolution)
        )}`
      );

      return res.status(400).json({
        success: false,
        message: 'Unable to identify user account. Please try again.',
      });
    }

    await connectPlatformDB();
    const { Tenant } = getPlatformModels();
    const tenantRecord = await Tenant.findOne({ slug: resolution.tenantSlug }).lean();

    if (!tenantRecord) {
      return res.status(404).json({
        success: false,
        message: 'User account not found',
      });
    }

    if (tenantRecord.status !== TENANT_STATUS.ACTIVE) {
      return res.status(403).json({
        success: false,
        message: 'User account is not active',
      });
    }

    const featureToggles = normalizeTenantFeatureToggles(tenantRecord.featureToggles);
    const modelKeys = getActiveModelKeys(featureToggles);
    const { connection, models } = getTenantConnectionAndModels(tenantRecord.dbName, modelKeys);

    req.tenant = {
      id: tenantRecord._id,
      slug: tenantRecord.slug,
      name: tenantRecord.name,
      adminEmail: tenantRecord.adminEmail,
      dbName: tenantRecord.dbName,
      status: tenantRecord.status,
      featureToggles,
      source: resolution.source,
      host: resolution.host,
    };

    req.models = models;
    req.tenantConnection = connection;

    setRequestContext({
      scope: 'tenant',
      tenant: req.tenant,
      models,
    });

    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  platformContextMiddleware,
  tenantContextMiddleware,
};
