const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  loginPlatformAdmin,
  getPlatformMe,
  logoutPlatformAdmin
} = require('../controllers/admin/platformAuthController');
const {
  listTenants,
  getTenantById,
  resolveTenantByEmail,
  lookupSchoolDirectoryByCode,
  createTenant,
  startPublicTenantSignup,
  resendPublicTenantSignupOtp,
  exchangePublicTenantSignup,
  updateTenant,
  activateTenant,
  suspendTenant,
  deleteTenant
} = require('../controllers/admin/tenantAdminController');
const auth = require('../middleware/auth');
const { validateJoi, validateQuery, validateParams } = require('../middleware/validation');
const {
  platformLoginSchema,
  createTenantSchema,
  publicTenantSignupStartSchema,
  publicTenantSignupResendOtpSchema,
  publicTenantSignupExchangeSchema,
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
  publicDemoRequestSchema,
  demoRequestQuerySchema,
  demoRequestUpdateSchema
} = require('../validations/adminValidation');
const demoRequestController = require('../controllers/admin/demoRequestController');
const masterSubjectsController = require('../controllers/admin/masterSubjectsController');
const masterDatesheetController = require('../controllers/admin/masterDatesheetController');
const masterGuidelinesController = require('../controllers/admin/masterGuidelinesController');
const masterUndertakingsController = require('../controllers/admin/masterUndertakingsController');
const masterRemunerationController = require('../controllers/admin/masterRemunerationController');
const masterPackingDispatchController = require('../controllers/admin/masterPackingDispatchController');
const masterSchoolDirectoryController = require('../controllers/admin/masterSchoolDirectoryController');
const schoolDirectoryTypeSettingsController = require('../controllers/admin/schoolDirectoryTypeSettingsController');
const rolloutController = require('../controllers/admin/rolloutController');
const masterTeacherTemplateController = require('../controllers/admin/masterTeacherTemplateController');
const billingAdminController = require('../controllers/admin/billingAdminController');
const billing = require('../modules/billing');
const tenantFeaturesController = require('../controllers/admin/tenantFeaturesController');

const router = express.Router();

const parsePositiveInt = (value, fallback) => {
  const parsed = parseInt(value, 10);

  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return fallback;
};

const publicSignupStartLimiter = rateLimit({
  windowMs: parsePositiveInt(process.env.PUBLIC_SIGNUP_START_RATE_LIMIT_WINDOW_MS, 60 * 60 * 1000),
  max: parsePositiveInt(process.env.PUBLIC_SIGNUP_START_RATE_LIMIT_MAX, 5),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many signup attempts. Please try again later.',
    errorCode: 'rate_limit_exceeded'
  }
});

const publicSignupExchangeLimiter = rateLimit({
  windowMs: parsePositiveInt(process.env.PUBLIC_SIGNUP_EXCHANGE_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  max: parsePositiveInt(process.env.PUBLIC_SIGNUP_EXCHANGE_RATE_LIMIT_MAX, 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many signup exchange attempts. Please try again later.',
    errorCode: 'rate_limit_exceeded'
  }
});

const publicSignupResendOtpLimiter = rateLimit({
  windowMs: parsePositiveInt(process.env.PUBLIC_SIGNUP_OTP_RESEND_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  max: parsePositiveInt(process.env.PUBLIC_SIGNUP_OTP_RESEND_RATE_LIMIT_MAX, 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many OTP resend attempts. Please try again later.',
    errorCode: 'rate_limit_exceeded'
  }
});

const publicTenantResolveLimiter = rateLimit({
  windowMs: parsePositiveInt(process.env.PUBLIC_TENANT_RESOLVE_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  max: parsePositiveInt(process.env.PUBLIC_TENANT_RESOLVE_RATE_LIMIT_MAX, 60),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many tenant lookup attempts. Please try again later.',
    errorCode: 'rate_limit_exceeded'
  }
});

const publicDemoRequestLimiter = rateLimit({
  windowMs: parsePositiveInt(process.env.PUBLIC_DEMO_REQUEST_RATE_LIMIT_WINDOW_MS, 60 * 60 * 1000),
  max: parsePositiveInt(process.env.PUBLIC_DEMO_REQUEST_RATE_LIMIT_MAX, 5),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many demo requests from this network. Please try again later or email info@capabble.cloud.',
    errorCode: 'rate_limit_exceeded'
  }
});

router.post('/auth/login', validateJoi(platformLoginSchema), loginPlatformAdmin);
router.post(
  '/public/auth/resolve-tenant',
  publicTenantResolveLimiter,
  validateJoi(publicTenantResolveByEmailSchema),
  resolveTenantByEmail
);
router.get(
  '/public/school-directory/:schoolCode',
  publicTenantResolveLimiter,
  validateParams(publicSchoolDirectoryLookupParamSchema),
  lookupSchoolDirectoryByCode
);
router.post(
  '/public/tenant-signup/start',
  publicSignupStartLimiter,
  validateJoi(publicTenantSignupStartSchema),
  startPublicTenantSignup
);
router.post(
  '/public/tenant-signup/resend-otp',
  publicSignupResendOtpLimiter,
  validateJoi(publicTenantSignupResendOtpSchema),
  resendPublicTenantSignupOtp
);
router.post(
  '/public/tenant-signup/exchange',
  publicSignupExchangeLimiter,
  validateJoi(publicTenantSignupExchangeSchema),
  exchangePublicTenantSignup
);

router.post(
  '/public/demo-requests',
  publicDemoRequestLimiter,
  validateJoi(publicDemoRequestSchema),
  demoRequestController.createDemoRequest
);

router.use(auth.protectPlatform);

router.get('/auth/me', getPlatformMe);
router.post('/auth/logout', logoutPlatformAdmin);

router.get('/tenants', validateQuery(tenantQuerySchema), listTenants);
router.post('/tenants', validateJoi(createTenantSchema), createTenant);
router.get('/tenants/:id', validateParams(tenantIdParamSchema), getTenantById);
router.patch(
  '/tenants/:id',
  validateParams(tenantIdParamSchema),
  validateJoi(updateTenantSchema),
  updateTenant
);
router.post('/tenants/:id/activate', validateParams(tenantIdParamSchema), activateTenant);
router.post('/tenants/:id/suspend', validateParams(tenantIdParamSchema), suspendTenant);
router.delete(
  '/tenants/:id',
  validateParams(tenantIdParamSchema),
  validateJoi(deleteTenantSchema),
  deleteTenant
);

// Demo requests (leads from capabble.cloud/request-demo)
router.get('/demo-requests', validateQuery(demoRequestQuerySchema), demoRequestController.listDemoRequests);
router.patch(
  '/demo-requests/:id',
  validateParams(tenantIdParamSchema),
  validateJoi(demoRequestUpdateSchema),
  demoRequestController.updateDemoRequest
);

// Tenant feature toggle routes
router.get('/features/pages', tenantFeaturesController.listFeaturePages);
router.get('/features/modules', tenantFeaturesController.listModules);
router.get('/features/tenants', tenantFeaturesController.listFeatureTenants);
router.get('/features/defaults', tenantFeaturesController.getDefaultFeatures);
router.get('/features/tenants/:id', validateParams(tenantIdParamSchema), tenantFeaturesController.getTenantFeatures);
router.put(
  '/features/defaults',
  validateJoi(tenantFeatureUpdateSchema),
  tenantFeaturesController.updateDefaultFeatures
);
router.put(
  '/features/tenants/:id',
  validateParams(tenantIdParamSchema),
  validateJoi(tenantFeatureUpdateSchema),
  tenantFeaturesController.updateTenantFeatures
);

// Master Subjects routes
router.post('/master-subjects/upload', masterSubjectsController.uploadSubjects);
router.get('/master-subjects', masterSubjectsController.listSubjects);
router.get('/master-subjects/stats', masterSubjectsController.getSubjectStats);
router.patch('/master-subjects/:id', masterSubjectsController.updateSubject);
router.delete('/master-subjects/:id', masterSubjectsController.deleteSubject);

// Master Datesheet routes
router.post('/master-datesheet/upload', masterDatesheetController.uploadDatesheet);
router.get('/master-datesheet', masterDatesheetController.listDatesheets);
router.get('/master-datesheet/:id', masterDatesheetController.getDatesheet);
router.delete('/master-datesheet/:id', masterDatesheetController.deleteDatesheet);

// Master Guidelines routes
router.post('/master-guidelines/upload', masterGuidelinesController.uploadGuidelines);
router.get('/master-guidelines', masterGuidelinesController.listGuidelines);
router.get('/master-guidelines/current', masterGuidelinesController.getCurrentGuideline);
router.get('/master-guidelines/:id', masterGuidelinesController.getGuideline);
router.delete('/master-guidelines/:id', masterGuidelinesController.deleteGuideline);

// Master Undertaking routes
router.post('/master-undertakings/upload', masterUndertakingsController.uploadUndertaking);
router.get('/master-undertakings', masterUndertakingsController.listUndertakings);
router.get('/master-undertakings/current', masterUndertakingsController.getCurrentUndertaking);
router.get('/master-undertakings/:id', masterUndertakingsController.getUndertaking);
router.delete('/master-undertakings/:id', masterUndertakingsController.deleteUndertaking);

// Master Remuneration rates routes
router.get('/master-remuneration', masterRemunerationController.listRates);
router.put('/master-remuneration', validateJoi(masterRemunerationUpdateSchema), masterRemunerationController.upsertRates);

// Master Packing & Dispatch routes
router.get('/master-packing-dispatch', masterPackingDispatchController.getCurrentSettings);
router.put(
  '/master-packing-dispatch',
  validateJoi(masterPackingDispatchUpdateSchema),
  masterPackingDispatchController.upsertSettings
);

// Master School Directory routes
router.post('/master-school-directory/upload', masterSchoolDirectoryController.uploadSchoolDirectory);
router.get('/master-school-directory', masterSchoolDirectoryController.listSchools);
router.delete('/master-school-directory', masterSchoolDirectoryController.deleteSchools);
router.patch(
  '/master-school-directory/:id/type',
  validateParams(tenantIdParamSchema),
  validateJoi(schoolDirectoryManualTypeSchema),
  masterSchoolDirectoryController.updateSchoolType
);
router.get('/master-school-directory/type-settings', schoolDirectoryTypeSettingsController.getSettings);
router.put(
  '/master-school-directory/type-settings',
  validateJoi(schoolDirectoryTypeSettingsSchema),
  schoolDirectoryTypeSettingsController.updateSettings
);

// Rollout routes
router.post('/rollouts/initiate', rolloutController.initiateRollout);
router.get('/rollouts', rolloutController.listRollouts);
router.get('/rollouts/:id', rolloutController.getRollout);
router.post('/rollouts/:id/retry', rolloutController.retryRollout);

// Master teacher import template routes
router.get('/master-teacher-template', masterTeacherTemplateController.getTemplate);
router.put('/master-teacher-template', masterTeacherTemplateController.updateTemplate);

// Billing (validated, stored and audited by the billing module)
router.use('/billing', billingAdminController.toBilling, billing.adminRouter);

module.exports = router;
