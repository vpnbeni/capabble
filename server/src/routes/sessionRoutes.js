const express = require('express');
const { protect } = require('../middleware/auth');
const { requirePermission } = require('../rbac/middleware');
const {
  getSessions,
  getAvailableSessions,
  createSession,
  carryForward,
} = require('../controllers/sessionController');

const router = express.Router();

// All session routes require authentication
router.use(protect);

// List existing sessions for the tenant
router.get('/', getSessions);

// Available sessions (generated from calendar)
router.get('/available', getAvailableSessions);

// Enter an existing session (any staff) or create one (needs core.school.write; checked in the controller)
router.post('/', createSession);

// Carry forward data from one session to another (admin only)
router.post('/:label/carry-forward', requirePermission('core.school.write'), carryForward);

module.exports = router;
