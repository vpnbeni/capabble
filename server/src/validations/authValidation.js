const Joi = require('joi');
const { USER_ROLES } = require('../utils/constants');

// Login validation schema
const loginSchema = Joi.object({
  email: Joi.string()
    .trim()
    .max(254)
    .required()
    .messages({
      'string.empty': 'Email or login ID is required',
      'any.required': 'Email or login ID is required'
    }),
  password: Joi.string()
    .max(128)
    .required()
    .messages({
      'string.empty': 'Password is required',
      'any.required': 'Password is required'
    }),
  rememberMe: Joi.boolean().default(true)
});

// Shared rule for every password a person chooses.
const newPasswordRule = Joi.string()
  .min(8)
  .max(128)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9])/)
  .messages({
    'string.min': 'Password must be at least 8 characters long',
    'string.max': 'Password cannot exceed 128 characters',
    'string.pattern.base': 'Password must contain an uppercase letter, a lowercase letter, a number and a symbol',
    'any.required': 'Password is required'
  });

const invitePreviewSchema = Joi.object({
  token: Joi.string().trim().max(200).required()
});

const acceptInviteSchema = Joi.object({
  token: Joi.string().trim().max(200).required(),
  password: newPasswordRule.required(),
  confirmPassword: Joi.string()
    .valid(Joi.ref('password'))
    .required()
    .messages({ 'any.only': 'Passwords do not match' })
});

// Change password validation schema
const changePasswordSchema = Joi.object({
  currentPassword: Joi.string()
    .required()
    .messages({
      'any.required': 'Current password is required'
    }),
  newPassword: newPasswordRule.required(),
  confirmNewPassword: Joi.string()
    .valid(Joi.ref('newPassword'))
    .required()
    .messages({
      'any.only': 'Confirm new password must match new password',
      'any.required': 'Confirm new password is required'
    })
});

// Forgot password validation schema
const forgotPasswordSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    })
});

// Forgot password resend OTP validation schema
const forgotPasswordResendOtpSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    })
});

// Reset password validation schema
const resetPasswordSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
  otp: Joi.string()
    .pattern(/^\d{6}$/)
    .required()
    .messages({
      'string.pattern.base': 'OTP must be a valid 6-digit code',
      'any.required': 'OTP is required'
    }),
  newPassword: newPasswordRule.required(),
  confirmNewPassword: Joi.string()
    .valid(Joi.ref('newPassword'))
    .required()
    .messages({
      'any.only': 'Confirm new password must match new password',
      'any.required': 'Confirm new password is required'
    })
});

// Refresh token validation schema
const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string()
    .required()
    .messages({
      'any.required': 'Refresh token is required'
    })
});

// Update own profile validation schema
const updateProfileSchema = Joi.object({
  name: Joi.string().trim().max(120).allow('')
});

// MongoDB ObjectId validation
const objectIdSchema = Joi.string()
  .pattern(/^[0-9a-fA-F]{24}$/)
  .messages({
    'string.pattern.base': 'Invalid ID format'
  });

// Pagination validation schema
const paginationSchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .default(1)
    .messages({
      'number.base': 'Page must be a number',
      'number.integer': 'Page must be an integer',
      'number.min': 'Page must be at least 1'
    }),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(10)
    .messages({
      'number.base': 'Limit must be a number',
      'number.integer': 'Limit must be an integer',
      'number.min': 'Limit must be at least 1',
      'number.max': 'Limit cannot exceed 100'
    }),
  sort: Joi.string()
    .default('-createdAt')
    .messages({
      'string.base': 'Sort must be a string'
    }),
  search: Joi.string()
    .trim()
    .messages({
      'string.base': 'Search must be a string'
    })
});

// User query validation schema
const userQuerySchema = paginationSchema.keys({
  role: Joi.string()
    .valid(...Object.values(USER_ROLES))
    .messages({
      'any.only': `Role must be one of: ${Object.values(USER_ROLES).join(', ')}`
    }),
  isActive: Joi.boolean()
    .messages({
      'boolean.base': 'isActive must be a boolean'
    }),
  startDate: Joi.date()
    .iso()
    .messages({
      'date.base': 'Start date must be a valid date',
      'date.format': 'Start date must be in ISO format'
    }),
  endDate: Joi.date()
    .iso()
    .greater(Joi.ref('startDate'))
    .messages({
      'date.base': 'End date must be a valid date',
      'date.format': 'End date must be in ISO format',
      'date.greater': 'End date must be after start date'
    })
});

// Verify email validation schema
const verifyEmailSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
  otp: Joi.string()
    .pattern(/^\d{6}$/)
    .required()
    .messages({
      'string.pattern.base': 'Verification code must be a 6-digit number',
      'any.required': 'Verification code is required'
    })
});

// Resend email verification OTP validation schema
const resendEmailVerificationSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    })
});

module.exports = {
  loginSchema,
  newPasswordRule,
  invitePreviewSchema,
  acceptInviteSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  forgotPasswordResendOtpSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  resendEmailVerificationSchema,
  refreshTokenSchema,
  updateProfileSchema,
  objectIdSchema,
  paginationSchema,
  userQuerySchema
};
