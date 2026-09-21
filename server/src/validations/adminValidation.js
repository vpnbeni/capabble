const Joi = require('joi');
const { TENANT_FEATURE_KEYS } = require('../constants/tenantFeatures');
const {
  PLATFORM_ADMIN_LOGIN_REGEX,
  PLATFORM_ADMIN_LOGIN_MESSAGE,
} = require('../constants/platformAdminAuth');

const tenantSlugRegex = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const platformLoginSchema = Joi.object({
  email: Joi.string().pattern(PLATFORM_ADMIN_LOGIN_REGEX).required().messages({
    'string.pattern.base': PLATFORM_ADMIN_LOGIN_MESSAGE,
  }),
  password: Joi.string().min(8).required(),
});

const createTenantSchema = Joi.object({
  slug: Joi.string().pattern(tenantSlugRegex).required(),
  name: Joi.string().min(2).max(120).required(),
  adminEmail: Joi.string().email().required(),
  adminPassword: Joi.string().min(8).optional(),
  dbName: Joi.string().min(3).max(120).optional(),
});

const publicTenantSignupStartSchema = Joi.object({
  schoolCode: Joi.string().pattern(/^\d{5}$/).optional(),
  affiliationNo: Joi.string().pattern(/^\d{6}$/).optional(),
  slug: Joi.string().pattern(tenantSlugRegex).required(),
  name: Joi.string().min(2).max(120).required(),
  adminEmail: Joi.string().email().required(),
  adminPassword: Joi.string()
    .min(8)
    .max(128)
    .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#\\$%\\^&\\*])'))
    .required(),
  confirmPassword: Joi.string()
    .valid(Joi.ref('adminPassword'))
    .required()
    .messages({
      'any.only': 'Confirm password must match password',
    }),
});

const publicTenantSignupExchangeSchema = Joi.object({
  ticket: Joi.string().min(20).required(),
  tenantSlug: Joi.string().pattern(tenantSlugRegex).required(),
  otp: Joi.string().pattern(/^\d{6}$/).required(),
});

const publicTenantSignupResendOtpSchema = Joi.object({
  ticket: Joi.string().min(20).required(),
  tenantSlug: Joi.string().pattern(tenantSlugRegex).required(),
});

const publicTenantResolveByEmailSchema = Joi.object({
  email: Joi.string().email().required(),
});

const publicSchoolDirectoryLookupParamSchema = Joi.object({
  schoolCode: Joi.string().pattern(/^\d{5}$/).required(),
});

const updateTenantSchema = Joi.object({
  name: Joi.string().min(2).max(120).optional(),
  adminEmail: Joi.string().email().optional(),
}).min(1);

const deleteTenantSchema = Joi.object({
  confirmSlug: Joi.string().trim().min(1).required(),
});

const tenantQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
  search: Joi.string().allow('').optional(),
  status: Joi.string().valid('active', 'suspended').optional(),
});

const tenantIdParamSchema = Joi.object({
  id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
});

const tenantFeatureToggleShape = TENANT_FEATURE_KEYS.reduce((acc, key) => {
  acc[key] = Joi.boolean();
  return acc;
}, {});

const tenantFeatureUpdateSchema = Joi.object({
  toggles: Joi.object(tenantFeatureToggleShape)
    .min(1)
    .required()
    .unknown(false),
});

const masterRemunerationRateRowSchema = Joi.object({
  dutyType: Joi.string().trim().required(),
  remuneration: Joi.number().min(0).optional(),
  conveyance: Joi.number().min(0).optional(),
  refreshment: Joi.number().min(0).optional(),
  rates: Joi.object({
    remuneration: Joi.number().min(0).optional(),
    conveyance: Joi.number().min(0).optional(),
    refreshment: Joi.number().min(0).optional(),
  }).optional(),
}).required();

const masterRemunerationUpdateSchema = Joi.object({
  rates: Joi.array().items(masterRemunerationRateRowSchema).min(1).required(),
});

const optionalText = (max) => Joi.string().allow('').max(max).optional();

const masterPackingDispatchUpdateSchema = Joi.object({
  packingClothColor: optionalText(80),
  packingMarker: optionalText(80),
  packingClothColorClass10: optionalText(80),
  packingMarkerClass10: optionalText(80),
  packingClothColorClass12: optionalText(80),
  packingMarkerClass12: optionalText(80),
  dispatchSlipToAddress: optionalText(2000),
  dispatchSlipFromAddress: optionalText(2000),
  dispatchSlipInsuredAmount: optionalText(50),
});

const schoolDirectoryTypeSettingsSchema = Joi.object({
  govtKeywords: Joi.array().items(Joi.string().trim().min(1).max(120)).min(1).required(),
});

const schoolDirectoryManualTypeSchema = Joi.object({
  type: Joi.string().valid('Govt.', 'Private').required(),
});

module.exports = {
  platformLoginSchema,
  createTenantSchema,
  publicTenantSignupStartSchema,
  publicTenantSignupExchangeSchema,
  publicTenantSignupResendOtpSchema,
  publicTenantResolveByEmailSchema,
  publicSchoolDirectoryLookupParamSchema,
  updateTenantSchema,
  deleteTenantSchema,
  tenantQuerySchema,
  tenantIdParamSchema,
  tenantFeatureUpdateSchema,
  masterRemunerationUpdateSchema,
  masterPackingDispatchUpdateSchema,
  schoolDirectoryTypeSettingsSchema,
  schoolDirectoryManualTypeSchema,
};
