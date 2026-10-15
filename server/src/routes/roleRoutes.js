const express = require('express');
const { protect } = require('../middleware/auth');
const ctrl = require('../controllers/roleController');

/** Roles. Reads need `core.users.read`, changes `core.users.manage` (tenant access gate). */
const router = express.Router();
router.use(protect);

router.get('/', ctrl.listRoles);
router.get('/catalog', ctrl.getCatalog);
router.post('/', ctrl.createRole);
router.put('/:id', ctrl.updateRole);
router.delete('/:id', ctrl.deleteRole);

module.exports = router;
