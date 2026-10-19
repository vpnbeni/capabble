const crypto = require('crypto');

jest.mock('../../models/User', () => ({ findOne: jest.fn() }));
jest.mock('../../utils/mailer', () => ({ sendMail: jest.fn() }));
jest.mock('../../rbac/session', () => ({
  ...jest.requireActual('../../rbac/session'),
  issueSession: jest.fn(),
}));
jest.mock('../../rbac/audit', () => ({ recordAuthEvent: jest.fn() }));
jest.mock('../../rbac/userPayload', () => ({ buildAuthUserPayload: jest.fn().mockResolvedValue({ id: 'u1' }) }));
jest.mock('../../middleware/billingEntitlement', () => ({ loadEntitlement: jest.fn().mockResolvedValue({}) }));
jest.mock('../../services/billingServiceClient', () => ({ onboardTenantTrial: jest.fn() }));
jest.mock('../../tenancy/platformModels', () => ({ getPlatformModels: jest.fn() }));

const User = require('../../models/User');
const { onboardTenantTrial } = require('../../services/billingServiceClient');
const { getPlatformModels } = require('../../tenancy/platformModels');
const { verifyEmail } = require('../authController');

const hashValue = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const flush = () => new Promise((resolve) => setImmediate(resolve));

const createRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const unverifiedUser = (overrides = {}) => ({
  email: 'admin@school.in',
  isActive: true,
  isEmailVerified: false,
  emailVerificationOtpHash: hashValue('123456'),
  emailVerificationOtpExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
  emailVerificationOtpAttemptCount: 0,
  lastLogin: null,
  save: jest.fn(),
  ...overrides,
});

const mockTenantRecord = (record) => {
  getPlatformModels.mockReturnValue({
    Tenant: { findOne: () => ({ select: () => ({ lean: () => Promise.resolve(record) }) }) },
  });
};

const run = async (user) => {
  User.findOne.mockReturnValueOnce({ select: jest.fn().mockResolvedValue(user) });
  const req = { body: { email: user.email, otp: '123456' }, tenant: { slug: '06150107536' } };
  const res = createRes();
  verifyEmail(req, res, jest.fn());
  await flush();
  return res;
};

describe('authController verifyEmail', () => {
  beforeEach(() => jest.clearAllMocks());

  it('starts the trial when the signup admin finishes verification by signing in', async () => {
    mockTenantRecord({ _id: 't1', slug: '06150107536', name: 'R.E.D. School', adminEmail: 'admin@school.in' });

    const res = await run(unverifiedUser());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(onboardTenantTrial).toHaveBeenCalledWith({
      tenantId: 't1',
      tenantSlug: '06150107536',
      tenantName: 'R.E.D. School',
      billingEmail: 'admin@school.in',
    });
  });

  it('does not start a trial for other users of the school', async () => {
    mockTenantRecord({ _id: 't1', slug: '06150107536', name: 'R.E.D. School', adminEmail: 'owner@school.in' });

    await run(unverifiedUser());

    expect(onboardTenantTrial).not.toHaveBeenCalled();
  });

  it('does not start a trial for a user who has signed in before', async () => {
    mockTenantRecord({ _id: 't1', slug: '06150107536', name: 'R.E.D. School', adminEmail: 'admin@school.in' });

    await run(unverifiedUser({ lastLogin: new Date('2026-01-01') }));

    expect(onboardTenantTrial).not.toHaveBeenCalled();
  });

  it('still signs in when the billing service fails', async () => {
    mockTenantRecord({ _id: 't1', slug: '06150107536', name: 'R.E.D. School', adminEmail: 'admin@school.in' });
    onboardTenantTrial.mockRejectedValueOnce(new Error('billing down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await run(unverifiedUser());

    expect(res.status).toHaveBeenCalledWith(200);
  });
});
