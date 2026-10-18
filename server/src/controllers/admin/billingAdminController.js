// Platform admin billing: the admin session is checked by adminRoutes, the billing module
// (src/modules/billing/routes/adminRoutes.js) validates, stores and audits.
const { invalidateEntitlement } = require('../../middleware/billingEntitlement');

const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/** Records who is acting and drops cached entitlements after a change, so access follows at once. */
const toBilling = (req, res, next) => {
  req.actor = {
    type: 'platform_admin',
    id: req.platformUser?._id ? String(req.platformUser._id) : '',
    requestId: req.headers['x-request-id'] || ''
  };
  if (WRITE_METHODS.includes(req.method)) {
    res.on('finish', () => {
      if (res.statusCode < 400) invalidateEntitlement();
    });
  }
  next();
};

module.exports = { toBilling };
