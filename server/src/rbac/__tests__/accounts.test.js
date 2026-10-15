process.env.JWT_SECRET = process.env.JWT_SECRET || 'rbac-access-secret-test';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'rbac-refresh-secret-test';
process.env.BCRYPT_ROUNDS = '4';

jest.mock('../../models/User', () => ({
  findOne: jest.fn(),
  getActiveModel: jest.fn(() => null)
}));
jest.mock('../../utils/mailer', () => ({ sendMail: jest.fn() }));
jest.mock('../../services/billingServiceClient', () => ({ getTenantEntitlement: jest.fn().mockResolvedValue({}) }));

const mongoose = require('mongoose');
const User = require('../../models/User');
const { login, buildLoginQuery } = require('../../controllers/authController');
const { updateUser, createUser } = require('../../controllers/userAdminController');
const { PermissionSet } = require('../permissions');

const createRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  return res;
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('login', () => {
  beforeEach(() => jest.clearAllMocks());

  it('accepts email, bare login ID and login ID with school code', () => {
    expect(buildLoginQuery('Parent@Mail.com', 'dps')).toEqual({ email: 'parent@mail.com' });
    expect(buildLoginQuery('2024017', 'dps')).toEqual({ username: '2024017' });
    expect(buildLoginQuery('2024017@dps', 'dps')).toEqual({ username: '2024017' });
    // A login ID for another school never matches here.
    expect(buildLoginQuery('2024017@other', 'dps')).toBeNull();
  });

  it('locks the account after repeated wrong passwords', async () => {
    const user = {
      _id: new mongoose.Types.ObjectId(),
      email: 'teacher@school.test',
      isActive: true,
      failedLoginCount: 4,
      lockUntil: null,
      matchPassword: jest.fn().mockResolvedValue(false),
      save: jest.fn().mockResolvedValue(undefined)
    };
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });

    const res = createRes();
    login({ body: { email: user.email, password: 'wrong' }, tenant: { slug: 'alpha' }, headers: {} }, res, jest.fn());
    await flush();

    expect(res.status).toHaveBeenCalledWith(401);
    expect(user.lockUntil).toBeInstanceOf(Date);
    expect(user.failedLoginCount).toBe(0);

    // While locked, even the right password is refused.
    user.matchPassword.mockResolvedValue(true);
    const lockedRes = createRes();
    login({ body: { email: user.email, password: 'right' }, tenant: { slug: 'alpha' }, headers: {} }, lockedRes, jest.fn());
    await flush();
    expect(lockedRes.status).toHaveBeenCalledWith(429);
    expect(lockedRes.json).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'account_locked' }));
  });

  it('gives the same answer for an unknown account and a wrong password', async () => {
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    const res = createRes();
    login({ body: { email: 'nobody@school.test', password: 'x' }, tenant: { slug: 'alpha' }, headers: {} }, res, jest.fn());
    await flush();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Incorrect email, login ID or password' }));
  });
});

describe('user administration guardrails', () => {
  const adminId = new mongoose.Types.ObjectId();
  const otherAdminId = new mongoose.Types.ObjectId();

  const buildModels = (target, { otherAdmins = 0 } = {}) => ({
    User: {
      findById: jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(target) }),
      countDocuments: jest.fn().mockResolvedValue(otherAdmins),
      exists: jest.fn().mockResolvedValue(null),
      db: { name: 'test' },
      collection: { indexes: jest.fn().mockResolvedValue([]) },
      createIndexes: jest.fn()
    },
    Role: { find: jest.fn().mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) }) }
  });

  const adminTarget = (id) => ({
    _id: id,
    kind: 'staff',
    roles: ['administrator'],
    isActive: true,
    tokenVersion: 0,
    save: jest.fn().mockResolvedValue(undefined)
  });

  it('refuses to demote the last administrator', async () => {
    const target = adminTarget(otherAdminId);
    const req = {
      params: { id: String(otherAdminId) },
      body: { roles: ['principal'] },
      user: { _id: adminId },
      rbac: new PermissionSet([{ key: '*', scope: 'all' }]),
      models: buildModels(target, { otherAdmins: 0 }),
      tenant: { slug: 'alpha' },
      headers: {}
    };
    const res = createRes();
    updateUser(req, res, jest.fn());
    await flush();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'last_administrator' }));
    expect(target.save).not.toHaveBeenCalled();
  });

  it('refuses to let you deactivate yourself', async () => {
    const target = adminTarget(adminId);
    const req = {
      params: { id: String(adminId) },
      body: { isActive: false },
      user: { _id: adminId },
      rbac: new PermissionSet([{ key: '*', scope: 'all' }]),
      models: buildModels(target, { otherAdmins: 3 }),
      tenant: { slug: 'alpha' },
      headers: {}
    };
    const res = createRes();
    updateUser(req, res, jest.fn());
    await flush();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'self_lockout' }));
  });

  it('stops a non-administrator from granting the Administrator role', async () => {
    const req = {
      body: {
        kind: 'staff',
        email: 'new@school.test',
        roles: ['administrator'],
        credential: { method: 'temporary' }
      },
      user: { _id: adminId },
      rbac: new PermissionSet([{ key: 'core.users.manage', scope: 'all' }, { key: 'core.users.read', scope: 'all' }]),
      models: buildModels(null),
      tenant: { slug: 'alpha' },
      headers: {}
    };
    const res = createRes();
    createUser(req, res, jest.fn());
    await flush();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'cannot_grant' }));
  });

  it('stops a manager from granting access they do not have', async () => {
    const req = {
      body: {
        kind: 'staff',
        email: 'new@school.test',
        roles: ['accountant'],
        credential: { method: 'temporary' }
      },
      user: { _id: adminId },
      rbac: new PermissionSet([{ key: 'core.users.manage', scope: 'all' }]),
      models: buildModels(null),
      tenant: { slug: 'alpha' },
      headers: {}
    };
    const res = createRes();
    createUser(req, res, jest.fn());
    await flush();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'cannot_grant' }));
  });
});
