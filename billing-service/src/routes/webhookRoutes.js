const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { webhook } = require('../controllers/paymentController');

const router = express.Router();

// Authenticated by Razorpay's HMAC signature over the raw body, not the service token.
router.post('/razorpay', asyncHandler(webhook));

module.exports = router;
