const express = require('express');
const { protect } = require('../middleware/auth');
const {
  getMyTimetable,
  getTimetableState,
  addClassSection,
  updateClassSection,
  removeClassSection,
  addTimetableSubject,
  setClassPeriods,
  setClassTeachers,
  setTeacherSubjects,
  setGridCell,
  clearGridCell,
  swapGridCells,
  upsertTimetableState,
  getBellTimings,
  upsertBellTimings,
  getBellTimingVersions,
  createBellTimingVersion,
  getBellTimingVersion,
  applyBellTimingVersion,
  deleteBellTimingVersion,
  generateTimetable,
  getVersions,
  getVersion,
  publishVersion,
  archiveVersion,
  deleteVersion,
  exportVersionExcel,
  exportVersionClassPDF,
  exportVersionTeacherPDF,
} = require('../controllers/timetableController');

const router = express.Router();

router.use(protect);

// The signed-in teacher's own periods (any staff login; see the catalog's route rule).
router.get('/me', getMyTimetable);

// ── Existing configuration endpoints ────────────────────────────────────────
router.route('/state').get(getTimetableState).put(upsertTimetableState);
// One change at a time (the app): each checks nobody saved in between.
router.post('/state/class-sections', addClassSection);
router.route('/state/class-sections/:id').patch(updateClassSection).delete(removeClassSection);
router.post('/state/subjects', addTimetableSubject);
router.put('/state/period-allocation/:classId', setClassPeriods);
router.put('/state/teacher-allocation/:classId', setClassTeachers);
router.put('/state/teachers/:id/subjects', setTeacherSubjects);
router.route('/state/grid/:classId/:day/:slot').put(setGridCell).delete(clearGridCell);
router.post('/state/grid/:classId/swap', swapGridCells);
router.route('/bell-timings').get(getBellTimings).put(upsertBellTimings);
router.route('/bell-timings/versions').get(getBellTimingVersions).post(createBellTimingVersion);
router.route('/bell-timings/versions/:id').get(getBellTimingVersion).delete(deleteBellTimingVersion);
router.post('/bell-timings/versions/:id/apply', applyBellTimingVersion);

// ── Generation ───────────────────────────────────────────────────────────────
router.post('/generate', generateTimetable);

// ── Version management ───────────────────────────────────────────────────────
router.route('/versions').get(getVersions);
router.route('/versions/:id').get(getVersion).delete(deleteVersion);
router.put('/versions/:id/publish', publishVersion);
router.put('/versions/:id/archive', archiveVersion);

// ── Exports ──────────────────────────────────────────────────────────────────
router.get('/versions/:id/export/excel', exportVersionExcel);
router.get('/versions/:id/export/class-pdf', exportVersionClassPDF);
router.get('/versions/:id/export/class-pdf/:classId', exportVersionClassPDF);
router.get('/versions/:id/export/teacher-pdf', exportVersionTeacherPDF);
router.get('/versions/:id/export/teacher-pdf/:teacherId', exportVersionTeacherPDF);

module.exports = router;
