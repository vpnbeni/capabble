const { roleHasPermission, CPITL_PERMISSIONS } = require('../modules/cpitl/constants');

const requireCpitlPermission = (permission) => {
  return (req, res, next) => {
    const role = req.user?.role;
    if (!roleHasPermission(role, permission)) {
      return res.status(403).json({
        success: false,
        message: `Permission '${permission}' is required for this action.`,
        permission,
      });
    }
    return next();
  };
};

module.exports = {
  requireCpitlPermission,
  CPITL_PERMISSIONS,
};
