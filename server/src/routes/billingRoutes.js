const express = require('express');
const { protect } = require('../middleware/auth');
const billing = require('../modules/billing');
const billingController = require('../controllers/billingController');

const router = express.Router();

router.use(protect);

// Reads need core.billing.read; writes need core.billing.manage (catalog route rule for /billing).
router.get('/me', billingController.getBillingMe);
router.use('/me', billingController.toBilling, billing.schoolRouter);

module.exports = router;
