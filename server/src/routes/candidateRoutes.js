const express = require('express');
const {
  getCandidates,
  getCandidate,
  getCandidateSubjectSerials,
  createCandidate,
  updateCandidate,
  deleteCandidate,
  importCandidatesFromPDF,
  getCandidateStats,
  removeSubjectCodeFromCandidates
} = require('../controllers/candidateController');

const { linkCandidateSubjects } = require('../controllers/linkCandidateSubjects');
const {
  reimportCompare,
  reimportImpact,
  reimportApply,
} = require('../controllers/candidateReimportController');

const { protect } = require('../middleware/auth');
const { requirePermission } = require('../rbac/middleware');
const { validateCandidate } = require('../validations/candidateValidation');

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// Routes
router
  .route('/')
  .get(getCandidates)
  .post(requirePermission('exam.candidates.write'), validateCandidate, createCandidate);

router
  .route('/stats')
  .get(getCandidateStats);

router
  .route('/import')
  .post(requirePermission('exam.candidates.write'), importCandidatesFromPDF);

router
  .route('/link-subjects')
  .post(requirePermission('exam.candidates.write'), linkCandidateSubjects);

router
  .route('/subject-code')
  .delete(requirePermission('exam.candidates.delete'), removeSubjectCodeFromCandidates);

router
  .route('/reimport-compare')
  .post(requirePermission('exam.candidates.delete'), reimportCompare);

router
  .route('/reimport-impact')
  .post(requirePermission('exam.candidates.delete'), reimportImpact);

router
  .route('/reimport-apply')
  .post(requirePermission('exam.candidates.delete'), reimportApply);

router
  .route('/:id/subject-serials')
  .get(getCandidateSubjectSerials);

router
  .route('/:id')
  .get(getCandidate)
  .put(requirePermission('exam.candidates.write'), validateCandidate, updateCandidate)
  .delete(requirePermission('exam.candidates.delete'), deleteCandidate);

module.exports = router;