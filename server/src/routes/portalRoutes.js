const express = require('express');
const { protect } = require('../middleware/auth');
const { requireAudience } = require('../rbac/middleware');
const { AUDIENCE } = require('../rbac/session');
const ctrl = require('../controllers/portalController');

/**
 * Parent / student portal. Only portal sessions reach here (the tenant access
 * gate also rejects staff sessions); everything is read-only and limited to the
 * account's own linked students.
 */
const router = express.Router();
router.use(protect);
router.use(requireAudience(AUDIENCE.PORTAL));
router.use(ctrl.usePortalSession);

router.get('/home', ctrl.getHome);
router.get('/notices', ctrl.listNotices);
router.get('/notices/:id', ctrl.getNotice);

router.use('/students/:studentId', ctrl.loadLinkedStudent);
router.get('/students/:studentId/profile', ctrl.getProfile);
router.get('/students/:studentId/attendance', ctrl.getAttendance);
router.get('/students/:studentId/timetable', ctrl.getTimetable);
router.get('/students/:studentId/results', ctrl.getResults);
router.get('/students/:studentId/fees', ctrl.getFees);
router.get('/students/:studentId/fees/receipts/:paymentId', ctrl.getReceiptPdf);
router.get('/students/:studentId/transport', ctrl.getTransport);

// The portal is read-only.
router.all('*', (req, res) => res.status(405).json({ success: false, message: 'Not allowed.' }));

module.exports = router;
