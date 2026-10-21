/**
 * Bootstraps all event listeners on the shared event bus.
 * Called once during server startup (both normal and Vercel modes).
 *
 * Listeners are organized by module — each module exports a `register(eventBus)`
 * function from its listeners barrel file.
 */
const eventBus = require('./eventBus');
const coreListeners = require('../modules/core/listeners');
const cntrListeners = require('../modules/cntr/listeners');
const timetableListeners = require('../modules/timetable/listeners');
const appntListeners = require('../modules/appnt/listeners');
const notificationListeners = require('../notifications/listeners');

const registerAllListeners = () => {
  coreListeners.register(eventBus);
  cntrListeners.register(eventBus);
  timetableListeners.register(eventBus);
  appntListeners.register(eventBus);
  notificationListeners.register(eventBus);

  console.log('[event-bus] All listeners registered');
};

module.exports = registerAllListeners;
