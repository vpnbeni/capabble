const express = require('express');
const { protect } = require('../middleware/auth');
const ctrl = require('../controllers/userAdminController');

/**
 * Login management. Access is enforced by the tenant access gate from the
 * permission catalog: reads need `core.users.read`, changes `core.users.manage`.
 */
const router = express.Router();
router.use(protect);

router.get('/', ctrl.listUsers);
router.post('/', ctrl.createUser);
router.post('/bulk-portal', ctrl.bulkCreatePortalLogins);
router.get('/candidates/staff', ctrl.listStaffCandidates);
router.get('/candidates/students', ctrl.listStudentCandidates);
router.get('/candidates/classes', ctrl.listClassCandidates);
router.get('/candidates/sections', ctrl.listSectionOptions);
router.get('/audit', ctrl.listAuditLog);
router.get('/:id', ctrl.getUser);
router.patch('/:id', ctrl.updateUser);
router.post('/:id/reset-password', ctrl.resetUserPassword);
router.post('/:id/sign-out', ctrl.signOutEverywhere);

module.exports = router;
