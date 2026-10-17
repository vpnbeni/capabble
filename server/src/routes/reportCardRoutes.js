const express = require('express');

const router = express.Router();
const {
  generateSingle,
  generateBulk,
  getReportCardDesign,
  saveReportCardDesign,
  uploadReportCardImage
} = require('../controllers/reportCardController');
const { requireSectionInScope } = require('../rbac/scope');
const Student = require('../models/Student');

// Teachers limited to their own sections only print report cards for them.
const studentSection = async (req) => {
  const student = await (req.models?.Student || Student).findById(req.query.studentId).select('class section').lean();
  return student ? { className: student.class, section: student.section } : null;
};
const querySection = (req) => ({ className: req.query.class, section: req.query.section });

router.get('/design', getReportCardDesign);
router.put('/design', saveReportCardDesign);
router.post('/design/image', uploadReportCardImage);
router.get('/single', requireSectionInScope('exam.results.read', studentSection), generateSingle);
router.get('/bulk', requireSectionInScope('exam.results.read', querySection), generateBulk);

module.exports = router;
