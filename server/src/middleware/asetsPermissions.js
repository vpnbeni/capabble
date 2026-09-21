const { roleHasPermission, ASETS_PERMISSIONS } = require('../modules/asets/lifecycle');

const requireAsetsPermission = (permission) => {
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
  requireAsetsPermission,
  ASETS_PERMISSIONS,
};
