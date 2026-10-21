/**
 * In-process event bus for cross-module communication.
 *
 * Wraps Node.js EventEmitter with:
 *  - setImmediate dispatch (non-blocking — never slows the API response)
 *  - per-listener try/catch (one failure doesn't affect others)
 *  - tenant-aware payloads (handlers receive { tenant, ...data })
 *
 * Usage:
 *   const eventBus = require('./eventBus');
 *   const EVENTS  = require('./eventNames');
 *
 *   // Emit (in a controller, after the DB write):
 *   eventBus.emit(EVENTS.TEACHER_DEACTIVATED, {
 *     tenant: { dbName: req.tenant.dbName, slug: req.tenant.slug, id: req.tenant.id },
 *     teacherId: String(teacher._id),
 *   });
 *
 *   // Listen (in a listener file):
 *   bus.on(EVENTS.TEACHER_DEACTIVATED, async (payload) => { ... });
 */
const { EventEmitter } = require('events');

class EventBus extends EventEmitter {
  /**
   * Override emit to dispatch each listener via setImmediate with isolated
   * error handling.  Returns true if at least one listener existed.
   */
  emit(eventName, payload) {
    const listeners = this.listeners(eventName);
    if (listeners.length === 0) return false;

    const enriched = {
      ...payload,
      _emittedAt: new Date().toISOString(),
      _event: eventName,
    };

    for (const listener of listeners) {
      setImmediate(async () => {
        try {
          await listener(enriched);
        } catch (err) {
          console.error(
            `[event-bus] Listener error on "${eventName}":`,
            err.message || err
          );
        }
      });
    }
    return true;
  }

  /** Emit from a request handler: adds the tenant ref and who did it. */
  emitFromRequest(req, eventName, data = {}) {
    return this.emit(eventName, {
      tenant: { dbName: req.tenant?.dbName, slug: req.tenant?.slug, id: String(req.tenant?.id || '') },
      actorId: req.user?._id ? String(req.user._id) : null,
      actorName: req.user?.name || req.user?.email || '',
      ...data,
    });
  }
}

const bus = new EventBus();
bus.setMaxListeners(50);

module.exports = bus;
