const { auditLog } = require('../db/schema');

// JSON-safe copy (Dates to ISO strings) so before/after diffs read cleanly.
const toPlain = (value) => (value == null ? null : JSON.parse(JSON.stringify(value)));

/**
 * Append an audit entry inside the caller's transaction, so the entry exists
 * exactly when the change it describes does.
 */
async function audit(tx, {
  actor,
  entityType,
  entityId,
  accountId = null,
  action,
  before = null,
  after = null,
}) {
  await tx.insert(auditLog).values({
    actorType: actor?.type || 'system',
    actorId: String(actor?.id || ''),
    requestId: String(actor?.requestId || ''),
    entityType,
    entityId: String(entityId),
    accountId,
    action,
    before: toPlain(before),
    after: toPlain(after),
  });
}

const SYSTEM_ACTOR = Object.freeze({ type: 'system', id: 'billing-service' });

module.exports = { audit, SYSTEM_ACTOR };
