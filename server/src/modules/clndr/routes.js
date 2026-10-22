const express = require('express');
const { protect } = require('../../middleware/auth');
const { requireTenantFeature } = require('../../middleware/tenantFeatureAccess');
const ctrl = require('./controller');
const schemas = require('./validation');
const mailSettings = require('../../mail/settingsController');

/**
 * /api/calendar — the signed-in staff member's calendar and calendar events.
 * /api/school-days — the school-day master (holidays, closures, weekly offs).
 * Route-level access comes from the permission catalog (`/calendar`, `/school-days`);
 * finer checks (who may target whom, approval) live in the controller.
 */
const calendar = express.Router();
calendar.use(protect);
calendar.use(requireTenantFeature('clndr_calendar'));

calendar.get('/me', ctrl.getMine);
calendar.get('/days', ctrl.getDays);
calendar.get('/view/:id', ctrl.viewEvent);
calendar.post('/view/:id/respond', ctrl.body(schemas.respond), ctrl.respondToEvent);

const events = express.Router();
events.use(requireTenantFeature('clndr_events'));
events.get('/', ctrl.listEvents);
events.post('/', ctrl.body(schemas.createEvent), ctrl.createEvent);
events.get('/:id', ctrl.getEvent);
events.patch('/:id', ctrl.body(schemas.updateEvent), ctrl.updateEvent);
events.delete('/:id', ctrl.deleteEvent);
events.post('/:id/publish', ctrl.body(schemas.publishEvent), ctrl.publishEvent);
events.post('/:id/approve', ctrl.approveEvent);
events.post('/:id/reject', ctrl.body(schemas.rejectEvent), ctrl.rejectEvent);
events.post('/:id/cancel', ctrl.body(schemas.cancelEvent), ctrl.cancelEvent);
events.get('/:id/responses', ctrl.listResponses);
events.post('/:id/remind-pending', ctrl.remindPending);
calendar.use('/events', events);

calendar.get('/audience/options', requireTenantFeature('clndr_events'), ctrl.audienceOptions);
calendar.get('/audience/people', requireTenantFeature('clndr_events'), ctrl.lookupPeople);
calendar.post(
  '/audience/preview',
  requireTenantFeature('clndr_events'),
  ctrl.body(schemas.previewAudience),
  ctrl.previewAudience
);

const schoolDays = express.Router();
schoolDays.use(protect);
schoolDays.get('/', ctrl.listSchoolDays);
schoolDays.post('/rules', ctrl.body(schemas.createRule), ctrl.createRule);
schoolDays.post('/rules/bulk', ctrl.body(schemas.bulkRules), ctrl.createRules);
schoolDays.patch('/rules/:id', ctrl.body(schemas.updateRule), ctrl.updateRule);
schoolDays.post('/rules/:id/cancel', ctrl.cancelRule);

const mountRoutes = (router) => {
  router.use('/calendar', calendar);
  router.use('/school-days', schoolDays);
  // School email (Settings → School email): used by calendar emails and any later school mail.
  mailSettings.mountRoutes(router);
};

module.exports = { mountRoutes };
