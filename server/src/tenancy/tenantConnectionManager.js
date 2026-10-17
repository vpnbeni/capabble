const { getPlatformConnection } = require('../config/platformDatabase');
const { registerTenantModels, getTenantModelKeys } = require('./registerTenantModels');
const { disableAutoCreate, syncExistingIndexes } = require('./lazyCollections');

const tenantRegistry = new Map();

const resolveModelKeys = (modelKeys) => {
  if (!modelKeys) {
    return getTenantModelKeys();
  }

  const keys = Array.isArray(modelKeys) ? modelKeys : [modelKeys];
  return [...new Set(keys)];
};

const getOrCreateTenantContext = (dbName) => {
  if (!dbName) {
    throw new Error('dbName is required to establish tenant connection');
  }

  if (tenantRegistry.has(dbName)) {
    return tenantRegistry.get(dbName);
  }

  const platformConnection = getPlatformConnection();
  const tenantConnection = platformConnection.useDb(dbName, { useCache: true });
  // Collections are created on first write, not when a model is loaded (see lazyCollections.js).
  disableAutoCreate(tenantConnection);
  const tenantContext = {
    connection: tenantConnection,
    models: {}
  };

  tenantRegistry.set(dbName, tenantContext);
  return tenantContext;
};

const getTenantConnectionAndModels = (dbName, modelKeys = null) => {
  const tenantContext = getOrCreateTenantContext(dbName);
  const requestedKeys = resolveModelKeys(modelKeys);
  const missingKeys = requestedKeys.filter((key) => !tenantContext.models[key]);

  if (missingKeys.length > 0) {
    const registeredModels = registerTenantModels(tenantContext.connection, missingKeys);
    Object.assign(tenantContext.models, registeredModels);
    syncExistingIndexes(tenantContext.connection, registeredModels);
  }

  const requestedModels = {};
  requestedKeys.forEach((key) => {
    requestedModels[key] = tenantContext.models[key];
  });

  return {
    connection: tenantContext.connection,
    models: requestedModels
  };
};

const clearTenantCache = () => {
  tenantRegistry.clear();
};

const removeTenantFromCache = (dbName) => {
  if (!dbName || !tenantRegistry.has(dbName)) {
    return;
  }

  tenantRegistry.delete(dbName);
};

module.exports = {
  getTenantConnectionAndModels,
  clearTenantCache,
  removeTenantFromCache
};
