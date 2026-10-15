const express = require('express');
const { protect, authorize } = require('../middleware/auth');
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

router.get('/options', ctrl.getOptions);
router.get('/overview', ctrl.getOverview);

// Lesson plans
router.get('/lesson-plans', ctrl.lessonPlans.list);
router.get('/lesson-plans/:id', ctrl.lessonPlans.get);
router.post('/lesson-plans', validateBody(schemas.lessonPlanSchema), ctrl.lessonPlans.create);
router.put('/lesson-plans/:id', validateBody(schemas.lessonPlanSchema), ctrl.lessonPlans.update);
router.post('/lesson-plans/:id/status', validateBody(schemas.lessonPlanStatusSchema), ctrl.lessonPlans.setStatus);
router.delete('/lesson-plans/:id', authorize('admin'), ctrl.lessonPlans.remove);

// Homework, assignments and quizzes share one shape
const mountClassWork = (path, handlers, schema) => {
  router.get(path, handlers.list);
  router.get(`${path}/:id`, handlers.get);
  router.post(path, validateBody(schema), handlers.create);
  router.put(`${path}/:id`, validateBody(schema), handlers.update);
  router.post(`${path}/:id/status`, validateBody(schemas.classWorkStatusSchema), handlers.setStatus);
  router.get(`${path}/:id/roster`, handlers.roster);
  router.put(`${path}/:id/submissions`, validateBody(schemas.submissionsSchema), handlers.saveSubmissions);
  router.delete(`${path}/:id`, authorize('admin'), handlers.remove);
};

mountClassWork('/homework', ctrl.homework, schemas.homeworkSchema);
mountClassWork('/assignments', ctrl.assignments, schemas.assignmentSchema);
mountClassWork('/quizzes', ctrl.quizzes, schemas.quizSchema);

// Curriculum (syllabus per class + subject)
router.get('/curriculum', ctrl.curriculum.list);
router.get('/curriculum/:id', ctrl.curriculum.get);
router.get('/curriculum/:id/coverage', ctrl.curriculum.coverage);
router.post('/curriculum', validateBody(schemas.curriculumSchema), ctrl.curriculum.create);
router.put('/curriculum/:id', validateBody(schemas.curriculumSchema), ctrl.curriculum.update);
router.post('/curriculum/:id/status', validateBody(schemas.curriculumStatusSchema), ctrl.curriculum.setStatus);
router.post('/curriculum/:id/copy', validateBody(schemas.curriculumCopySchema), ctrl.curriculum.copy);
router.delete('/curriculum/:id', authorize('admin'), ctrl.curriculum.remove);

module.exports = router;
