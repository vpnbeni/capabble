const { getRequestContext } = require('../tenancy/requestContext');

const actorFromUser = (user) => {
  if (!user) return {};
  return {
    userId: user._id || null,
    label: user.email || user.username || user.name || ''
  };
};

/**
 * Record a security event in the tenant's auth audit log. Never throws: audit
 * failures are logged but must not break the request.
 */
const recordAuthEvent = async (req, { event, actor, target, details = {}, model } = {}) => {
  try {
    const AuthAuditLog = model || req?.models?.AuthAuditLog || getRequestContext()?.models?.AuthAuditLog;
    if (!AuthAuditLog) return;
    await AuthAuditLog.create({
      event,
      actor: actorFromUser(actor === undefined ? req?.user : actor),
      target: actorFromUser(target),
      details,
      ip: String(req?.ip || '').slice(0, 64),
      userAgent: String(req?.headers?.['user-agent'] || '').slice(0, 300)
    });
  } catch (error) {
    console.error(`[auth-audit] failed to record ${event}: ${error.message}`);
  }
};

module.exports = { recordAuthEvent };
