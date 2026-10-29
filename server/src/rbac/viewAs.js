/**
 * Seeing the app as another login, in two modes. Both are started from Users and
 * access and kept in an httpOnly cookie (`cb_va`) naming who started it and the
 * person; the starter's own session cookies stay as they are. On each request, if
 * that cookie belongs to the signed-in starter, the request runs as the person:
 * their permissions, classes and linked children. Both end by themselves after
 * VIEW_AS_MINUTES, or with DELETE /api/auth/view-as.
 *
 * - "view" (POST /api/users/:id/view-as): any administrator, read-only. Every
 *   write is refused except stopping and signing out. Never as another
 *   administrator, an inactive login or yourself.
 * - "switch" (POST /api/users/:id/switch): for testing. Only the school owner
 *   (the login whose email created the school, `tenant.adminEmail`), and only
 *   when the platform admin turned on `allowUserSwitching` for that school.
 *   Any login but your own; changes are saved as the person and each one is
 *   recorded in the activity log as done by the owner. Password changes,
 *   phone registration and starting another switch stay refused.
 */
const jwt = require('jsonwebtoken');
const { isAdministrator } = require('./permissions');

const VIEW_AS_COOKIE = 'cb_va';
const VIEW_AS_MINUTES = 30;

const MODES = Object.freeze({ VIEW: 'view', SWITCH: 'switch' });

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// Writes that stay open while viewing as someone: stopping, and signing out.
const ALLOWED_WRITES = [
  ['DELETE', '/auth/view-as'],
  ['POST', '/auth/logout']
];
// Writes refused even while switched: the person's own password and phones, and
// starting another view or switch from inside this one.
const SWITCH_REFUSED = [
  (path) => path === '/auth/change-password',
  (path) => path === '/devices' || path.startsWith('/devices/') || path.startsWith('/portal/devices'),
  (path) => /^\/users\/[^/]+\/(view-as|switch)$/.test(path)
];

const getSecret = () => process.env.JWT_SECRET;

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/'
});

/** The login that created the school (its email is the tenant's adminEmail). */
const isSchoolOwner = (tenant, user) => Boolean(
  tenant?.adminEmail && user?.email && String(user.email).toLowerCase() === String(tenant.adminEmail).toLowerCase()
);

/** Whether this login may switch to others in this school (see "switch" above). */
const canSwitchUsers = (tenant, user) => Boolean(tenant?.allowUserSwitching) && isSchoolOwner(tenant, user);

/** Why `owner` can't switch to `target`, or null when they can. */
const switchRefusal = (owner, target) => {
  if (!target) return { status: 404, message: 'Login not found.', code: 'not_found' };
  if (String(target._id) === String(owner._id)) {
    return { status: 400, message: 'You’re already signed in as yourself.', code: 'view_as_self' };
  }
  if (!target.isActive) {
    const message = 'This login is turned off. Turn it on to switch to them.';
    return { status: 400, message, code: 'view_as_inactive' };
  }
  return null;
};

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

const startViewAs = (res, { admin, target, tenantSlug, mode = MODES.VIEW }) => {
  const token = jwt.sign(
    { scope: 'view_as', mode, tenantSlug, adminId: String(admin._id), targetId: String(target._id) },
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
    return {
      targetId: decoded.targetId,
      mode: decoded.mode === MODES.SWITCH ? MODES.SWITCH : MODES.VIEW,
      expiresAt: new Date(decoded.exp * 1000)
    };
  } catch (error) {
    return null;
  }
};

const requestPath = (req) => {
  const url = String(req.originalUrl || req.url || '').split('?')[0];
  const index = url.indexOf('/api/');
  return (index >= 0 ? url.slice(index + 4) : url).replace(/\/+$/, '');
};

/** True when the request changes something. */
const isWrite = (req) => UNSAFE_METHODS.has(req.method);

/** True when a request made while viewing as (or switched to) someone must be refused. */
const isBlockedWrite = (req, mode = MODES.VIEW) => {
  if (!isWrite(req)) return false;
  const path = requestPath(req);
  if (ALLOWED_WRITES.some(([method, allowed]) => method === req.method && path === allowed)) return false;
  if (mode === MODES.SWITCH) return SWITCH_REFUSED.some((refused) => refused(path));
  return true;
};

module.exports = {
  VIEW_AS_COOKIE,
  VIEW_AS_MINUTES,
  MODES,
  isSchoolOwner,
  canSwitchUsers,
  switchRefusal,
  viewAsRefusal,
  isWrite,
  requestPath,
  startViewAs,
  clearViewAsCookie,
  readViewAs,
  isBlockedWrite
};
