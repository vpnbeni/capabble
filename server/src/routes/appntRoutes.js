const express = require('express');
const { protect } = require('../middleware/auth');
const { requireTenantFeature } = require('../middleware/tenantFeatureAccess');
const { requirePermission } = require('../rbac/middleware');
const ctrl = require('../controllers/appntController');
const schemas = require('../validations/appntValidation');
const { P } = require('../modules/appnt/access');

/** Validates req.body with a Joi schema; answers with the first problem as `message`. */
const validateBody = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
  if (error) {
    const details = error.details.map((detail) => ({ field: detail.path.join('.'), message: detail.message.replace(/"/g, '') }));
    return res.status(400).json({ success: false, message: details[0].message, details });
  }
  req.body = value;
  return next();
};

const ANY = [P.VIEW, P.BOOK, P.MANAGE, P.HOST, P.SETTINGS, P.REPORT];
const SEE = [P.VIEW, P.HOST];
// Hosts act on their own appointments; the controller checks ownership.
const ACT = [P.MANAGE, P.HOST];

const router = express.Router();
router.use(protect);
router.use(requireTenantFeature('appnt_desk'));

router.get('/today', requirePermission(SEE), ctrl.today);

router.get('/appointments', requirePermission(SEE), ctrl.list);
router.post('/appointments', requirePermission([P.BOOK, P.MANAGE, P.HOST]), validateBody(schemas.bookingSchema), ctrl.create);
router.post('/appointments/walk-in', requirePermission([P.BOOK, P.MANAGE]), validateBody(schemas.walkInSchema), ctrl.walkIn);
router.get('/appointments/:id', requirePermission(SEE), ctrl.get);
router.post('/appointments/:id/reschedule', requirePermission(ACT), validateBody(schemas.rescheduleSchema), ctrl.reschedule);
router.put('/appointments/:id/notes', requirePermission([P.HOST, P.NOTES]), validateBody(schemas.notesSchema), ctrl.saveNotes);
router.post('/appointments/:id/:action(confirm|decline|check-in|complete|no-show|cancel)', requirePermission(ACT), validateBody(schemas.actionSchema), ctrl.act);

router.get('/hosts', requirePermission(ANY), ctrl.listHosts);
router.get('/hosts/me', requirePermission(P.HOST), ctrl.myHost);
router.put('/hosts/me/availability', requirePermission(P.HOST), validateBody(schemas.availabilitySchema), ctrl.updateMyAvailability);
router.post('/hosts', requirePermission(P.SETTINGS), validateBody(schemas.hostSchema), ctrl.createHost);
router.put('/hosts/:id', requirePermission(P.SETTINGS), validateBody(schemas.hostSchema), ctrl.updateHost);
router.get('/hosts/:id/slots', requirePermission([P.VIEW, P.BOOK, P.MANAGE, P.HOST]), ctrl.hostSlots);

router.get('/lookup/staff', requirePermission([P.BOOK, P.MANAGE, P.SETTINGS]), ctrl.lookupStaff);
router.get('/lookup/students', requirePermission([P.BOOK, P.MANAGE]), ctrl.lookupStudents);

router.get('/settings', requirePermission(ANY), ctrl.getSettings);
router.put('/settings', requirePermission(P.SETTINGS), validateBody(schemas.settingsSchema), ctrl.updateSettings);

router.get('/reports/summary', requirePermission(P.REPORT), ctrl.reportSummary);

module.exports = router;
