const express = require('express');
const rateLimit = require('express-rate-limit');
const { protect } = require('../middleware/auth');
const { requireAudience } = require('../rbac/middleware');
const { AUDIENCE } = require('../rbac/session');
const ctrl = require('../controllers/portalController');
const appnt = require('../controllers/appntPortalController');
const notifications = require('../controllers/notificationController');
const calendar = require('../modules/clndr/portal');
const { portalRequestSchema } = require('../validations/appntValidation');

/**
 * Parent / student portal. Only portal sessions reach here (the tenant access
 * gate also rejects staff sessions). Everything is limited to the account's own
 * linked students and read-only, except meeting requests (appointments),
 * replies to calendar events and marking the account's own notifications read.
 */
const router = express.Router();
router.use(protect);
router.use(requireAudience(AUDIENCE.PORTAL));
router.use(ctrl.usePortalSession);

router.get('/home', ctrl.getHome);
router.get('/notices', ctrl.listNotices);
router.get('/notices/:id', ctrl.getNotice);

// The account's own notifications (marking them read is the only other write here).
router.get('/notifications', notifications.listNotifications);
router.get('/notifications/unread-count', notifications.unreadCount);
router.post('/notifications/read-all', notifications.markAllRead);
router.post('/notifications/:id/read', notifications.markRead);

// Meeting requests: at most 20 writes per account in 15 minutes.
const appointmentWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.tenant?.slug || ''}:${req.user?._id || req.ip}`,
  message: { success: false, message: 'Too many meeting requests. Try again in a few minutes.' }
});
const validateRequest = (req, res, next) => {
  const { error, value } = portalRequestSchema.validate(req.body || {}, { abortEarly: true, stripUnknown: true });
  if (error) return res.status(400).json({ success: false, message: error.details[0].message.replace(/"/g, '') });
  req.body = value;
  return next();
};
// The family's calendar: school days, events for them and their children, fee dues, meetings.
router.get('/calendar', calendar.getCalendar);
router.get('/calendar/events/:id', calendar.viewEvent);
// Replies to events that ask for one (acknowledge, RSVP, consent): a narrow write, rate limited.
const calendarReplyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.tenant?.slug || ''}:${req.user?._id || req.ip}`,
  message: { success: false, message: 'Too many replies. Try again in a few minutes.' }
});
router.post('/calendar/events/:id/respond', calendarReplyLimiter, calendar.respondToEvent);

router.get('/appointments', appnt.listMine);
router.post('/appointments/:id/cancel', appointmentWriteLimiter, appnt.cancel);

router.use('/students/:studentId', ctrl.loadLinkedStudent);
router.get('/students/:studentId/profile', ctrl.getProfile);
router.get('/students/:studentId/attendance', ctrl.getAttendance);
router.get('/students/:studentId/timetable', ctrl.getTimetable);
router.get('/students/:studentId/results', ctrl.getResults);
router.get('/students/:studentId/fees', ctrl.getFees);
router.get('/students/:studentId/fees/receipts/:paymentId', ctrl.getReceiptPdf);
router.get('/students/:studentId/transport', ctrl.getTransport);
router.get('/students/:studentId/transport/live', ctrl.getTransportLive);
router.get('/students/:studentId/appointment-hosts', appnt.listHosts);
router.get('/students/:studentId/appointment-hosts/:hostId/slots', appnt.hostSlots);
router.post('/students/:studentId/appointments', appointmentWriteLimiter, validateRequest, appnt.request);

// Everything else in the portal is read-only.
router.all('*', (req, res) => res.status(405).json({ success: false, message: 'Not allowed.' }));

module.exports = router;
