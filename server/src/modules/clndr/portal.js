/**
 * The family portal calendar: a parent's or student's own calendar, with every
 * linked child merged (each item says which child it is for). Read-only.
 */
const schoolDate = require('../../utils/schoolDate');
const { openSections } = require('../../rbac/portalSections');
const { calendarFor, timeZoneFor } = require('./service');
const { viewerContext } = require('./audience');
const { viewForViewer } = require('./events');
const { handle } = require('./controller');

const assertOpen = (req) => {
  if (!openSections(req, req.user.kind).includes('calendar')) {
    throw Object.assign(new Error('The calendar is not available.'), { status: 404 });
  }
};

// GET /api/portal/calendar?from&to
const getCalendar = handle(async (req, res) => {
  assertOpen(req);
  const today = schoolDate.today(await timeZoneFor(req.models));
  const from = schoolDate.isDateKey(req.query.from) ? req.query.from : `${today.slice(0, 7)}-01`;
  const to = schoolDate.isDateKey(req.query.to) ? req.query.to : schoolDate.addDays(from, 41);
  const data = await calendarFor(req, { from, to, portal: true });
  res.json({ success: true, data });
});

// GET /api/portal/calendar/events/:id — one event as this family sees it
const viewEvent = handle(async (req, res) => {
  assertOpen(req);
  const { CalendarEvent } = req.models;
  const event = CalendarEvent ? await CalendarEvent.findById(req.params.id).select('-sendLog').lean() : null;
  const viewer = event && event.status !== 'draft' ? await viewerContext(req) : null;
  const view = viewer && ['published', 'cancelled'].includes(event.status) ? viewForViewer(event, viewer) : null;
  if (!view) return res.status(404).json({ success: false, message: 'Event not found.' });
  return res.json({ success: true, data: { ...view, canEdit: false } });
});

module.exports = { getCalendar, viewEvent };
