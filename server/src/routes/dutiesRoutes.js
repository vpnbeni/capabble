const express = require('express');
const { protect } = require('../middleware/auth');
const { requirePermission } = require('../rbac/middleware');
const {
  getDailyDuties,
  assignDailyDuties,
  downloadFunctionaryDutyRecord,
  rebuildAllSupervisionHistory,
} = require('../controllers/dutiesController');
const {
  getDutySelections,
  saveDutySelections,
  getDutyAllocationMode,
  updateDutyAllocationMode,
  getDutySelectionCounts,
} = require('../controllers/dutySelectionController');

const router = express.Router();

router.use(protect);

router.get('/', getDailyDuties);
router.post('/assign', requirePermission('exam.duties.write'), assignDailyDuties);
router.get('/functionary-duty-record', downloadFunctionaryDutyRecord);

// Duty selections (pre-assignment)
router.get('/selections/counts', getDutySelectionCounts);
router.get('/selections', getDutySelections);
router.post('/selections', requirePermission('exam.duties.write'), saveDutySelections);
router.get('/allocation-mode', getDutyAllocationMode);
router.put('/allocation-mode', requirePermission('exam.duties.write'), updateDutyAllocationMode);

// Rebuild supervision history from existing duty assignments (migration/recovery)
router.post('/rebuild-supervision-history', requirePermission('exam.duties.write'), rebuildAllSupervisionHistory);

module.exports = router;
