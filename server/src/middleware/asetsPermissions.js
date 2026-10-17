const { ASETS_PERMISSIONS } = require('../modules/asets/lifecycle');
const { requirePermission } = require('../rbac/middleware');

/** ASETS_VIEW → asets.assets.view (see packages/shared/src/permissionCatalog.json). */
const toCatalogKey = (permission) => `asets.assets.${String(permission).replace(/^ASETS_/, '').toLowerCase()}`;

const requireAsetsPermission = (permission) => requirePermission(toCatalogKey(permission));

module.exports = {
  requireAsetsPermission,
  ASETS_PERMISSIONS,
  toCatalogKey
};
