/**
 * "My calendar": everything a viewer should see between two school days.
 *
 *  - school days (holidays, vacations, closures, half days) for them, or for
 *    each of their children;
 *  - published events whose audience includes them, with only their parts;
 *  - items from other modules' calendar sources (exams, duties, fees, ...).
 */
const schoolDate = require('../../utils/schoolDate');
const { normalizeTenantFeatureToggles } = require('../../constants/tenantFeatures');
const { openSections } = require('../../rbac/portalSections');
const schoolDays = require('./schoolDays');
const { viewerContext, allViewerKeys } = require('./audience');
const { eventItems, visibleEventsFilter, PERMISSIONS } = require('./events');
const providers = require('./providers');
const { LAYERS } = require('./constants');

const MAX_RANGE_DAYS = 100;

const timeZoneFor = async (models) => {
  const profile = models.SchoolProfile ? await models.SchoolProfile.findOne({}).select('timeZone').lean() : null;
  return schoolDate.timeZoneOf(profile);
};

/** Items for days that are not ordinary working days (weekly offs are shown as shading, not items). */
const dayItems = (days, child = null) => Object.values(days).flatMap((day) => {
  const out = [];
  const base = {
    source: 'school_days', layer: 'school_days', startDate: day.date, endDate: day.date, allDay: true, readOnly: true
  };
  if (['holiday', 'vacation', 'closure', 'half_day'].includes(day.kind)) {
    const rule = day.rules.find((r) => r.kind === day.kind) || {};
    let title = day.label;
    if (day.kind === 'half_day' && day.halfDayEndTime) title = `${day.label} — school ends ${day.halfDayEndTime}`;
    out.push({
      ...base,
      id: `day:${rule.id || day.kind}:${day.date}${child ? `:${child.studentId}` : ''}`,
      title,
      kind: day.kind,
      mode: day.mode,
      tentative: day.tentative,
      detail: [rule.authority, rule.orderNo].filter(Boolean).join(' · '),
      child: child ? { studentId: child.studentId, name: child.name } : null
    });
  }
  (day.partial || []).filter((rule) => rule.kind !== 'weekly_off').forEach((rule) => {
    const who = [...(rule.appliesTo?.classes || []).map((c) => `class ${c}`), ...(rule.appliesTo?.sections || [])
      .map((s) => s.replace('|', ' '))].join(', ');
    out.push({
      ...base,
      id: `day:${rule.id}:${day.date}:partial`,
      title: `${rule.label} (${who})`,
      kind: rule.kind,
      mode: rule.mode,
      tentative: rule.tentative,
      partial: true
    });
  });
  return out;
});

/** Only the days worth sending: anything but an ordinary working day. */
const compactDays = (days) => Object.fromEntries(Object.values(days)
  .filter((day) => day.kind !== 'working' || day.partial.length)
  .map((day) => [day.date, {
    working: day.working,
    kind: day.kind,
    label: day.label,
    mode: day.mode,
    halfDayEndTime: day.halfDayEndTime,
    tentative: day.tentative,
    partial: day.partial.map((rule) => rule.label)
  }]));

const assertRange = (from, to) => {
  if (!schoolDate.isDateKey(from) || !schoolDate.isDateKey(to) || to < from) {
    throw Object.assign(new Error('Give from and to as YYYY-MM-DD, with to on or after from.'), { status: 400 });
  }
  if (schoolDate.daysBetween(from, to) > MAX_RANGE_DAYS) {
    throw Object.assign(new Error(`Ask for at most ${MAX_RANGE_DAYS} days at a time.`), { status: 400 });
  }
};

const sortItems = (a, b) => (a.startDate.localeCompare(b.startDate)
  || Number(b.allDay) - Number(a.allDay)
  || String(a.startTime || '').localeCompare(String(b.startTime || ''))
  || a.title.localeCompare(b.title));

/**
 * The calendar for the signed-in person. `portal` marks a family login on the
 * portal. `layers` (optional) limits which layers are returned.
 */
const calendarFor = async (req, { from, to, layers = null, portal = false }) => {
  assertRange(from, to);
  const { models } = req;
  const wanted = layers && layers.length ? new Set(layers) : null;
  const want = (layer) => !wanted || wanted.has(layer);
  const [viewer, timeZone] = await Promise.all([viewerContext(req), timeZoneFor(models)]);

  const rules = await schoolDays.loadRules(models, from, to);
  const schoolWide = await schoolDays.range(models, from, to, null, { rules });
  const childDays = await Promise.all(viewer.children.map(async (child) => ({
    child,
    days: await schoolDays.range(models, from, to, { className: child.className, section: child.section }, { rules })
  })));

  const items = [];
  if (want('school_days')) {
    if (viewer.kind === 'staff' || !childDays.length) {
      items.push(...dayItems(schoolWide));
    } else {
      // Per child, but say which child only when the children's days differ.
      const seen = new Map();
      childDays.forEach(({ child, days }) => dayItems(days, child).forEach((entry) => {
        const sameKey = `${entry.startDate}:${entry.title}`;
        if (seen.has(sameKey)) {
          seen.get(sameKey).child = null;
          return;
        }
        seen.set(sameKey, entry);
        items.push(entry);
      }));
      if (childDays.length === 1) items.forEach((entry) => { if (entry.layer === 'school_days') entry.child = null; });
    }
  }

  const isWorking = (key) => (schoolWide[key] ? schoolWide[key].working : true);
  if (want('events') || want('school_days')) {
    const { CalendarEvent } = models;
    const events = CalendarEvent
      ? await CalendarEvent.find(visibleEventsFilter(allViewerKeys(viewer), viewer, from, to))
        .select('-sendLog -targetKeys').lean()
      : [];
    const canManage = viewer.kind === 'staff' && Boolean(req.rbac?.has(PERMISSIONS.MANAGE));
    items.push(...eventItems(events, viewer, from, to, { isWorking, canManage, portal })
      .filter((entry) => want(entry.layer)));
  }

  const toggles = normalizeTenantFeatureToggles(req.tenant?.featureToggles);
  const { items: moduleItems, failed } = await providers.collect({
    models,
    viewer,
    user: req.user,
    rbac: req.rbac,
    from,
    to,
    timeZone,
    portal,
    portalSections: portal ? openSections(req, req.user.kind) : [],
    featureOn: (key) => toggles[key] !== false,
    layers: wanted ? [...wanted] : null
  });
  items.push(...moduleItems);

  const days = viewer.kind === 'staff' || childDays.length !== 1 ? schoolWide : childDays[0].days;
  return {
    from,
    to,
    timeZone,
    today: schoolDate.today(timeZone),
    days: compactDays(days),
    items: items.sort(sortItems),
    failedSources: failed,
    layers: Object.entries(LAYERS).map(([key, layer]) => ({ key, ...layer })),
    children: viewer.children.map(({ studentId, name, className, section }) => ({
      studentId, name, className, section
    }))
  };
};

module.exports = { calendarFor, timeZoneFor, compactDays, dayItems, MAX_RANGE_DAYS };
