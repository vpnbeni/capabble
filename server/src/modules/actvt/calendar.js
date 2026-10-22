/**
 * Activities on the calendar for staff who can see activities: planned
 * activity events, school functions, tours and sports meets. They stay owned
 * by ACTVT; families see school events through the calendar's own events.
 */
const schoolDate = require('../../utils/schoolDate');
const { item } = require('../clndr/providers');

const endOf = (start, end) => (schoolDate.isDateKey(end) ? end : start);
const overlaps = (start, end, from, to) => schoolDate.isDateKey(start) && start <= to && endOf(start, end) >= from;
const groupName = (e) => ({ house: e.houseName, club: e.clubName }[e.scopeType] || '');

const activities = {
  key: 'actvt.activities',
  layer: 'activities',
  features: ['actvt_activities'],
  audiences: ['staff'],
  list: async ({ models, rbac, from, to }) => {
    if (!rbac?.has('actvt.activities.read')) return [];
    const { ActivityEvent, ActivityFunction, ActivityTour, ActivitySportsMeet } = models;
    const active = { isActive: { $ne: false } };
    const [events, functions, tours, meets] = await Promise.all([
      ActivityEvent ? ActivityEvent.find({ ...active, status: { $ne: 'cancelled' }, date: { $gte: from, $lte: to } })
        .select('title date activityType venue incharge houseName clubName scopeType').lean() : [],
      ActivityFunction ? ActivityFunction.find({ ...active, date: { $gte: from, $lte: to } })
        .select('title date functionType venue incharge').lean() : [],
      ActivityTour
        ? ActivityTour.find({ ...active, startDate: { $lte: to } })
          .select('title destination startDate endDate classes').lean()
        : [],
      ActivitySportsMeet
        ? ActivitySportsMeet.find({ ...active, startDate: { $lte: to } }).select('title venue startDate endDate').lean()
        : []
    ]);

    const items = [];
    events.filter((e) => schoolDate.isDateKey(e.date)).forEach((e) => items.push(item({
      id: `activity:${e._id}`,
      title: e.title,
      startDate: e.date,
      venue: e.venue,
      detail: [e.activityType, groupName(e), e.incharge && `In-charge: ${e.incharge}`]
        .filter(Boolean).join(' · '),
      link: '/actvt/calendar'
    })));
    functions.filter((f) => schoolDate.isDateKey(f.date)).forEach((f) => items.push(item({
      id: `function:${f._id}`,
      title: f.title,
      startDate: f.date,
      venue: f.venue,
      detail: [f.functionType, f.incharge && `In-charge: ${f.incharge}`].filter(Boolean).join(' · '),
      link: '/actvt/functions'
    })));
    tours.filter((t) => overlaps(t.startDate, t.endDate, from, to)).forEach((t) => items.push(item({
      id: `tour:${t._id}`,
      title: `Tour: ${t.title}`,
      startDate: t.startDate,
      endDate: schoolDate.isDateKey(t.endDate) ? t.endDate : t.startDate,
      venue: t.destination,
      detail: t.classes ? `Classes: ${t.classes}` : '',
      link: '/actvt/tours'
    })));
    meets.filter((m) => overlaps(m.startDate, m.endDate, from, to)).forEach((m) => items.push(item({
      id: `sports:${m._id}`,
      title: m.title,
      startDate: m.startDate,
      endDate: schoolDate.isDateKey(m.endDate) ? m.endDate : m.startDate,
      venue: m.venue,
      link: '/actvt/sports'
    })));
    return items;
  }
};

module.exports = [activities];
