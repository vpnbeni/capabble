const express = require('express');
const { protect } = require('../middleware/auth');
const ctrl = require('../controllers/notificationController');

/** Staff inbox. The family portal mounts the same handlers under /portal/notifications. */
const router = express.Router();
router.use(protect);

router.get('/', ctrl.listNotifications);
router.get('/unread-count', ctrl.unreadCount);
router.post('/read-all', ctrl.markAllRead);
router.post('/:id/read', ctrl.markRead);

module.exports = router;
