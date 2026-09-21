const express = require('express');
const { getResults, upsertResults, getResultEntryStatus } = require('../controllers/examResultController');

const router = express.Router();

router.get('/status', getResultEntryStatus);
router.get('/', getResults);
router.post('/bulk', upsertResults);

module.exports = router;
