const express = require('express');
const { protect } = require('../middleware/auth');
const {
  getStaffDirectory,
  getStudentDirectory,
  getStudentFilters,
  getStaffAttendance,
  saveStaffAttendance,
  getStudentAttendance,
  saveStudentAttendance,
  getDashboard,
  getStudentRegisters,
} = require('../controllers/attndController');
const { requireTenantFeature, requireAnyTenantFeature } = require('../middleware/tenantFeatureAccess');
const { requireSectionInScope } = require('../rbac/scope');

// Teachers limited to their own sections must name one of them.
const classSectionFrom = (source) => (req) => ({
  className: req[source]?.className,
  section: req[source]?.section,
});
const scopedRead = requireSectionInScope('attnd.students.read', classSectionFrom('query'));
const scopedWrite = requireSectionInScope('attnd.students.write', classSectionFrom('body'));

const router = express.Router();

router.use(protect);

router.get(
  '/dashboard',
  requireAnyTenantFeature('attnd_staff_attendance', 'attnd_student_attendance'),
  getDashboard
);

router.get('/staff-directory', requireTenantFeature('attnd_staff_attendance'), getStaffDirectory);
router.get('/student-directory', requireTenantFeature('attnd_student_attendance'), scopedRead, getStudentDirectory);
router.get('/student-filters', requireTenantFeature('attnd_student_attendance'), getStudentFilters);

router.get('/staff', requireTenantFeature('attnd_staff_attendance'), getStaffAttendance);
router.put('/staff', requireTenantFeature('attnd_staff_attendance'), saveStaffAttendance);

router.get('/students', requireTenantFeature('attnd_student_attendance'), scopedRead, getStudentAttendance);
// Filters to the login's own sections itself, so it needs no class in the query.
router.get('/student-registers', requireTenantFeature('attnd_student_attendance'), getStudentRegisters);
router.put('/students', requireTenantFeature('attnd_student_attendance'), scopedWrite, saveStudentAttendance);

module.exports = router;
