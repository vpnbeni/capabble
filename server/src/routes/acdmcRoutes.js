const express = require('express');
const { protect } = require('../middleware/auth');
const { requirePermission } = require('../rbac/middleware');
const { buildSectionFilter, requireSectionInScope } = require('../rbac/scope');
const { requireTenantFeature } = require('../middleware/tenantFeatureAccess');
const ctrl = require('../controllers/acdmcController');
const schemas = require('../validations/acdmcValidation');

/**
 * Validates req.body with a Joi schema and answers with the first problem as
 * `message`, so the client can show "what to fix" without parsing details.
 */
const validateBody = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) {
    const details = error.details.map((detail) => ({
      field: detail.path.join('.'),
      message: detail.message.replace(/"/g, '')
    }));
    return res.status(400).json({ success: false, message: details[0].message, details });
  }
  req.body = value;
  return next();
};

const router = express.Router();
router.use(protect);
router.use(requireTenantFeature('acdmc_academics'));

// Lesson plans and class work belong to a class-section. A teacher whose grant
// is limited to their own sections only sees and changes those.
const CLASS_WORK_PERMISSION = { read: 'acdmc.classwork.read', write: 'acdmc.classwork.write' };

const scopeList = async (req, res, next) => {
  try {
    req.sectionScope = await buildSectionFilter(req, CLASS_WORK_PERMISSION.read, {
      classField: 'className',
      sectionField: 'section'
    });
    return next();
  } catch (error) {
    return next(error);
  }
};

const scopeRecord = (modelKey, action) => requireSectionInScope(CLASS_WORK_PERMISSION[action], async (req) => {
  const doc = await req.models?.[modelKey]?.findById(req.params.id).select('className section').lean();
  return doc ? { className: doc.className, section: doc.section } : null;
});

const scopeBody = requireSectionInScope(CLASS_WORK_PERMISSION.write, (req) => ({
  className: req.body?.className,
  section: req.body?.section
}));

router.get('/options', ctrl.getOptions);
router.get('/overview', ctrl.getOverview);

// Lesson plans
const LP = ctrl.MODEL_KEYS.LessonPlan;
router.get('/lesson-plans', scopeList, ctrl.lessonPlans.list);
router.get('/lesson-plans/:id', scopeRecord(LP, 'read'), ctrl.lessonPlans.get);
router.post('/lesson-plans', validateBody(schemas.lessonPlanSchema), scopeBody, ctrl.lessonPlans.create);
router.put(
  '/lesson-plans/:id',
  validateBody(schemas.lessonPlanSchema),
  scopeRecord(LP, 'write'),
  scopeBody,
  ctrl.lessonPlans.update
);
router.post(
  '/lesson-plans/:id/status',
  validateBody(schemas.lessonPlanStatusSchema),
  scopeRecord(LP, 'write'),
  ctrl.lessonPlans.setStatus
);
router.delete('/lesson-plans/:id', requirePermission('acdmc.classwork.delete'), scopeRecord(LP, 'write'), ctrl.lessonPlans.remove);

// Homework, assignments and quizzes share one shape
const mountClassWork = (path, handlers, schema, modelKey) => {
  router.get(path, scopeList, handlers.list);
  router.get(`${path}/:id`, scopeRecord(modelKey, 'read'), handlers.get);
  router.post(path, validateBody(schema), scopeBody, handlers.create);
  router.put(`${path}/:id`, validateBody(schema), scopeRecord(modelKey, 'write'), scopeBody, handlers.update);
  router.post(
    `${path}/:id/status`,
    validateBody(schemas.classWorkStatusSchema),
    scopeRecord(modelKey, 'write'),
    handlers.setStatus
  );
  router.get(`${path}/:id/roster`, scopeRecord(modelKey, 'read'), handlers.roster);
  router.put(
    `${path}/:id/submissions`,
    validateBody(schemas.submissionsSchema),
    scopeRecord(modelKey, 'write'),
    handlers.saveSubmissions
  );
  router.delete(
    `${path}/:id`,
    requirePermission('acdmc.classwork.delete'),
    scopeRecord(modelKey, 'write'),
    handlers.remove
  );
};

mountClassWork('/homework', ctrl.homework, schemas.homeworkSchema, ctrl.MODEL_KEYS.Homework);
mountClassWork('/assignments', ctrl.assignments, schemas.assignmentSchema, ctrl.MODEL_KEYS.Assignment);
mountClassWork('/quizzes', ctrl.quizzes, schemas.quizSchema, ctrl.MODEL_KEYS.Quiz);

// Curriculum (syllabus per class + subject)
router.get('/curriculum', ctrl.curriculum.list);
router.get('/curriculum/:id', ctrl.curriculum.get);
router.get('/curriculum/:id/coverage', ctrl.curriculum.coverage);
router.post('/curriculum', validateBody(schemas.curriculumSchema), ctrl.curriculum.create);
router.put('/curriculum/:id', validateBody(schemas.curriculumSchema), ctrl.curriculum.update);
router.post('/curriculum/:id/status', validateBody(schemas.curriculumStatusSchema), ctrl.curriculum.setStatus);
router.post('/curriculum/:id/copy', validateBody(schemas.curriculumCopySchema), ctrl.curriculum.copy);
router.delete('/curriculum/:id', requirePermission('acdmc.curriculum.delete'), ctrl.curriculum.remove);

module.exports = router;
