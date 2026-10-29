process.env.JWT_SECRET = process.env.JWT_SECRET || 'rbac-access-secret-test';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'rbac-refresh-secret-test';

jest.mock('../../models/User', () => ({ findById: jest.fn(), getActiveModel: jest.fn(() => null) }));
jest.mock('../../utils/mailer', () => ({ sendMail: jest.fn() }));
jest.mock('../../services/billingServiceClient', () => ({ getTenantEntitlement: jest.fn().mockResolvedValue({}) }));

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { protectTenant } = require('../../middleware/auth');
const { startViewingAs } = require('../../controllers/userAdminController');
const { VIEW_AS_COOKIE, viewAsRefusal, isBlockedWrite } = require('../viewAs');
const { PermissionSet } = require('../permissions');

const adminId = new mongoose.Types.ObjectId();
const teacherId = new mongoose.Types.ObjectId();
const parentId = new mongoose.Types.ObjectId();
const otherAdminId = new mongoose.Types.ObjectId();

const person = (id, extra) => ({
  _id: id,
  kind: 'staff',
  isActive: true,
  tokenVersion: 0,
  changedPasswordAfter: () => false,
  ...extra
});
const people = {
  [adminId]: person(adminId, { name: 'Head', roles: ['administrator'] }),
  [teacherId]: person(teacherId, { name: 'Anuj', roles: ['exam_coordinator'] }),
  [parentId]: person(parentId, { name: 'Parent', kind: 'parent', linkedStudents: [] }),
  [otherAdminId]: person(otherAdminId, { name: 'Other head', roles: ['administrator'] })
};

const createRes = () => {
  const res = { cookies: {} };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn((name, value) => { res.cookies[name] = value; return res; });
  res.clearCookie = jest.fn().mockReturnValue(res);
  return res;
};

const audienceOf = (id) => (people[id].kind === 'staff' ? 'staff' : 'portal');
const accessToken = (id) => jwt.sign(
  { id: String(id), tenantSlug: 'alpha', scope: 'tenant', aud: audienceOf(id), tv: 0 },
  process.env.JWT_SECRET,
  { expiresIn: '5m' }
);
const viewAsToken = ({ admin = adminId, target = teacherId, tenantSlug = 'alpha', expiresIn = '30m' } = {}) => jwt.sign(
  { scope: 'view_as', tenantSlug, adminId: String(admin), targetId: String(target) },
  process.env.JWT_SECRET,
  { expiresIn }
);

const buildReq = ({ as = adminId, viewAs, method = 'GET', url = '/api/students' } = {}) => ({
  method,
  originalUrl: url,
  headers: { 'x-requested-with': 'XMLHttpRequest' },
  cookies: { cb_at: accessToken(as), ...(viewAs ? { [VIEW_AS_COOKIE]: viewAs } : {}) },
  tenant: { slug: 'alpha' },
  auth: null,
  models: {
    User: {
      findById: jest.fn((id) => ({ select: jest.fn().mockResolvedValue(people[id] || null) })),
      db: { name: 'test-db' },
      collection: { indexes: jest.fn().mockResolvedValue([]) },
      createIndexes: jest.fn().mockResolvedValue(undefined)
    }
  }
});

const flush = () => new Promise((resolve) => { setTimeout(resolve, 20); });

const run = async (req) => {
  const res = createRes();
  const next = jest.fn();
  protectTenant(req, res, next);
  await flush();
  return { res, passed: next.mock.calls.length === 1 };
};

describe('view as: requests', () => {
  it('runs the request as the person, with their permissions', async () => {
    const req = buildReq({ viewAs: viewAsToken() });
    const { passed } = await run(req);
    expect(passed).toBe(true);
    expect(String(req.user._id)).toBe(String(teacherId));
    expect(req.rbac.isAdmin).toBe(false);
    expect(String(req.auth.viewAs.by._id)).toBe(String(adminId));
    expect(req.auth.audience).toBe('staff');
  });

  it('uses the family portal audience for a parent', async () => {
    const req = buildReq({ viewAs: viewAsToken({ target: parentId }) });
    await run(req);
    expect(req.auth.audience).toBe('portal');
  });

  it('refuses every write except stopping and signing out', async () => {
    const blocked = await run(buildReq({ viewAs: viewAsToken(), method: 'POST', url: '/api/students' }));
    expect(blocked.passed).toBe(false);
    expect(blocked.res.status).toHaveBeenCalledWith(403);
    expect(blocked.res.json).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'view_as_read_only' }));

    const stop = await run(buildReq({ viewAs: viewAsToken(), method: 'DELETE', url: '/api/auth/view-as' }));
    expect(stop.passed).toBe(true);
    const signOut = await run(buildReq({ viewAs: viewAsToken(), method: 'POST', url: '/api/auth/logout' }));
    expect(signOut.passed).toBe(true);
  });

  it('ignores a claim made for another administrator, school or an expired one', async () => {
    const claims = [
      viewAsToken({ admin: otherAdminId }),
      viewAsToken({ tenantSlug: 'beta' }),
      viewAsToken({ expiresIn: -10 })
    ];
    const reqs = claims.map((viewAs) => buildReq({ viewAs }));
    await Promise.all(reqs.map(run));
    reqs.forEach((req) => {
      expect(String(req.user._id)).toBe(String(adminId));
      expect(req.auth.viewAs).toBeUndefined();
    });
  });

  it('ignores the claim once the viewer is no longer an administrator', async () => {
    const req = buildReq({ as: teacherId, viewAs: viewAsToken({ admin: teacherId, target: parentId }) });
    await run(req);
    expect(String(req.user._id)).toBe(String(teacherId));
  });

  it('never runs as another administrator', async () => {
    const req = buildReq({ viewAs: viewAsToken({ target: otherAdminId }) });
    await run(req);
    expect(String(req.user._id)).toBe(String(adminId));
  });
});

describe('view as: starting', () => {
  const startReq = ({ rbac, target }) => ({
    params: { id: String(target) },
    user: people[adminId],
    rbac,
    tenant: { slug: 'alpha' },
    headers: {},
    models: {
      User: { findById: jest.fn().mockResolvedValue(people[target] || null) },
      AuthAuditLog: { create: jest.fn().mockResolvedValue({}) }
    }
  });

  it('sets the cookie and records it for an administrator', async () => {
    const req = startReq({ rbac: new PermissionSet([{ key: '*' }]), target: teacherId });
    const res = createRes();
    startViewingAs(req, res, jest.fn());
    await flush();
    expect(res.cookies[VIEW_AS_COOKIE]).toBeTruthy();
    expect(req.models.AuthAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ event: 'view_as_started' }));
  });

  it('is refused to anyone who is not an administrator', async () => {
    const req = startReq({ rbac: new PermissionSet([{ key: 'core.users.manage' }]), target: teacherId });
    const res = createRes();
    startViewingAs(req, res, jest.fn());
    await flush();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('explains who cannot be viewed as', () => {
    const admin = people[adminId];
    expect(viewAsRefusal(admin, people[otherAdminId]).code).toBe('view_as_admin');
    expect(viewAsRefusal(admin, admin).code).toBe('view_as_self');
    expect(viewAsRefusal(admin, { ...people[teacherId], isActive: false }).code).toBe('view_as_inactive');
    expect(viewAsRefusal(admin, null).code).toBe('not_found');
    expect(viewAsRefusal(admin, people[parentId])).toBeNull();
  });

  it('treats only reads as safe', () => {
    expect(isBlockedWrite({ method: 'GET', originalUrl: '/api/students' })).toBe(false);
    expect(isBlockedWrite({ method: 'PATCH', originalUrl: '/api/users/1' })).toBe(true);
    expect(isBlockedWrite({ method: 'DELETE', originalUrl: '/api/auth/view-as?x=1' })).toBe(false);
  });
});
