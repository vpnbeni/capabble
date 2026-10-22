/**
 * CLNDR — Calendar.
 *
 * A calendar on every dashboard: school days (holidays, closures, half days),
 * school events with audience segments and per-audience instructions, and
 * dated items from other active modules. See docs/requirements/calendar-plan.md.
 *
 * Its two features (clndr_calendar, clndr_events) are billed as core, so every
 * school has them; SchoolDayRule and CalendarEvent are core models.
 */
const { mountRoutes } = require('./routes');

module.exports = {
  key: 'clndr',
  label: 'CLNDR — Calendar',
  mountRoutes,
  models: {},
  listeners: []
};
