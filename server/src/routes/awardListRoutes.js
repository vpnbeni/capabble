const express = require('express');
const router = express.Router();
const {
  generateAwardList,
  getAwardListDesign,
  saveAwardListDesign,
} = require('../controllers/awardListController');
const { uploadFormatCanvasImage } = require('../controllers/formatCanvasController');
const { requireSectionInScope } = require('../rbac/scope');

router.get('/design', getAwardListDesign);
router.put('/design', saveAwardListDesign);
router.post('/design/image', uploadFormatCanvasImage);
// Teachers limited to their own sections only print award lists for them.
const awardListSection = (req) => {
  const payload = req.method === 'POST' ? req.body || {} : req.query || {};
  return { className: payload.class, section: payload.section };
};

router.get('/', requireSectionInScope('exam.results.read', awardListSection), generateAwardList);
router.post('/', requireSectionInScope('exam.results.read', awardListSection), generateAwardList);

module.exports = router;
