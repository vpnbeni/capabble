const express = require('express');
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const {
  login,
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
} = require('../controllers/authController');

const { protect } = require('../middleware/auth');
const { validateJoi } = require('../middleware/validation');
const {
  loginSchema,
  acceptInviteSchema,
  invitePreviewSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  forgotPasswordResendOtpSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  resendEmailVerificationSchema,
  updateProfileSchema
} = require('../validations/authValidation');

const router = express.Router();

const parsePositiveInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
};

const forgotPasswordLimiter = rateLimit({
  windowMs: parsePositiveInt(process.env.PASSWORD_RESET_FORGOT_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  max: parsePositiveInt(process.env.PASSWORD_RESET_FORGOT_RATE_LIMIT_MAX, 8),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many forgot password requests. Please try again later.',
    errorCode: 'rate_limit_exceeded',
  },
});

const forgotPasswordResendLimiter = rateLimit({
  windowMs: parsePositiveInt(process.env.PASSWORD_RESET_RESEND_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  max: parsePositiveInt(process.env.PASSWORD_RESET_RESEND_RATE_LIMIT_MAX, 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many resend OTP requests. Please try again later.',
    errorCode: 'rate_limit_exceeded',
  },
});

const resetPasswordLimiter = rateLimit({
  windowMs: parsePositiveInt(process.env.PASSWORD_RESET_SUBMIT_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  max: parsePositiveInt(process.env.PASSWORD_RESET_SUBMIT_RATE_LIMIT_MAX, 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many reset attempts. Please try again later.',
    errorCode: 'rate_limit_exceeded',
  },
});

const loginLimiter = rateLimit({
  windowMs: parsePositiveInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  max: parsePositiveInt(process.env.LOGIN_RATE_LIMIT_MAX, 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many sign-in attempts from this network. Please try again later.',
    errorCode: 'rate_limit_exceeded',
  },
});

const inviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many attempts. Please try again later.',
    errorCode: 'rate_limit_exceeded',
  },
});

// Public routes. There is no self sign-up: accounts are created by the school
// (see /api/users). The tenant access gate (src/rbac/gate.js) lists these too.
router.post('/login', loginLimiter, validateJoi(loginSchema), login);
router.post('/refresh', refreshToken);
router.post('/logout', logout);
router.post('/invite/preview', inviteLimiter, validateJoi(invitePreviewSchema), previewInvite);
router.post('/accept-invite', inviteLimiter, validateJoi(acceptInviteSchema), acceptInvite);
router.post('/forgot-password', forgotPasswordLimiter, validateJoi(forgotPasswordSchema), forgotPassword);
router.post(
  '/forgot-password/resend-otp',
  forgotPasswordResendLimiter,
  validateJoi(forgotPasswordResendOtpSchema),
  resendForgotPasswordOtp
);
router.post('/reset-password', resetPasswordLimiter, validateJoi(resetPasswordSchema), resetPassword);
router.post('/verify-email', resetPasswordLimiter, validateJoi(verifyEmailSchema), verifyEmail);
router.post(
  '/resend-email-verification',
  forgotPasswordResendLimiter,
  validateJoi(resendEmailVerificationSchema),
  resendEmailVerificationOtp
);

// Signed-in account routes (any kind of user)
router.use(protect);

router.get('/me', getMe);
router.delete('/view-as', stopViewAs);
router.put('/me', validateJoi(updateProfileSchema), updateProfile);
router.put('/change-password', validateJoi(changePasswordSchema), changePassword);

module.exports = router;
