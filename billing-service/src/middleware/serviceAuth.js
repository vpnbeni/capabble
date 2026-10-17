const crypto = require('crypto');
const HttpError = require('../utils/httpError');

const safeEqual = (a, b) => {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

// Without a token only local development is allowed through (checked again at boot).
const ensureServiceAuth = (req, _res, next) => {
  const expected = process.env.BILLING_SERVICE_TOKEN;
  if (!expected) {
    if (process.env.NODE_ENV === 'production') return next(new HttpError(503, 'Billing service token is not configured'));
    return next();
  }
  const received = req.headers['x-billing-service-token'];
  if (!received || !safeEqual(received, expected)) {
    return next(new HttpError(401, 'Invalid service credentials'));
  }
  return next();
};

module.exports = { ensureServiceAuth, safeEqual };
