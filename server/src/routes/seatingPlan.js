const express = require('express');
const router = express.Router();
const seatingPlanController = require('../controllers/seatingPlanController');
const { protect } = require('../middleware/auth');

router.use(protect);

// Room management routes
router.get('/rooms/asets-candidates', seatingPlanController.getAsetsExamRoomCandidates);
router.post('/rooms/sync-from-asets', seatingPlanController.syncExamRoomsFromAsets);
router.get('/rooms', seatingPlanController.getRooms);
router.post('/rooms', seatingPlanController.createRoom);
router.put('/rooms/:id', seatingPlanController.updateRoom);
router.delete('/rooms/:id', seatingPlanController.deleteRoom);

// Template settings routes
router.get('/template-settings', seatingPlanController.getTemplateSettings);
router.put('/template-settings', seatingPlanController.upsertTemplateSettings);
router.get('/room-allocation-mode', seatingPlanController.getRoomAllocationMode);
router.put('/room-allocation-mode', seatingPlanController.updateRoomAllocationMode);
router.get('/seating-plan-mode', seatingPlanController.getSeatingPlanMode);
router.put('/seating-plan-mode', seatingPlanController.updateSeatingPlanMode);

// PDF generation routes
router.get('/generate/main-gate/:datesheetId', seatingPlanController.generateMainGate);
router.get('/generate/room-folder-slip/:datesheetId', seatingPlanController.generateRoomFolderSlip);
router.get('/generate/room-door-slip/:datesheetId', seatingPlanController.generateRoomDoorSlip);
router.get('/generate/cbse-copy/:datesheetId', seatingPlanController.generateCBSECopy);

module.exports = router;
