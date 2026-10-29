const asyncHandler = require('./asyncHandler');
const {
  getTokenFromRequest,
  verifyTenantToken,
  verifyPlatformToken,
} = require('../utils/jwt');
const { getRequestContext, setRequestContext } = require('../tenancy/requestContext');
const { audienceFor, AUDIENCE } = require('../rbac/session');
const { resolvePermissionSet, PermissionSet } = require('../rbac/permissions');
const { ensureUserIndexes } = require('../rbac/userIndexes');
const { getPlatformModels } = require('../tenancy/platformModels');
const {
  MODES: VIEW_AS_MODES,
  readViewAs,
  viewAsRefusal,
  switchRefusal,
  canSwitchUsers,
  isBlockedWrite,
  isWrite,
  requestPath
} = require('../rbac/viewAs');
const { recordAuthEvent } = require('../rbac/audit');

const unauthorized = (res, message = 'Not authorized to access this route') => {
  return res.status(401).json({
    success: false,
    error: message,
  });
};

const getTenantUserModel = (req) => {
  if (req.models?.User) {
    return req.models.User;
  }

  const context = getRequestContext();
  return context?.models?.User || null;
};

const getPlatformAdminModel = (req) => {
  if (req.platformModels?.PlatformAdmin) {
    return req.platformModels.PlatformAdmin;
  }

  const context = getRequestContext();
  if (context?.platformModels?.PlatformAdmin) {
    return context.platformModels.PlatformAdmin;
  }

  return getPlatformModels().PlatformAdmin;
};

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Authenticate a tenant request and attach `req.user`, `req.auth` and, for
 * staff, `req.rbac` (their effective permissions). Rejects tokens issued
 * before the user's last password change or token-version bump, so password
 * resets, role changes and deactivation cut access immediately.
 */
const authenticateTenant = async (req) => {
  const { token, source } = getTokenFromRequest(req, { withSource: true });
  if (!token) return { error: 'Not authorized to access this route' };

  let decoded;
  try {
    decoded = verifyTenantToken(token);
  } catch (error) {
    return { error: 'Session expired', errorCode: 'token_expired' };
  }

  if (req.tenant && decoded.tenantSlug !== req.tenant.slug) {
    return { error: 'Token tenant does not match request tenant' };
  }

  // Cookie-authenticated writes must come from our own front-end (a custom
  // header forces a CORS preflight that other origins cannot pass).
  if (source === 'cookie' && UNSAFE_METHODS.has(req.method) && !req.headers['x-requested-with']) {
    return { error: 'Missing request header', status: 403, errorCode: 'csrf_check_failed' };
  }

  const User = getTenantUserModel(req);
  if (!User) return { error: 'Tenant context is missing for authenticated route', status: 500 };
  ensureUserIndexes(User);

  const user = await User.findById(decoded.id).select('-password');
  if (!user) return { error: 'No user found with this token' };
  if (!user.isActive) return { error: 'User account is deactivated', errorCode: 'user_inactive' };
  if ((decoded.tv ?? -1) !== (user.tokenVersion || 0)) {
    return { error: 'Session expired', errorCode: 'token_revoked' };
  }
  if (user.changedPasswordAfter(decoded.iat)) {
    return { error: 'Session expired', errorCode: 'token_revoked' };
  }

  const audience = audienceFor(user);
  if (decoded.aud !== audience) return { error: 'Session expired', errorCode: 'token_revoked' };

  return { user, audience, source };
};

/**
 * If an administrator is viewing as someone, or the school owner switched to
 * someone (see rbac/viewAs), run the request as that person. Viewing refuses
 * writes; a switch lets them through and records each one. An expired or
 * invalid claim, or one its starter may no longer use, is ignored and the
 * request runs as the starter.
 */
const resolveViewAs = async (req) => {
  const claim = readViewAs(req, req.user);
  if (!claim) return null;
  const switching = claim.mode === VIEW_AS_MODES.SWITCH;
  if (switching ? !canSwitchUsers(req.tenant, req.user) : !req.rbac?.isAdmin) return null;

  const User = getTenantUserModel(req);
  const target = await User.findById(claim.targetId).select('-password');
  if ((switching ? switchRefusal : viewAsRefusal)(req.user, target)) return null;

  const admin = req.user;
  const audience = audienceFor(target);
  req.user = target;
  req.auth = {
    ...req.auth,
    audience,
    viewAs: { by: admin, mode: claim.mode, expiresAt: claim.expiresAt }
  };
  req.rbac = audience === AUDIENCE.STAFF
    ? await resolvePermissionSet(target, req.models?.Role)
    : new PermissionSet();

  const name = target.name || target.email || 'this person';
  if (isBlockedWrite(req, claim.mode)) {
    return {
      blocked: switching
        ? `You can't do this while switched to ${name}. Switch back first.`
        : `You're viewing as ${name}. Stop viewing to make changes.`
    };
  }
  if (switching && isWrite(req) && requestPath(req) !== '/auth/view-as') {
    // Saved as the person; the activity log says the owner did it.
    recordAuthEvent(req, {
      event: 'switched_user_action',
      actor: admin,
      target,
      details: { method: req.method, path: requestPath(req) }
    });
  }
  return { target };
};

const protectTenant = asyncHandler(async (req, res, next) => {
  // Already authenticated by the tenant access gate.
  if (req.auth?.authenticated && req.user) return next();

  const result = await authenticateTenant(req);
  if (result.error) {
    return res.status(result.status || 401).json({
      success: false,
      error: result.error,
      message: result.error,
      ...(result.errorCode ? { errorCode: result.errorCode } : {}),
    });
  }

  req.user = result.user;
  req.auth = { authenticated: true, audience: result.audience, source: result.source };
  req.rbac = result.audience === AUDIENCE.STAFF
    ? await resolvePermissionSet(result.user, req.models?.Role)
    : new PermissionSet();

  const viewAs = await resolveViewAs(req);
  if (viewAs?.blocked) {
    return res.status(403).json({
      success: false,
      error: viewAs.blocked,
      message: viewAs.blocked,
      errorCode: 'view_as_read_only'
    });
  }

  setRequestContext({ user: req.user });
  return next();
});

const optionalAuth = asyncHandler(async (req, res, next) => {
  const result = await authenticateTenant(req).catch(() => ({ error: 'invalid' }));
  req.user = result.error ? null : result.user;
  return next();
});

const protectPlatform = asyncHandler(async (req, res, next) => {
  let token = null;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.platformToken) {
    token = req.cookies.platformToken;
  }

  if (!token) {
    return unauthorized(res);
  }

  let decoded;
  try {
    decoded = verifyPlatformToken(token);
  } catch (error) {
    return unauthorized(res);
  }

  const PlatformAdmin = getPlatformAdminModel(req);
  req.platformUser = await PlatformAdmin.findById(decoded.id).select('-password');

  if (!req.platformUser) {
    return unauthorized(res, 'Platform admin not found');
  }

  if (!req.platformUser.isActive) {
    return unauthorized(res, 'Platform admin is deactivated');
  }

  return next();
});

/**
 * @deprecated Use `requirePermission` from src/rbac/middleware. Kept for old
 * call sites: 'admin' now means "holds the Administrator role".
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (roles.includes('admin') && req.rbac?.isAdmin) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: 'You do not have permission to do this.',
      errorCode: 'permission_denied',
    });
  };
};

const ownershipOrAdmin = (resourceUserField = 'user') => {
  return (req, res, next) => {
    if (req.rbac?.isAdmin) {
      return next();
    }

    if (req.resource && req.resource[resourceUserField]) {
      if (req.resource[resourceUserField].toString() !== req.user?._id?.toString()) {
        return res.status(403).json({
          success: false,
          error: 'Not authorized to access this resource',
        });
      }
    }

    return next();
  };
};

// Backward-compatible default export for routes that import auth middleware as a function.
const auth = protectTenant;
auth.protect = protectTenant;
auth.protectTenant = protectTenant;
auth.protectPlatform = protectPlatform;
auth.authenticateTenant = authenticateTenant;
auth.optionalAuth = optionalAuth;
auth.authorize = authorize;
auth.ownershipOrAdmin = ownershipOrAdmin;

module.exports = auth;
