const express = require('express');
const { getResults, upsertResults, getResultEntryStatus } = require('../controllers/examResultController');
const { requireSectionInScope } = require('../rbac/scope');

const router = express.Router();

// Teachers limited to their own sections may only read or enter marks for them.
const fromQuery = (req) => ({ className: req.query.class, section: req.query.section });
const fromBody = (req) => ({ className: req.body?.class, section: req.body?.section });

router.get('/status', getResultEntryStatus);
router.get('/', requireSectionInScope('exam.results.read', fromQuery), getResults);
router.post('/bulk', requireSectionInScope('exam.results.write', fromBody), upsertResults);

module.exports = router;
