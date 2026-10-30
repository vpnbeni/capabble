const express = require('express');
const rateLimit = require('express-rate-limit');
const { protect } = require('../middleware/auth');
const { requireTenantFeature } = require('../middleware/tenantFeatureAccess');
const {
  getOverview,
  listVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  listRoutes,
  createRoute,
  updateRoute,
  deleteRoute,
  listSelfStudents,
  createSelfStudent,
  updateSelfStudent,
  deleteSelfStudent,
} = require('../controllers/trnstController');
const crew = require('../controllers/trnst/crewController');
const live = require('../controllers/trnst/liveController');
const assignments = require('../controllers/trnst/assignmentController');
const places = require('../controllers/trnst/placesController');

const router = express.Router();

router.use(protect);
router.use(requireTenantFeature('trnst_transport'));

// Phones send a point about every 10 s; allow bursts after a signal gap.
const locationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.tenant?.slug || ''}:${req.user?._id || req.ip}`,
  message: { success: false, message: 'Location updates are coming in too fast.' },
});

// Crew screen (driver / conductor), limited to their own bus.
router.use('/crew', requireTenantFeature('trnst_crew'));
router.get('/crew/me', crew.getMe);
router.post('/crew/trips', crew.startTrip);
router.post('/crew/trips/:id/locations', locationLimiter, crew.postLocations);
router.post('/crew/trips/:id/end', crew.endTrip);
router.get('/crew/trips/:id/roster', crew.getRoster);
router.get('/crew/trips/:id/students/:studentId', crew.getStudentCard);
router.post('/crew/trips/:id/boarding', crew.markBoarding);
router.delete('/crew/trips/:id/boarding/:studentId/:event', crew.unmarkBoarding);

// Admin live view and trip history.
router.get('/live', live.getLive);
router.get('/trips', live.listTrips);
router.get('/trips/:id', live.getTrip);

// Place search for putting stops on the map.
router.get('/places', places.searchPlaces);

// Which route and stop each student uses.
router.get('/assignments', assignments.listAssignments);
router.post('/assignments/bulk', assignments.assignStudents);
router.delete('/assignments/:studentId', assignments.removeAssignment);

router.get('/overview', getOverview);
router.get('/vehicles', listVehicles);
router.post('/vehicles', createVehicle);
router.put('/vehicles/:id', updateVehicle);
router.delete('/vehicles/:id', deleteVehicle);
router.get('/routes', listRoutes);
router.post('/routes', createRoute);
router.put('/routes/:id', updateRoute);
router.delete('/routes/:id', deleteRoute);
router.get('/self-students', listSelfStudents);
router.post('/self-students', createSelfStudent);
router.put('/self-students/:id', updateSelfStudent);
router.delete('/self-students/:id', deleteSelfStudent);

module.exports = router;
