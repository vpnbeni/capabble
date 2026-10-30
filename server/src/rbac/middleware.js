const { resolveRouteRequirement } = require('./catalog');
const { AUDIENCE } = require('./session');

const forbidden = (res, message, extra = {}) => res.status(403).json({
  success: false,
  message,
  error: message,
  ...extra
});

/**
 * Require one of the given permissions (any-of). Use on individual routes for
 * actions finer than the route-level read/write mapping.
 */
const requirePermission = (...keys) => {
  const required = keys.flat();
  return (req, res, next) => {
    if (req.rbac?.hasAny(required)) return next();
    return forbidden(res, 'You do not have permission to do this.', {
      errorCode: 'permission_denied',
      permission: required.length === 1 ? required[0] : required
    });
  };
};

/** Only allow requests from the given audience (staff panel or parent/student portal). */
const requireAudience = (audience) => (req, res, next) => {
  if (req.auth?.audience === audience) return next();
  return forbidden(res, 'This area is not available for your account.', { errorCode: 'wrong_audience' });
};

/**
 * Central access gate for every tenant API route after authentication.
 * Deny by default: a staff request must match a rule in the permission
 * catalog and hold the permission that rule names. Administrators pass
 * unmatched routes so a newly added route never locks the school out, but it is
 * logged so the catalog can be updated.
 */
const routeAccessGate = (req, res, next) => {
  const { path } = req;

  // Account endpoints (me, logout, change password) are open to any signed-in user.
  if (path === '/auth' || path.startsWith('/auth/')) return next();

  if (req.user?.mustChangePassword && !req.auth?.viewAs) {
    return forbidden(res, 'Set a new password to continue.', { errorCode: 'password_change_required' });
  }

  const isPortalPath = path === '/portal' || path.startsWith('/portal/');
  if (req.auth?.audience === AUDIENCE.PORTAL) {
    return isPortalPath
      ? next()
      : forbidden(res, 'This area is not available for your account.', { errorCode: 'wrong_audience' });
  }
  if (isPortalPath) {
    return forbidden(res, 'The family portal is only for parent and student accounts.', {
      errorCode: 'wrong_audience'
    });
  }

  const { rbac } = req;
  if (!rbac) return forbidden(res, 'You do not have permission to do this.', { errorCode: 'permission_denied' });

  const requirement = resolveRouteRequirement(req.method, path);

  if (!requirement) {
    if (rbac.isAdmin) {
      console.warn(`[rbac] no permission rule for ${req.method} /api${path}; allowed for administrator only`);
      return next();
    }
    return forbidden(res, 'You do not have permission to do this.', { errorCode: 'permission_denied' });
  }

  if (requirement.staff) return next();
  if (requirement.anyOfResource && rbac.hasAnyOnResource(requirement.anyOfResource)) return next();
  if (requirement.anyOf && rbac.hasAny(requirement.anyOf)) return next();

  return forbidden(res, 'You do not have permission to do this.', {
    errorCode: 'permission_denied',
    permission: requirement.anyOf?.length === 1
      ? requirement.anyOf[0]
      : requirement.anyOf || requirement.anyOfResource
  });
};

module.exports = {
  requirePermission,
  requireAudience,
  routeAccessGate
};
