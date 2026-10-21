const HttpError = require('../utils/httpError');
const { isConfigured } = require('../db/client');
const { SYSTEM_ACTOR } = require('../services/auditService');

// Billing needs its own Postgres database; without it these routes answer 503.
const requireBillingDatabase = (_req, _res, next) => (isConfigured()
  ? next()
  : next(new HttpError(503, 'Billing is not set up on this server')));

// The mounting route sets req.actor (school user or platform admin) for the audit log.
const ensureActor = (req, _res, next) => {
  if (!req.actor) req.actor = SYSTEM_ACTOR;
  next();
};

module.exports = { requireBillingDatabase, ensureActor };
