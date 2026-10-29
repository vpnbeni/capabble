/**
 * "View as": an administrator sees the school panel or family portal exactly as
 * another login does, without being able to change anything.
 *
 * - Started from Users and access (POST /api/users/:id/view-as). The server sets
 *   an httpOnly cookie (`cb_va`) naming the administrator and the person; the
 *   administrator's own session cookies stay as they are.
 * - On each request, if that cookie belongs to the signed-in administrator, the
 *   request runs as the person: their permissions, classes and linked children.
 * - Read-only: every write is refused except stopping (DELETE /api/auth/view-as)
 *   and signing out. Ends by itself after VIEW_AS_MINUTES.
 * - Never as another administrator, an inactive login or yourself.
 */
const jwt = require('jsonwebtoken');
const { isAdministrator } = require('./permissions');

const VIEW_AS_COOKIE = 'cb_va';
const VIEW_AS_MINUTES = 30;

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// Writes that stay open while viewing as someone: stopping, and signing out.
const ALLOWED_WRITES = [
  ['DELETE', '/auth/view-as'],
  ['POST', '/auth/logout']
];

const getSecret = () => process.env.JWT_SECRET;

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/'
});

/** Why `target` can't be viewed as by `admin`, or null when it can. */
const viewAsRefusal = (admin, target) => {
  if (!target) return { status: 404, message: 'Login not found.', code: 'not_found' };
  if (String(target._id) === String(admin._id)) {
    return { status: 400, message: 'You’re already signed in as yourself.', code: 'view_as_self' };
  }
  if (!target.isActive) {
    return { status: 400, message: 'This login is turned off. Turn it on to view as them.', code: 'view_as_inactive' };
  }
  if (isAdministrator(target)) {
    return { status: 403, message: 'You can’t view as another administrator.', code: 'view_as_admin' };
  }
  return null;
};

const startViewAs = (res, { admin, target, tenantSlug }) => {
  const token = jwt.sign(
    { scope: 'view_as', tenantSlug, adminId: String(admin._id), targetId: String(target._id) },
    getSecret(),
    { expiresIn: VIEW_AS_MINUTES * 60 }
  );
  res.cookie(VIEW_AS_COOKIE, token, { ...cookieOptions(), maxAge: VIEW_AS_MINUTES * 60 * 1000 });
  return new Date(Date.now() + VIEW_AS_MINUTES * 60 * 1000);
};

const clearViewAsCookie = (res) => {
  res.clearCookie(VIEW_AS_COOKIE, cookieOptions());
};

/** The request's view-as claim if it is valid for this administrator and school, else null. */
const readViewAs = (req, adminUser) => {
  const token = req.cookies?.[VIEW_AS_COOKIE];
  if (!token || !adminUser) return null;
  try {
    const decoded = jwt.verify(token, getSecret());
    if (decoded.scope !== 'view_as') return null;
    if (decoded.adminId !== String(adminUser._id)) return null;
    if (req.tenant && decoded.tenantSlug !== req.tenant.slug) return null;
    return { targetId: decoded.targetId, expiresAt: new Date(decoded.exp * 1000) };
  } catch (error) {
    return null;
  }
};

const requestPath = (req) => {
  const url = String(req.originalUrl || req.url || '').split('?')[0];
  const index = url.indexOf('/api/');
  return (index >= 0 ? url.slice(index + 4) : url).replace(/\/+$/, '');
};

/** True when a request made while viewing as someone would change something. */
const isBlockedWrite = (req) => {
  if (!UNSAFE_METHODS.has(req.method)) return false;
  const path = requestPath(req);
  return !ALLOWED_WRITES.some(([method, allowed]) => method === req.method && path === allowed);
};

module.exports = {
  VIEW_AS_COOKIE,
  VIEW_AS_MINUTES,
  viewAsRefusal,
  startViewAs,
  clearViewAsCookie,
  readViewAs,
  isBlockedWrite
};
