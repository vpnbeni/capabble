const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const asyncHandler = require('../middleware/asyncHandler');
const User = require('../models/User');
const {
  issueSession,
  rotateSession,
  endSession,
  verifyRefreshCookie,
  revokeAllSessions,
  clearSessionCookies,
  hashValue: hashToken,
  REFRESH_COOKIE,
} = require('../rbac/session');
const { buildAuthUserPayload } = require('../rbac/userPayload');
const { recordAuthEvent } = require('../rbac/audit');
const { clearViewAsCookie } = require('../rbac/viewAs');
const eventBus = require('../events/eventBus');
const EVENTS = require('../events/eventNames');
const { ensureUserIndexes } = require('../rbac/userIndexes');
const { generateResponse } = require('../utils/helpers');
const { SUCCESS_MESSAGES, HTTP_STATUS } = require('../utils/constants');
const { loadEntitlement } = require('../middleware/billingEntitlement');
const { registerTenant } = require('../services/billingServiceClient');
const { getPlatformModels } = require('../tenancy/platformModels');
const { sendMail } = require('../utils/mailer');
const mailTemplates = require('../mail/templates');

const PASSWORD_RESET_ERROR_CODES = {
  USER_NOT_FOUND: 'user_not_found',
  USER_INACTIVE: 'user_inactive',
  OTP_REQUIRED: 'otp_required',
  OTP_INVALID: 'invalid_otp',
  OTP_EXPIRED: 'otp_expired',
  OTP_ATTEMPTS_EXCEEDED: 'otp_attempts_exceeded',
  OTP_NOT_REQUESTED: 'otp_not_requested',
};

const EMAIL_VERIFICATION_ERROR_CODES = {
  EMAIL_NOT_VERIFIED: 'email_not_verified',
  ALREADY_VERIFIED: 'already_verified',
  OTP_REQUIRED: 'otp_required',
  OTP_INVALID: 'invalid_otp',
  OTP_EXPIRED: 'otp_expired',
  OTP_ATTEMPTS_EXCEEDED: 'otp_attempts_exceeded',
  OTP_NOT_REQUESTED: 'otp_not_requested',
  USER_NOT_FOUND: 'user_not_found',
  USER_INACTIVE: 'user_inactive',
};

const parsePositiveInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
};

const resolvePasswordResetOtpTtlMinutes = () => parsePositiveInt(process.env.PASSWORD_RESET_OTP_TTL_MINUTES, 10);
const resolvePasswordResetOtpMaxAttempts = () => parsePositiveInt(process.env.PASSWORD_RESET_OTP_MAX_ATTEMPTS, 5);
const resolveEmailVerificationOtpTtlMinutes = () => parsePositiveInt(process.env.EMAIL_VERIFICATION_OTP_TTL_MINUTES, 10);
const resolveEmailVerificationOtpMaxAttempts = () => parsePositiveInt(process.env.EMAIL_VERIFICATION_OTP_MAX_ATTEMPTS, 5);
const hashValue = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const generatePasswordResetOtp = () => crypto.randomInt(0, 1000000).toString().padStart(6, '0');

const clearPasswordResetOtpState = (user) => {
  user.passwordResetOtpHash = null;
  user.passwordResetOtpExpiresAt = null;
  user.passwordResetOtpSentAt = null;
  user.passwordResetOtpAttemptCount = 0;
  user.passwordResetOtpLastAttemptAt = null;
};

const getOtpExpiryMinutes = (otpExpiresAt) => {
  if (!otpExpiresAt) return null;
  const diffMs = new Date(otpExpiresAt).getTime() - Date.now();
  if (!Number.isFinite(diffMs) || diffMs <= 0) {
    return 0;
  }
  return Math.ceil(diffMs / (60 * 1000));
};

const sendPasswordResetOtpEmail = async ({ email, otp, otpExpiresAt }) => {
  await sendMail({
    to: email,
    ...mailTemplates.passwordResetCode({ code: otp, minutes: getOtpExpiryMinutes(otpExpiresAt) }),
  });
};

const sendEmailVerificationOtpEmail = async ({ email, otp, otpExpiresAt }) => {
  await sendMail({
    to: email,
    ...mailTemplates.emailVerificationCode({ code: otp, minutes: getOtpExpiryMinutes(otpExpiresAt) }),
  });
};

const buildBillingSnapshot = async (tenantSlug) => {
  if (!tenantSlug) {
    return null;
  }

  try {
    const entitlement = await loadEntitlement(tenantSlug);
    return {
      accessMode: entitlement.accessMode || 'full',
      planCode: entitlement.planCode || null,
      trialEndsAt: entitlement.trialEndsAt || null,
      graceEndsAt: entitlement.graceEndsAt || null,
      periodEndsAt: entitlement.periodEndsAt || null,
      cancelAtPeriodEnd: Boolean(entitlement.cancelAtPeriodEnd),
      entitledModules: entitlement.entitledModules || ['*'],
      // What the school chose: everything is open in a trial, these stay on after it.
      plannedModules: entitlement.plannedModules || [],
      autopay: Boolean(entitlement.autopay),
      isReadOnly: Boolean(entitlement.isReadOnly),
      state: entitlement.state || (entitlement.accessMode === 'setup_required' ? 'none' : 'active'),
    };
  } catch (error) {
    console.error('[auth] billing snapshot fetch failed', {
      tenantSlug,
      message: error.message,
    });
    return null;
  }
};

let dummyPasswordHash = null;
const getDummyPasswordHash = () => {
  if (!dummyPasswordHash) {
    dummyPasswordHash = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), parseInt(process.env.BCRYPT_ROUNDS, 10) || 12);
  }
  return dummyPasswordHash;
};

const LOGIN_MAX_FAILED_ATTEMPTS = () => parsePositiveInt(process.env.LOGIN_MAX_FAILED_ATTEMPTS, 5);
const LOGIN_LOCK_MINUTES = () => parsePositiveInt(process.env.LOGIN_LOCK_MINUTES, 15);
const INVALID_LOGIN_MESSAGE = 'Incorrect email, login ID or password';

// `2024017@dps` — a login ID followed by the school code (no dot after @).
const LOGIN_ID_WITH_SCHOOL = /^([^@\s]+)@([a-z0-9][a-z0-9-]*)$/;

/**
 * Turn what the user typed into a lookup. Staff and parents use email;
 * students may use a login ID, optionally suffixed with the school code.
 */
const buildLoginQuery = (rawIdentifier, tenantSlug) => {
  const identifier = String(rawIdentifier || '').trim().toLowerCase();
  if (!identifier) return null;

  const loginIdMatch = identifier.match(LOGIN_ID_WITH_SCHOOL);
  if (loginIdMatch) {
    if (tenantSlug && loginIdMatch[2] !== tenantSlug) return null;
    return { username: loginIdMatch[1] };
  }
  if (identifier.includes('@')) return { email: identifier };
  return { username: identifier };
};

const sendAuthUser = async (req, res, user, { statusCode = HTTP_STATUS.OK, message = 'Signed in' } = {}) => {
  const [payload, billing] = await Promise.all([
    buildAuthUserPayload(user, { models: req.models || {}, tenant: req.tenant }),
    buildBillingSnapshot(req.tenant?.slug),
  ]);
  payload.billing = billing;
  return res.status(statusCode).json(generateResponse(true, message, { user: payload, billing }));
};

const requireCsrfHeader = (req, res) => {
  if (req.headers['x-requested-with']) return true;
  res.status(HTTP_STATUS.FORBIDDEN).json({
    ...generateResponse(false, 'Missing request header'),
    errorCode: 'csrf_check_failed',
  });
  return false;
};

// @desc    Login user (email or login ID)
// @route   POST /api/auth/login
// @access  Public
const login = asyncHandler(async (req, res) => {
  const { password } = req.body;
  const rememberMe = req.body.rememberMe !== false;
  const query = buildLoginQuery(req.body.email ?? req.body.identifier, req.tenant?.slug);
  ensureUserIndexes(req.models?.User || User.getActiveModel());

  const user = query
    ? await User.findOne(query).select('+password +refreshTokens')
    : null;

  if (!user) {
    // Spend comparable time so response timing does not reveal unknown accounts.
    await bcrypt.compare(String(password || ''), getDummyPasswordHash());
    return res.status(HTTP_STATUS.UNAUTHORIZED).json(generateResponse(false, INVALID_LOGIN_MESSAGE));
  }

  const now = new Date();
  if (user.lockUntil && user.lockUntil > now) {
    const minutes = Math.max(1, Math.ceil((user.lockUntil.getTime() - now.getTime()) / 60000));
    return res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
      ...generateResponse(false, `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`),
      errorCode: 'account_locked',
      retryAfterMinutes: minutes,
    });
  }

  const isPasswordMatch = await user.matchPassword(String(password || ''));
  if (!isPasswordMatch) {
    user.failedLoginCount = (user.failedLoginCount || 0) + 1;
    let locked = false;
    if (user.failedLoginCount >= LOGIN_MAX_FAILED_ATTEMPTS()) {
      user.lockUntil = new Date(now.getTime() + LOGIN_LOCK_MINUTES() * 60 * 1000);
      user.failedLoginCount = 0;
      locked = true;
    }
    await user.save({ validateBeforeSave: false });
    await recordAuthEvent(req, {
      event: locked ? 'login_locked' : 'login_failed',
      actor: null,
      target: user,
    });
    return res.status(HTTP_STATUS.UNAUTHORIZED).json(generateResponse(false, INVALID_LOGIN_MESSAGE));
  }

  if (!user.isActive) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      ...generateResponse(false, 'This account has been deactivated. Contact your school office.'),
      errorCode: 'user_inactive',
    });
  }

  // Block login if email is not verified — send a fresh OTP so they can complete verification
  if (!user.isEmailVerified && user.email) {
    const otp = generatePasswordResetOtp();
    const ttlMinutes = resolveEmailVerificationOtpTtlMinutes();
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);

    user.emailVerificationOtpHash = hashValue(otp);
    user.emailVerificationOtpExpiresAt = expiresAt;
    user.emailVerificationOtpAttemptCount = 0;
    await user.save({ validateBeforeSave: false });

    try {
      await sendEmailVerificationOtpEmail({ email: user.email, otp, otpExpiresAt: expiresAt });
    } catch (emailError) {
      console.error(`[auth:login] email_verification_otp_delivery_failed email=${user.email} message=${emailError.message}`);
    }

    return res.status(HTTP_STATUS.FORBIDDEN).json({
      ...generateResponse(false, 'Please verify your email to continue. A verification code has been sent to your email.'),
      errorCode: EMAIL_VERIFICATION_ERROR_CODES.EMAIL_NOT_VERIFIED,
      email: user.email,
      otpExpiresAt: expiresAt,
    });
  }

  user.failedLoginCount = 0;
  user.lockUntil = null;
  user.lastLogin = now;
  await issueSession({ req, res, user, tenantSlug: req.tenant.slug, rememberMe });
  await recordAuthEvent(req, { event: 'login_success', actor: user, target: user, details: { rememberMe } });

  return sendAuthUser(req, res, user);
});

// @desc    Logout (ends this device's session)
// @route   POST /api/auth/logout
// @access  Public (uses the refresh cookie)
const logout = asyncHandler(async (req, res) => {
  const refreshCookie = req.cookies?.[REFRESH_COOKIE];
  if (refreshCookie) {
    try {
      const decoded = verifyRefreshCookie(refreshCookie);
      if (decoded.tenantSlug === req.tenant?.slug) {
        const user = await User.findById(decoded.id).select('+refreshTokens');
        await endSession({ user, refreshToken: refreshCookie });
        if (user) await recordAuthEvent(req, { event: 'logout', actor: user, target: user });
      }
    } catch (error) {
      // Expired or tampered cookie: just clear it.
    }
  }

  clearSessionCookies(res);
  res.status(HTTP_STATUS.OK).json(generateResponse(true, SUCCESS_MESSAGES.LOGOUT_SUCCESS));
});

// @desc    Rotate the refresh cookie and issue a new access cookie
// @route   POST /api/auth/refresh
// @access  Public (uses the refresh cookie)
const refreshToken = asyncHandler(async (req, res) => {
  if (!requireCsrfHeader(req, res)) return;

  const sessionExpired = () => {
    clearSessionCookies(res);
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      ...generateResponse(false, 'Your session has ended. Please sign in again.'),
      errorCode: 'session_expired',
    });
  };

  const cookie = req.cookies?.[REFRESH_COOKIE];
  if (!cookie) return sessionExpired();

  let decoded;
  try {
    decoded = verifyRefreshCookie(cookie);
  } catch (error) {
    return sessionExpired();
  }
  if (!req.tenant?.slug || decoded.tenantSlug !== req.tenant.slug) return sessionExpired();

  const user = await User.findById(decoded.id).select('+refreshTokens');
  if (!user || !user.isActive) return sessionExpired();

  const result = await rotateSession({ req, res, user, decoded, tenantSlug: req.tenant.slug });
  if (result.status === 'reuse') {
    await recordAuthEvent(req, { event: 'refresh_reuse_detected', actor: user, target: user });
    return sessionExpired();
  }
  if (result.status === 'invalid') return sessionExpired();

  return sendAuthUser(req, res, user, { message: 'Session refreshed' });
});

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
const getMe = asyncHandler(async (req, res) => {
  const [payload, billing] = await Promise.all([
    buildAuthUserPayload(req.user, { models: req.models || {}, tenant: req.tenant, rbac: req.rbac }),
    buildBillingSnapshot(req.tenant?.slug),
  ]);
  payload.billing = billing;
  const viewAs = req.auth?.viewAs;
  if (viewAs) {
    // The person may still owe a password change; that is theirs to make, not the viewer's.
    payload.mustChangePassword = false;
    payload.viewAs = {
      by: { _id: viewAs.by._id, name: viewAs.by.name || '', email: viewAs.by.email || null },
      mode: viewAs.mode,
      expiresAt: viewAs.expiresAt
    };
  }

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, 'User profile fetched successfully', payload)
  );
});

// @desc    Stop viewing as someone (see rbac/viewAs) and go back to your own login
// @route   DELETE /api/auth/view-as
// @access  Private
const stopViewAs = asyncHandler(async (req, res) => {
  const viewAs = req.auth?.viewAs;
  clearViewAsCookie(res);
  if (viewAs) {
    const event = viewAs.mode === 'switch' ? 'switch_ended' : 'view_as_ended';
    await recordAuthEvent(req, { event, actor: viewAs.by, target: req.user });
  }
  const message = viewAs ? 'Back to your own login.' : 'Not viewing as anyone.';
  res.status(HTTP_STATUS.OK).json(generateResponse(true, message));
});

// @desc    Update own profile (display name only; email/login ID are set by the school)
// @route   PUT /api/auth/me
// @access  Private
const updateProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (typeof req.body.name === 'string') user.name = req.body.name.trim();
  await user.save({ validateBeforeSave: false });

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, SUCCESS_MESSAGES.UPDATED, await buildAuthUserPayload(user, { models: req.models || {}, tenant: req.tenant, rbac: req.rbac }))
  );
});

// @desc    Change password (also completes a forced change after a temporary password)
// @route   PUT /api/auth/change-password
// @access  Private
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+password +refreshTokens');

  const isPasswordMatch = await user.matchPassword(currentPassword);
  if (!isPasswordMatch) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json(
      generateResponse(false, 'Current password is incorrect')
    );
  }
  if (await user.matchPassword(newPassword)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json(
      generateResponse(false, 'Choose a password different from the current one')
    );
  }

  user.password = newPassword;
  user.mustChangePassword = false;
  // Sign out every other device, then keep this one signed in.
  revokeAllSessions(user);
  await user.save();
  await issueSession({ req, res, user, tenantSlug: req.tenant.slug, rememberMe: true });
  await recordAuthEvent(req, { event: 'password_changed', actor: user, target: user });
  eventBus.emitFromRequest(req, EVENTS.USER_ACCOUNT_CHANGED, { userId: String(user._id), change: 'password_changed' });

  return sendAuthUser(req, res, user, { message: 'Password changed. Other devices have been signed out.' });
});

// @desc    Look up an invite before the person sets a password
// @route   POST /api/auth/invite/preview
// @access  Public
const previewInvite = asyncHandler(async (req, res) => {
  const token = String(req.body.token || '');
  const user = token
    ? await User.findOne({ inviteTokenHash: hashToken(token), inviteExpiresAt: { $gt: new Date() }, isActive: true })
    : null;

  if (!user) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      ...generateResponse(false, 'This invite link is invalid or has expired. Ask your school office for a new one.'),
      errorCode: 'invite_invalid',
    });
  }

  return res.status(HTTP_STATUS.OK).json(generateResponse(true, 'Invite found', {
    name: user.name || '',
    email: user.email || null,
    username: user.username || null,
    kind: user.kind,
    schoolName: req.tenant?.name || '',
  }));
});

// @desc    Accept an invite: set a password and sign in
// @route   POST /api/auth/accept-invite
// @access  Public
const acceptInvite = asyncHandler(async (req, res) => {
  const token = String(req.body.token || '');
  const user = token
    ? await User.findOne({ inviteTokenHash: hashToken(token), inviteExpiresAt: { $gt: new Date() }, isActive: true })
      .select('+password +refreshTokens +inviteTokenHash')
    : null;

  if (!user) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      ...generateResponse(false, 'This invite link is invalid or has expired. Ask your school office for a new one.'),
      errorCode: 'invite_invalid',
    });
  }

  user.password = req.body.password;
  user.inviteTokenHash = null;
  user.inviteExpiresAt = null;
  user.mustChangePassword = false;
  user.isEmailVerified = true;
  user.failedLoginCount = 0;
  user.lockUntil = null;
  user.lastLogin = new Date();
  revokeAllSessions(user);
  await user.save();
  await issueSession({ req, res, user, tenantSlug: req.tenant.slug, rememberMe: true });
  await recordAuthEvent(req, { event: 'invite_accepted', actor: user, target: user });

  return sendAuthUser(req, res, user, { message: 'Password set. Welcome!' });
});

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();

  const ttlMinutes = resolvePasswordResetOtpTtlMinutes();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);
  const genericResponse = () => res.status(HTTP_STATUS.OK).json(
    generateResponse(true, 'If an account exists for this email, a verification code has been sent.', {
      otpExpiresAt: expiresAt,
    })
  );

  // Same answer whether or not the account exists, so this cannot be used to
  // discover who has an account.
  const user = await User.findOne({ email });
  if (!user || !user.isActive) {
    return genericResponse();
  }

  const otp = generatePasswordResetOtp();

  user.passwordResetOtpHash = hashValue(otp);
  user.passwordResetOtpExpiresAt = expiresAt;
  user.passwordResetOtpSentAt = now;
  user.passwordResetOtpAttemptCount = 0;
  user.passwordResetOtpLastAttemptAt = null;
  await user.save({ validateBeforeSave: false });

  try {
    await sendPasswordResetOtpEmail({
      email: user.email,
      otp,
      otpExpiresAt: expiresAt,
    });
  } catch (error) {
    console.error(`[auth:forgot-password] otp_delivery_failed email=${user.email} message=${error.message}`);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      ...generateResponse(false, 'Unable to send verification code right now. Please try again.'),
      errorCode: 'otp_delivery_failed',
    });
  }

  return genericResponse();
});

// @desc    Resend forgot password OTP
// @route   POST /api/auth/forgot-password/resend-otp
// @access  Public
const resendForgotPasswordOtp = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();

  const ttlMinutes = resolvePasswordResetOtpTtlMinutes();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);
  const genericResponse = () => res.status(HTTP_STATUS.OK).json(
    generateResponse(true, 'If an account exists for this email, a new verification code has been sent.', {
      otpExpiresAt: expiresAt,
    })
  );

  const user = await User.findOne({ email });
  if (!user || !user.isActive || !user.passwordResetOtpHash || !user.passwordResetOtpSentAt) {
    return genericResponse();
  }

  const otp = generatePasswordResetOtp();

  user.passwordResetOtpHash = hashValue(otp);
  user.passwordResetOtpExpiresAt = expiresAt;
  user.passwordResetOtpSentAt = now;
  user.passwordResetOtpAttemptCount = 0;
  user.passwordResetOtpLastAttemptAt = null;
  await user.save({ validateBeforeSave: false });

  try {
    await sendPasswordResetOtpEmail({
      email: user.email,
      otp,
      otpExpiresAt: expiresAt,
    });
  } catch (error) {
    console.error(`[auth:forgot-password:resend] otp_delivery_failed email=${user.email} message=${error.message}`);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      ...generateResponse(false, 'Unable to send verification code right now. Please try again.'),
      errorCode: 'otp_delivery_failed',
    });
  }

  return genericResponse();
});

// @desc    Reset password
// @route   POST /api/auth/reset-password
// @access  Public
const resetPassword = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const otp = String(req.body.otp || '').trim();
  const { newPassword } = req.body;
  const now = new Date();
  const maxOtpAttempts = resolvePasswordResetOtpMaxAttempts();

  const user = await User.findOne({ email }).select('+password +refreshTokens');
  if (!user || !user.isActive || !user.passwordResetOtpHash || !user.passwordResetOtpExpiresAt) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      ...generateResponse(false, 'Password reset OTP has not been requested'),
      errorCode: PASSWORD_RESET_ERROR_CODES.OTP_NOT_REQUESTED,
    });
  }

  if ((user.passwordResetOtpAttemptCount || 0) >= maxOtpAttempts) {
    return res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
      ...generateResponse(false, 'Too many incorrect OTP attempts. Please request a new code.'),
      errorCode: PASSWORD_RESET_ERROR_CODES.OTP_ATTEMPTS_EXCEEDED,
    });
  }

  if (new Date(user.passwordResetOtpExpiresAt) <= now) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      ...generateResponse(false, 'OTP has expired. Please request a new code.'),
      errorCode: PASSWORD_RESET_ERROR_CODES.OTP_EXPIRED,
    });
  }

  if (!otp) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      ...generateResponse(false, 'OTP is required'),
      errorCode: PASSWORD_RESET_ERROR_CODES.OTP_REQUIRED,
    });
  }

  const otpHash = hashValue(otp);
  if (otpHash !== user.passwordResetOtpHash) {
    const nextAttemptCount = (user.passwordResetOtpAttemptCount || 0) + 1;
    user.passwordResetOtpAttemptCount = nextAttemptCount;
    user.passwordResetOtpLastAttemptAt = now;
    await user.save({ validateBeforeSave: false });

    if (nextAttemptCount >= maxOtpAttempts) {
      return res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
        ...generateResponse(false, 'Too many incorrect OTP attempts. Please request a new code.'),
        errorCode: PASSWORD_RESET_ERROR_CODES.OTP_ATTEMPTS_EXCEEDED,
      });
    }

    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      ...generateResponse(false, 'Invalid verification code'),
      errorCode: PASSWORD_RESET_ERROR_CODES.OTP_INVALID,
    });
  }

  user.password = newPassword;
  user.mustChangePassword = false;
  user.failedLoginCount = 0;
  user.lockUntil = null;
  revokeAllSessions(user);
  clearPasswordResetOtpState(user);
  await user.save();
  await recordAuthEvent(req, { event: 'password_reset', actor: user, target: user });
  eventBus.emitFromRequest(req, EVENTS.USER_ACCOUNT_CHANGED, { userId: String(user._id), change: 'password_changed' });

  clearSessionCookies(res);

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, 'Password reset successfully. Please login with your new password.')
  );
});

// The school gets a billing account and an invite to choose its plan; its trial starts when it opts in.
const registerSignupBillingBestEffort = async (tenant, user) => {
  try {
    const { Tenant } = getPlatformModels();
    const record = await Tenant.findOne({ slug: tenant.slug }).select('slug name adminEmail').lean();
    if (!record || String(record.adminEmail || '').toLowerCase() !== user.email) return;
    await registerTenant({
      tenantId: String(record._id),
      tenantSlug: record.slug,
      tenantName: record.name,
      billingEmail: record.adminEmail,
    });
  } catch (error) {
    console.error(`[auth:verify-email] status=billing_register_failed tenantSlug=${tenant.slug} message=${error.message}`);
  }
};

// @desc    Verify email with OTP (sent during login for unverified accounts)
// @route   POST /api/auth/verify-email
// @access  Public
const verifyEmail = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const otp = String(req.body.otp || '').trim();
  const now = new Date();
  const maxAttempts = resolveEmailVerificationOtpMaxAttempts();

  const user = await User.findOne({ email }).select('+refreshTokens');
  if (!user || !user.isActive || user.isEmailVerified || !user.emailVerificationOtpHash || !user.emailVerificationOtpExpiresAt) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      ...generateResponse(false, 'No verification code found. Please try logging in again to receive a new code.'),
      errorCode: EMAIL_VERIFICATION_ERROR_CODES.OTP_NOT_REQUESTED,
    });
  }

  if ((user.emailVerificationOtpAttemptCount || 0) >= maxAttempts) {
    return res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
      ...generateResponse(false, 'Too many incorrect attempts. Please try logging in again to receive a new code.'),
      errorCode: EMAIL_VERIFICATION_ERROR_CODES.OTP_ATTEMPTS_EXCEEDED,
    });
  }

  if (new Date(user.emailVerificationOtpExpiresAt) <= now) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      ...generateResponse(false, 'Verification code has expired. Please try logging in again to receive a new code.'),
      errorCode: EMAIL_VERIFICATION_ERROR_CODES.OTP_EXPIRED,
    });
  }

  if (!otp) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      ...generateResponse(false, 'Verification code is required'),
      errorCode: EMAIL_VERIFICATION_ERROR_CODES.OTP_REQUIRED,
    });
  }

  const otpHash = hashValue(otp);
  if (otpHash !== user.emailVerificationOtpHash) {
    const nextAttemptCount = (user.emailVerificationOtpAttemptCount || 0) + 1;
    user.emailVerificationOtpAttemptCount = nextAttemptCount;
    await user.save({ validateBeforeSave: false });

    if (nextAttemptCount >= maxAttempts) {
      return res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
        ...generateResponse(false, 'Too many incorrect attempts. Please try logging in again to receive a new code.'),
        errorCode: EMAIL_VERIFICATION_ERROR_CODES.OTP_ATTEMPTS_EXCEEDED,
      });
    }

    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      ...generateResponse(false, 'Invalid verification code'),
      errorCode: EMAIL_VERIFICATION_ERROR_CODES.OTP_INVALID,
    });
  }

  // A school whose sign-up stopped before the email step finishes it here: its first
  // sign-in as the signup admin starts the trial the signup would have started.
  const firstSignIn = !user.lastLogin;

  // Mark email verified and clear OTP state
  user.isEmailVerified = true;
  user.emailVerificationOtpHash = null;
  user.emailVerificationOtpExpiresAt = null;
  user.emailVerificationOtpAttemptCount = 0;
  user.lastLogin = new Date();
  user.failedLoginCount = 0;
  user.lockUntil = null;
  await issueSession({ req, res, user, tenantSlug: req.tenant.slug, rememberMe: req.body.rememberMe !== false });
  await recordAuthEvent(req, { event: 'login_success', actor: user, target: user, details: { via: 'email_verification' } });
  if (firstSignIn) await registerSignupBillingBestEffort(req.tenant, user);

  return sendAuthUser(req, res, user);
});

// @desc    Resend email verification OTP
// @route   POST /api/auth/resend-email-verification
// @access  Public
const resendEmailVerificationOtp = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();

  const ttlMinutes = resolveEmailVerificationOtpTtlMinutes();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);

  const user = await User.findOne({ email });
  if (!user || !user.isActive || user.isEmailVerified) {
    return res.status(HTTP_STATUS.OK).json(
      generateResponse(true, 'If this email needs verifying, a new code has been sent.', { otpExpiresAt: expiresAt })
    );
  }

  const otp = generatePasswordResetOtp();

  user.emailVerificationOtpHash = hashValue(otp);
  user.emailVerificationOtpExpiresAt = expiresAt;
  user.emailVerificationOtpAttemptCount = 0;
  await user.save({ validateBeforeSave: false });

  try {
    await sendEmailVerificationOtpEmail({ email: user.email, otp, otpExpiresAt: expiresAt });
  } catch (emailError) {
    console.error(`[auth:resend-email-verification] otp_delivery_failed email=${user.email} message=${emailError.message}`);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      ...generateResponse(false, 'Unable to send verification code right now. Please try again.'),
      errorCode: 'otp_delivery_failed',
    });
  }

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, 'A new verification code has been sent to your email', {
      otpExpiresAt: expiresAt,
    })
  );
});

module.exports = {
  login,
  buildLoginQuery,
  logout,
  refreshToken,
  getMe,
  stopViewAs,
  updateProfile,
  changePassword,
  forgotPassword,
  resendForgotPasswordOtp,
  resetPassword,
  verifyEmail,
  resendEmailVerificationOtp,
  previewInvite,
  acceptInvite
};
