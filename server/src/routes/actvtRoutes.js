const express = require('express');
const { protect } = require('../middleware/auth');
const { requireTenantFeature } = require('../middleware/tenantFeatureAccess');
const {
  clubs,
  houses,
  tours,
  sportsFacilities,
  sports,
  functions,
  events,
  criteria,
  points,
  certificates,
  ranking,
  studentProfiles,
  councils,
  councilPosts,
  councilRegistrations,
} = require('../controllers/actvtController');

const mountCrud = (router, path, handlers) => {
  router.get(path, handlers.list);
  router.post(path, handlers.create);
  router.put(`${path}/:id`, handlers.update);
  router.delete(`${path}/:id`, handlers.remove);
};

const router = express.Router();
router.use(protect);
router.use(requireTenantFeature('actvt_activities'));

router.get('/clubs/:id/details', clubs.details);
router.get('/students/:id/profile', studentProfiles.profile);
mountCrud(router, '/clubs', clubs);
router.get('/houses/stats', houses.stats);
router.get('/houses/:id/details', houses.details);
mountCrud(router, '/houses', houses);
mountCrud(router, '/tours', tours);
mountCrud(router, '/sports/facilities', sportsFacilities);
mountCrud(router, '/sports', sports);
mountCrud(router, '/functions', functions);
mountCrud(router, '/events', events);
mountCrud(router, '/criteria', criteria);
mountCrud(router, '/points', points);
router.get('/ranking', ranking.summary);
router.post('/certificates/pdf', certificates.pdf);
mountCrud(router, '/certificates', certificates);

router.get('/councils', councils.list);
router.get('/councils/board', councils.board);
router.post('/councils', councils.create);
router.put('/councils/:id', councils.update);
router.delete('/councils/:id', councils.remove);
router.get('/councils/:id/details', councils.details);

router.post('/council-posts', councilPosts.create);
router.put('/council-posts/:id', councilPosts.update);
router.delete('/council-posts/:id', councilPosts.remove);

router.post('/council-registrations', councilRegistrations.create);
router.put('/council-registrations/:id', councilRegistrations.update);
router.delete('/council-registrations/:id', councilRegistrations.remove);

module.exports = router;
