const express = require('express');
const {
  getDesign,
  putDesign,
  uploadSignature,
  listClasses,
  generateCards,
  verifyCard
} = require('../controllers/idCardController');
const { uploadFormatCanvasImage } = require('../controllers/formatCanvasController');

const router = express.Router();

router.get('/design', getDesign);
router.put('/design', putDesign);
router.post('/design/image', uploadFormatCanvasImage);
router.post('/design/signature', uploadSignature);
router.get('/classes', listClasses);
router.post('/generate', generateCards);
router.get('/verify/:token', verifyCard);

module.exports = router;
