const express = require('express');
const { protect } = require('../middleware/auth');
const ctrl = require('../push/controller');

/** Staff phones signed in to the Capabble app. The family portal mounts the same handlers under /portal/devices. */
const router = express.Router();
router.use(protect);

router.post('/', ctrl.registerDevice);
router.delete('/:token', ctrl.unregisterDevice);

module.exports = router;
