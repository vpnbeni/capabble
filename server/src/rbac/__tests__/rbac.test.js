jest.mock('../../utils/pdfGenerator', () => ({ generatePDF: jest.fn(async () => Buffer.from('%PDF')) }));
jest.mock('puppeteer', () => ({ launch: jest.fn() }));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'rbac-access-secret-test';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'rbac-refresh-secret-test';

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const featureCatalog = require('../../constants/tenantFeatureCatalog.json');
const {
  catalog,
  resolveRouteRequirement,
  isKnownPermission,
  roleTemplates,
  suggestRoleForDesignation
} = require('../catalog');
const { PermissionSet, resolvePermissionSet, getRoleKeys } = require('../permissions');
const { routeAccessGate, requirePermission } = require('../middleware');
const { isPublicRoute } = require('../gate');
const {
  issueSession,
  rotateSession,
  verifyRefreshCookie,
  revokeAllSessions,
  AUDIENCE
} = require('../session');
const {
  normalizeClassName,
  classNameRegex,
  buildSectionFilter,
  canAccessSection,
  withScope
} = require('../scope');

const createRes = () => {
  const res = { cookies: {}, cleared: [] };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn((name, value) => { res.cookies[name] = value; return res; });
  res.clearCookie = jest.fn((name) => { res.cleared.push(name); return res; });
  return res;
};

const staffReq = (grants, overrides = {}) => ({
  method: 'GET',
  path: '/students',
  user: { _id: 'u1', kind: 'staff' },
  auth: { audience: AUDIENCE.STAFF },
  rbac: new PermissionSet(grants),
  ...overrides
});

const runGate = (req) => {
  const res = createRes();
  const next = jest.fn();
  routeAccessGate(req, res, next);
  return { res, next, allowed: next.mock.calls.length === 1 };
};

describe('permission catalog', () => {
  it('only names resources that exist', () => {
    const resourceKeys = new Set(catalog.resources.map((r) => r.key));
    catalog.routes.filter((rule) => rule.resource).forEach((rule) => {
      expect(resourceKeys.has(rule.resource)).toBe(true);
    });
    catalog.routes.filter((rule) => rule.permission).forEach((rule) => {
      [].concat(rule.permission).forEach((key) => expect(isKnownPermission(key)).toBe(true));
    });
  });

  it('role templates only use known permissions', () => {
    catalog.roleTemplates.forEach((template) => {
      template.permissions.forEach((entry) => {
        expect(isKnownPermission(typeof entry === 'string' ? entry : entry.key)).toBe(true);
      });
    });
  });

  it('maps every client feature to a permission (or explicitly none)', () => {
    featureCatalog.forEach((feature) => {
      expect(Object.prototype.hasOwnProperty.call(catalog.features, feature.key)).toBe(true);
      [].concat(catalog.features[feature.key] || []).forEach((key) => expect(isKnownPermission(key)).toBe(true));
    });
  });

  it('derives the action from the HTTP method', () => {
    expect(resolveRouteRequirement('GET', '/students')).toMatchObject({ anyOf: ['stdnt.students.read'] });
    expect(resolveRouteRequirement('PUT', '/students/abc')).toMatchObject({ anyOf: ['stdnt.students.write'] });
    expect(resolveRouteRequirement('DELETE', '/students/abc')).toMatchObject({ anyOf: ['stdnt.students.delete'] });
    expect(resolveRouteRequirement('POST', '/students/bulk-delete')).toMatchObject({ anyOf: ['stdnt.students.delete'] });
    expect(resolveRouteRequirement('POST', '/users')).toMatchObject({ anyOf: ['core.users.manage'] });
    expect(resolveRouteRequirement('GET', '/sessions')).toMatchObject({ staff: true });
    // Entering an existing session is open to staff; the controller guards creating one.
    expect(resolveRouteRequirement('POST', '/sessions')).toMatchObject({ staff: true });
    expect(resolveRouteRequirement('POST', '/sessions/2026-2027/carry-forward')).toMatchObject({ anyOf: ['core.school.write'] });
    expect(resolveRouteRequirement('GET', '/asets/assets')).toMatchObject({ anyOfResource: 'asets.assets' });
    expect(resolveRouteRequirement('GET', '/nowhere')).toBeNull();
  });

  it('suggests a role from a designation', () => {
    expect(suggestRoleForDesignation('PGT Chemistry')).toBe('subject_teacher');
    expect(suggestRoleForDesignation('Accountant')).toBe('accountant');
    expect(suggestRoleForDesignation('')).toBeNull();
  });
});

describe('route coverage', () => {
  it('every mounted tenant route prefix has a permission rule', () => {
    const { modules } = require('../../modules');
    const prefixes = [];
    const fakeRouter = { use: (prefix) => { if (typeof prefix === 'string') prefixes.push(prefix); } };
    modules.forEach((mod) => mod.mountRoutes(fakeRouter));

    // Account and portal routes are guarded by the gate itself, not the catalog.
    const exempt = new Set(['/auth', '/portal']);
    const uncovered = prefixes
      .filter((prefix) => !exempt.has(prefix))
      .filter((prefix) => !catalog.routes.some((rule) => rule.prefix === prefix));
    expect(uncovered).toEqual([]);
  });
});

describe('roles', () => {
  it('maps legacy single roles onto templates', () => {
    expect(getRoleKeys({ role: 'admin' })).toEqual(['administrator']);
    expect(getRoleKeys({ role: 'data_entry_operator' })).toEqual(['office_staff']);
    expect(getRoleKeys({ kind: 'parent', roles: ['administrator'] })).toEqual([]);
  });

  it('unions role grants and keeps the broader scope', async () => {
    const set = await resolvePermissionSet({ kind: 'staff', roles: ['class_teacher', 'principal'] });
    expect(set.scopeOf('stdnt.students.read')).toBe('all');
    expect(set.has('exam.results.write')).toBe(true);
    expect(set.has('core.users.manage')).toBe(false);
  });

  it('loads custom roles from the tenant', async () => {
    const id = new mongoose.Types.ObjectId();
    const RoleModel = {
      find: jest.fn().mockReturnValue({
        select: () => ({ lean: () => Promise.resolve([{ permissions: [{ key: 'mdcl.clinic.read' }, { key: 'bogus.key' }] }]) })
      })
    };
    const set = await resolvePermissionSet({ kind: 'staff', roles: [`custom:${id}`] }, RoleModel);
    expect(set.has('mdcl.clinic.read')).toBe(true);
    expect(set.has('bogus.key')).toBe(false);
  });

  it('gives the administrator everything', async () => {
    const set = await resolvePermissionSet({ kind: 'staff', roles: ['administrator'] });
    expect(set.isAdmin).toBe(true);
    expect(set.has('cpitl.finance.payroll')).toBe(true);
    expect(roleTemplates.get('administrator').locked).toBe(true);
  });
});

describe('tenant access gate', () => {
  it('lets staff through only with the mapped permission', () => {
    expect(runGate(staffReq([{ key: 'stdnt.students.read', scope: 'all' }])).allowed).toBe(true);
    expect(runGate(staffReq([{ key: 'stdnt.students.read', scope: 'all' }], { method: 'DELETE', path: '/students/1' })).allowed).toBe(false);
    expect(runGate(staffReq([{ key: 'mdcl.clinic.read', scope: 'all' }])).allowed).toBe(false);
  });

  it('denies unmapped routes to everyone but administrators', () => {
    expect(runGate(staffReq([{ key: 'stdnt.students.read', scope: 'all' }], { path: '/new-module' })).allowed).toBe(false);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(runGate(staffReq([{ key: '*', scope: 'all' }], { path: '/new-module' })).allowed).toBe(true);
  });

  it('keeps portal sessions inside /portal', () => {
    const portal = { user: { kind: 'parent' }, auth: { audience: AUDIENCE.PORTAL }, rbac: new PermissionSet() };
    expect(runGate({ ...portal, method: 'GET', path: '/students' }).allowed).toBe(false);
    expect(runGate({ ...portal, method: 'GET', path: '/portal/home' }).allowed).toBe(true);
    expect(runGate({ ...portal, method: 'GET', path: '/auth/me' }).allowed).toBe(true);
  });

  it('keeps staff out of the portal, even administrators', () => {
    expect(runGate(staffReq([{ key: '*', scope: 'all' }], { path: '/portal/home' })).allowed).toBe(false);
  });

  it('blocks everything but account routes until a temporary password is changed', () => {
    const req = staffReq([{ key: '*', scope: 'all' }]);
    req.user.mustChangePassword = true;
    const { allowed, res } = runGate(req);
    expect(allowed).toBe(false);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'password_change_required' }));
    expect(runGate({ ...req, path: '/auth/change-password' }).allowed).toBe(true);
  });

  it('lists only sign-in endpoints as public', () => {
    expect(isPublicRoute('POST', '/auth/login')).toBe(true);
    expect(isPublicRoute('POST', '/auth/register')).toBe(false);
    expect(isPublicRoute('GET', '/auth/me')).toBe(false);
    expect(isPublicRoute('GET', '/admit-cards/design')).toBe(false);
  });

  it('requirePermission checks any-of', () => {
    const res = createRes();
    const next = jest.fn();
    requirePermission('a.b.c', 'exam.results.write')(staffReq([{ key: 'exam.results.write', scope: 'assigned' }]), res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('sessions', () => {
  const makeUser = () => ({
    _id: new mongoose.Types.ObjectId(),
    kind: 'staff',
    tokenVersion: 0,
    refreshTokens: [],
    save: jest.fn().mockResolvedValue(undefined)
  });
  const req = { headers: { 'user-agent': 'jest' }, ip: '127.0.0.1' };

  it('issues httpOnly cookies and stores only a hash', async () => {
    const user = makeUser();
    const res = createRes();
    const access = await issueSession({ req, res, user, tenantSlug: 'alpha' });

    expect(jwt.decode(access)).toMatchObject({ aud: 'staff', tv: 0, tenantSlug: 'alpha' });
    expect(res.cookie).toHaveBeenCalledWith('cb_at', access, expect.objectContaining({ httpOnly: true, sameSite: 'strict' }));
    const refresh = res.cookies.cb_rt;
    expect(refresh).toBeTruthy();
    expect(JSON.stringify(user.refreshTokens)).not.toContain(verifyRefreshCookie(refresh).jti);
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const user = makeUser();
    const first = createRes();
    await issueSession({ req, res: first, user, tenantSlug: 'alpha' });
    const original = verifyRefreshCookie(first.cookies.cb_rt);

    const second = createRes();
    const rotated = await rotateSession({ req, res: second, user, decoded: original, tenantSlug: 'alpha' });
    expect(rotated.status).toBe('rotated');
    expect(second.cookies.cb_rt).not.toEqual(first.cookies.cb_rt);

    // Within the grace window (parallel tabs) the old token still yields an access token.
    const grace = await rotateSession({ req, res: createRes(), user, decoded: original, tenantSlug: 'alpha' });
    expect(grace.status).toBe('grace');

    // After the grace window the old token is treated as stolen: the family ends.
    user.refreshTokens.forEach((entry) => {
      if (entry.revokedAt) entry.revokedAt = new Date(Date.now() - 60 * 1000);
    });
    const reuse = await rotateSession({ req, res: createRes(), user, decoded: original, tenantSlug: 'alpha' });
    expect(reuse.status).toBe('reuse');
    const latest = verifyRefreshCookie(second.cookies.cb_rt);
    const afterReuse = await rotateSession({ req, res: createRes(), user, decoded: latest, tenantSlug: 'alpha' });
    expect(afterReuse.status).toBe('invalid');
  });

  it('revokeAllSessions clears refresh tokens and bumps the token version', () => {
    const user = { refreshTokens: [{ tokenHash: 'x' }], tokenVersion: 3 };
    revokeAllSessions(user);
    expect(user.refreshTokens).toEqual([]);
    expect(user.tokenVersion).toBe(4);
  });
});

describe('authenticateTenant', () => {
  const { authenticateTenant } = require('../../middleware/auth');
  const userId = new mongoose.Types.ObjectId();
  const buildReq = ({ token, user, method = 'GET', headers = {} }) => ({
    method,
    headers,
    cookies: { cb_at: token },
    tenant: { slug: 'alpha' },
    models: {
      User: {
        findById: jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(user) }),
        db: { name: 'test-db' },
        collection: { indexes: jest.fn().mockResolvedValue([]) },
        createIndexes: jest.fn().mockResolvedValue(undefined)
      }
    }
  });
  const baseUser = () => ({
    _id: userId,
    kind: 'staff',
    isActive: true,
    tokenVersion: 2,
    changedPasswordAfter: () => false
  });
  const sign = (payload) => jwt.sign({ id: userId.toString(), tenantSlug: 'alpha', scope: 'tenant', aud: 'staff', tv: 2, ...payload }, process.env.JWT_SECRET, { expiresIn: '5m' });

  it('accepts a current token', async () => {
    const result = await authenticateTenant(buildReq({ token: sign({}), user: baseUser() }));
    expect(result.error).toBeUndefined();
    expect(result.audience).toBe('staff');
  });

  it('rejects a token issued before the token version changed', async () => {
    const result = await authenticateTenant(buildReq({ token: sign({ tv: 1 }), user: baseUser() }));
    expect(result.errorCode).toBe('token_revoked');
  });

  it('rejects a token issued before a password change', async () => {
    const user = { ...baseUser(), changedPasswordAfter: () => true };
    const result = await authenticateTenant(buildReq({ token: sign({}), user }));
    expect(result.errorCode).toBe('token_revoked');
  });

  it('rejects deactivated users', async () => {
    const result = await authenticateTenant(buildReq({ token: sign({}), user: { ...baseUser(), isActive: false } }));
    expect(result.errorCode).toBe('user_inactive');
  });

  it('rejects a staff token for an account that is now a portal account', async () => {
    const result = await authenticateTenant(buildReq({ token: sign({}), user: { ...baseUser(), kind: 'parent' } }));
    expect(result.errorCode).toBe('token_revoked');
  });

  it('requires the CSRF header on cookie-authenticated writes', async () => {
    const blocked = await authenticateTenant(buildReq({ token: sign({}), user: baseUser(), method: 'POST' }));
    expect(blocked.errorCode).toBe('csrf_check_failed');
    const allowed = await authenticateTenant(buildReq({
      token: sign({}), user: baseUser(), method: 'POST', headers: { 'x-requested-with': 'XMLHttpRequest' }
    }));
    expect(allowed.error).toBeUndefined();
  });
});

describe('assigned scope', () => {
  const teacherReq = (scope, sections) => ({
    user: { assignedSections: sections, teacher: null },
    models: {},
    rbac: new PermissionSet([{ key: 'stdnt.students.read', scope }])
  });

  it('normalises class names written different ways', () => {
    expect(normalizeClassName('Class 10th')).toBe('10');
    expect(normalizeClassName('X')).toBe('10');
    expect(normalizeClassName('10')).toBe('10');
    expect(classNameRegex('10').test('10th')).toBe(true);
    expect(classNameRegex('10').test('Class X')).toBe(true);
    expect(classNameRegex('1').test('10th')).toBe(false);
  });

  it('builds no filter for full access and a section filter for assigned access', async () => {
    expect(await buildSectionFilter(teacherReq('all', []), 'stdnt.students.read')).toBeNull();
    const filter = await buildSectionFilter(teacherReq('assigned', [{ className: '10th', section: 'a' }]), 'stdnt.students.read');
    expect(filter.$or).toHaveLength(1);
    const nothing = await buildSectionFilter(teacherReq('assigned', []), 'stdnt.students.read');
    expect(nothing).toEqual({ _id: { $exists: false } });
  });

  it('checks one section', async () => {
    const req = teacherReq('assigned', [{ className: '10', section: 'A' }]);
    expect(await canAccessSection(req, 'stdnt.students.read', '10th', 'a')).toBe(true);
    expect(await canAccessSection(req, 'stdnt.students.read', '10th', 'B')).toBe(false);
  });

  it('nests scope under $and so it never clashes with the session $or', () => {
    expect(withScope({ isActive: true }, { $or: [{ a: 1 }] })).toEqual({ isActive: true, $and: [{ $or: [{ a: 1 }] }] });
  });
});

describe('portal student resolution', () => {
  const { loadLinkedStudent } = require('../../controllers/portalController');
  const mine = new mongoose.Types.ObjectId();
  const other = new mongoose.Types.ObjectId();
  const buildReq = (studentId) => ({
    params: { studentId: String(studentId) },
    user: { kind: 'parent', linkedStudents: [{ student: mine, rollNumber: 'A100' }] },
    models: {
      Student: {
        findOne: jest.fn().mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ _id: mine, rollNumber: 'A100' }) }) }),
        findById: jest.fn().mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) })
      }
    }
  });
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  it('returns 404 for a student who is not the family\'s own', async () => {
    const res = createRes();
    const next = jest.fn();
    loadLinkedStudent(buildReq(other), res, next);
    await flush();
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('loads a linked student', async () => {
    const req = buildReq(mine);
    const next = jest.fn();
    loadLinkedStudent(req, createRes(), next);
    await flush();
    expect(next).toHaveBeenCalled();
    expect(req.portalStudent.rollNumber).toBe('A100');
  });
});
