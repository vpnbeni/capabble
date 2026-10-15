const { protect } = require('../middleware/auth');
const { routeAccessGate } = require('./middleware');

/**
 * Tenant API routes reachable without signing in. Everything else under /api
 * (tenant-scoped) is authenticated and permission-checked here, so a route file
 * that forgets `protect` can no longer expose data.
 */
const PUBLIC_ROUTES = [
  ['POST', '/auth/login'],
  ['POST', '/auth/refresh'],
  ['POST', '/auth/logout'],
  ['POST', '/auth/forgot-password'],
  ['POST', '/auth/forgot-password/resend-otp'],
  ['POST', '/auth/reset-password'],
  ['POST', '/auth/verify-email'],
  ['POST', '/auth/resend-email-verification'],
  ['POST', '/auth/accept-invite'],
  ['POST', '/auth/invite/preview']
];

const isPublicRoute = (method, path) => {
  const normalizedPath = path.length > 1 ? path.replace(/\/+$/, '') : path;
  return PUBLIC_ROUTES.some(([m, p]) => m === method && p === normalizedPath);
};

const tenantAccessGate = (req, res, next) => {
  if (req.method === 'OPTIONS' || isPublicRoute(req.method, req.path)) return next();

  return protect(req, res, (error) => {
    if (error) return next(error);
    return routeAccessGate(req, res, next);
  });
};

module.exports = { tenantAccessGate, isPublicRoute, PUBLIC_ROUTES };
