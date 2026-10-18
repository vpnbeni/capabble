// Razorpay webhooks. Mounted at /api/webhooks before the server's body parsers and
// sanitizers, because the signature is over the exact raw bytes.
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const errorHandler = require('../middleware/errorHandler');
const { webhook } = require('../controllers/paymentController');
const { requireBillingDatabase } = require('./guards');

const router = express.Router();

router.post(
  '/razorpay',
  express.raw({ type: '*/*', limit: '2mb' }),
  (req, _res, next) => {
    req.rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    next();
  },
  requireBillingDatabase,
  asyncHandler(webhook)
);

router.use(errorHandler);

module.exports = router;
