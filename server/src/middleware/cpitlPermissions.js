const { CPITL_PERMISSIONS } = require('../modules/cpitl/constants');
const { requirePermission } = require('../rbac/middleware');

/** cpitl:collect → cpitl.finance.collect (see packages/shared/src/permissionCatalog.json). */
const toCatalogKey = (permission) => `cpitl.finance.${String(permission).replace(/^cpitl:/, '')}`;

const requireCpitlPermission = (permission) => requirePermission(toCatalogKey(permission));

module.exports = {
  requireCpitlPermission,
  CPITL_PERMISSIONS,
  toCatalogKey
};
