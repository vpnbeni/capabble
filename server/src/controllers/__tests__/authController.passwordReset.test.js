const crypto = require('crypto');

jest.mock('../../models/User', () => ({
  findOne: jest.fn(),
}));

jest.mock('../../utils/mailer', () => ({
  sendMail: jest.fn(),
}));

jest.mock('../../rbac/session', () => ({
  ...jest.requireActual('../../rbac/session'),
  clearSessionCookies: jest.fn(),
  issueSession: jest.fn(),
}));

const User = require('../../models/User');
const { sendMail } = require('../../utils/mailer');
const { clearSessionCookies } = require('../../rbac/session');

const {
  forgotPassword,
  resendForgotPasswordOtp,
  resetPassword,
} = require('../authController');

const hashValue = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

const createRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const flush = () => new Promise((resolve) => setImmediate(resolve));
const mockResetUserLookup = (user) => {
  User.findOne.mockReturnValueOnce({
    select: jest.fn().mockResolvedValue(user),
  });
};

describe('authController password reset OTP', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PASSWORD_RESET_OTP_TTL_MINUTES = '10';
    process.env.PASSWORD_RESET_OTP_MAX_ATTEMPTS = '5';
  });

  it('sends OTP for active user on forgot password', async () => {
    jest.spyOn(crypto, 'randomInt').mockReturnValueOnce(123456);

    const user = {
      email: 'admin@example.com',
      isActive: true,
      passwordResetOtpHash: null,
      passwordResetOtpExpiresAt: null,
      passwordResetOtpSentAt: null,
      passwordResetOtpAttemptCount: 2,
      passwordResetOtpLastAttemptAt: new Date('2025-01-01T00:00:00.000Z'),
      save: jest.fn().mockResolvedValue(undefined),
    };

    User.findOne.mockResolvedValueOnce(user);
    sendMail.mockResolvedValueOnce({ messageId: 'otp-sent' });

    const req = { body: { email: 'admin@example.com' } };
    const res = createRes();

    forgotPassword(req, res, jest.fn());
    await flush();

    expect(User.findOne).toHaveBeenCalledWith({ email: 'admin@example.com' });
    expect(user.save).toHaveBeenCalledWith({ validateBeforeSave: false });
    expect(user.passwordResetOtpHash).toBe(hashValue('123456'));
    expect(user.passwordResetOtpAttemptCount).toBe(0);
    expect(user.passwordResetOtpSentAt).toBeInstanceOf(Date);
    expect(user.passwordResetOtpExpiresAt).toBeInstanceOf(Date);
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'admin@example.com',
      subject: expect.stringContaining('Password Reset'),
    }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        otpExpiresAt: expect.any(Date),
      }),
    }));
  });

  // Forgot-password answers the same way whether or not an account exists, so
  // it cannot be used to discover who has a login.
  it('answers generically and sends nothing for an unknown email', async () => {
    User.findOne.mockResolvedValueOnce(null);
    const req = { body: { email: 'missing@example.com' } };
    const res = createRes();

    forgotPassword(req, res, jest.fn());
    await flush();

    expect(sendMail).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('answers generically and sends nothing for an inactive user', async () => {
    User.findOne.mockResolvedValueOnce({
      email: 'inactive@example.com',
      isActive: false,
    });

    const req = { body: { email: 'inactive@example.com' } };
    const res = createRes();

    forgotPassword(req, res, jest.fn());
    await flush();

    expect(sendMail).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('answers generically on resend when no reset was requested', async () => {
    User.findOne.mockResolvedValueOnce({
      email: 'admin@example.com',
      isActive: true,
      passwordResetOtpHash: null,
      passwordResetOtpSentAt: null,
    });

    const req = { body: { email: 'admin@example.com' } };
    const res = createRes();

    resendForgotPasswordOtp(req, res, jest.fn());
    await flush();

    expect(sendMail).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('resends OTP and rotates fields', async () => {
    jest.spyOn(crypto, 'randomInt').mockReturnValueOnce(654321);

    const user = {
      email: 'admin@example.com',
      isActive: true,
      passwordResetOtpHash: hashValue('111111'),
      passwordResetOtpSentAt: new Date('2025-01-01T00:00:00.000Z'),
      passwordResetOtpAttemptCount: 4,
      passwordResetOtpLastAttemptAt: new Date('2025-01-01T00:01:00.000Z'),
      save: jest.fn().mockResolvedValue(undefined),
    };

    User.findOne.mockResolvedValueOnce(user);
    sendMail.mockResolvedValueOnce({ messageId: 'otp-resend' });

    const req = { body: { email: 'admin@example.com' } };
    const res = createRes();

    resendForgotPasswordOtp(req, res, jest.fn());
    await flush();

    expect(user.passwordResetOtpHash).not.toBe(hashValue('111111'));
    expect(user.passwordResetOtpAttemptCount).toBe(0);
    expect(user.passwordResetOtpLastAttemptAt).toBeNull();
    expect(user.save).toHaveBeenCalledWith({ validateBeforeSave: false });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('increments attempts and returns invalid_otp for incorrect code', async () => {
    const user = {
      email: 'admin@example.com',
      isActive: true,
      passwordResetOtpHash: hashValue('123456'),
      passwordResetOtpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      passwordResetOtpAttemptCount: 0,
      passwordResetOtpLastAttemptAt: null,
      save: jest.fn().mockResolvedValue(undefined),
    };

    mockResetUserLookup(user);
    const req = {
      body: {
        email: 'admin@example.com',
        otp: '111111',
        newPassword: 'Password@123',
        confirmNewPassword: 'Password@123',
      },
    };
    const res = createRes();

    resetPassword(req, res, jest.fn());
    await flush();

    expect(user.passwordResetOtpAttemptCount).toBe(1);
    expect(user.save).toHaveBeenCalledWith({ validateBeforeSave: false });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      errorCode: 'invalid_otp',
    }));
  });

  it('returns otp_expired when reset OTP has expired', async () => {
    mockResetUserLookup({
      email: 'admin@example.com',
      isActive: true,
      passwordResetOtpHash: hashValue('123456'),
      passwordResetOtpExpiresAt: new Date(Date.now() - 60 * 1000),
      passwordResetOtpAttemptCount: 0,
    });

    const req = {
      body: {
        email: 'admin@example.com',
        otp: '123456',
        newPassword: 'Password@123',
        confirmNewPassword: 'Password@123',
      },
    };
    const res = createRes();

    resetPassword(req, res, jest.fn());
    await flush();

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      errorCode: 'otp_expired',
    }));
  });

  it('returns otp_attempts_exceeded when max attempts are already reached', async () => {
    process.env.PASSWORD_RESET_OTP_MAX_ATTEMPTS = '3';

    mockResetUserLookup({
      email: 'admin@example.com',
      isActive: true,
      passwordResetOtpHash: hashValue('123456'),
      passwordResetOtpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      passwordResetOtpAttemptCount: 3,
    });

    const req = {
      body: {
        email: 'admin@example.com',
        otp: '123456',
        newPassword: 'Password@123',
        confirmNewPassword: 'Password@123',
      },
    };
    const res = createRes();

    resetPassword(req, res, jest.fn());
    await flush();

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      errorCode: 'otp_attempts_exceeded',
    }));
  });

  it('resets password and clears OTP state for valid OTP', async () => {
    const user = {
      email: 'admin@example.com',
      isActive: true,
      password: 'OldPassword@123',
      refreshTokens: [{ token: 't1' }],
      passwordResetOtpHash: hashValue('123456'),
      passwordResetOtpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      passwordResetOtpSentAt: new Date(Date.now() - 60 * 1000),
      passwordResetOtpAttemptCount: 1,
      passwordResetOtpLastAttemptAt: new Date(Date.now() - 30 * 1000),
      save: jest.fn().mockResolvedValue(undefined),
    };

    mockResetUserLookup(user);

    const req = {
      body: {
        email: 'admin@example.com',
        otp: '123456',
        newPassword: 'Password@123',
        confirmNewPassword: 'Password@123',
      },
    };
    const res = createRes();

    resetPassword(req, res, jest.fn());
    await flush();

    expect(user.password).toBe('Password@123');
    expect(user.refreshTokens).toEqual([]);
    expect(user.tokenVersion).toBe(1);
    expect(user.mustChangePassword).toBe(false);
    expect(user.passwordResetOtpHash).toBeNull();
    expect(user.passwordResetOtpExpiresAt).toBeNull();
    expect(user.passwordResetOtpSentAt).toBeNull();
    expect(user.passwordResetOtpAttemptCount).toBe(0);
    expect(user.passwordResetOtpLastAttemptAt).toBeNull();
    expect(user.save).toHaveBeenCalledTimes(1);
    expect(clearSessionCookies).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
    }));
  });
});
