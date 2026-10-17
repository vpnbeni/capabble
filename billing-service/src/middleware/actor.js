const { ACTOR_TYPES } = require('../domain/constants');

// Who asked for a change, as passed on by the main server; recorded in the audit log.
module.exports = function attachActor(req, _res, next) {
  const type = String(req.headers['x-billing-actor-type'] || 'system');
  req.actor = {
    type: ACTOR_TYPES.includes(type) && type !== 'provider' ? type : 'system',
    id: String(req.headers['x-billing-actor-id'] || '').slice(0, 120),
    requestId: String(req.headers['x-request-id'] || '').slice(0, 120),
  };
  next();
};
