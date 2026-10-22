/**
 * Calendar events: recurrence, preparing input, who may target what, and
 * turning events into items for one viewer.
 */
const crypto = require('crypto');
const schoolDate = require('../../utils/schoolDate');
const { SCOPE_TYPES, REMINDER_PRESETS } = require('./constants');
const {
  scopeKey, eventTargetKeys, matchEvent, normalizeSectionValue
} = require('./audience');
const { normalizeClassName } = require('../../rbac/scope');

const MAX_OCCURRENCES = 400;
const WIDE_SCOPES = new Set(['all', 'role', 'house', 'route']);
const FAMILY = new Set(['parent', 'student']);

const PERMISSIONS = Object.freeze({
  CREATE: 'clndr.events.create',
  PUBLISH_WIDE: 'clndr.events.publish_wide',
  APPROVE: 'clndr.events.approve',
  MANAGE: 'clndr.events.manage'
});

const httpError = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });

// ---------------------------------------------------------------------------
// Recurrence
// ---------------------------------------------------------------------------

const addMonths = (key, months) => {
  const [y, m, d] = key.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  if (d > lastDay) return null; // e.g. the 31st in a 30-day month: skipped, like most calendars.
  target.setUTCDate(d);
  return target.toISOString().slice(0, 10);
};

/**
 * Start dates of every occurrence of `event` that overlaps [from, to].
 * `isWorking(dateKey)` (optional) drops non-working days when the event asks.
 * Returns [{ startDate, endDate }].
 */
const occurrences = (event, from, to, { isWorking = null } = {}) => {
  const span = schoolDate.daysBetween(event.startDate, event.endDate || event.startDate);
  const rule = event.recurrence || {};
  const make = (start) => ({ startDate: start, endDate: schoolDate.addDays(start, span) });
  const overlaps = (occ) => occ.startDate <= to && occ.endDate >= from;

  if (!rule.freq) {
    const occ = make(event.startDate);
    return overlaps(occ) ? [occ] : [];
  }

  const until = rule.until && rule.until < to ? rule.until : to;
  const exDates = new Set(rule.exDates || []);
  const interval = Math.max(1, Number(rule.interval) || 1);
  const keep = (start) => !exDates.has(start) && (!rule.skipNonWorking || !isWorking || isWorking(start));
  const out = [];
  const push = (start) => {
    if (out.length >= MAX_OCCURRENCES || start < event.startDate || start > until) return;
    const occ = make(start);
    if (overlaps(occ) && keep(start)) out.push(occ);
  };

  if (rule.freq === 'daily') {
    // Jump close to the window instead of walking from the first date.
    const behind = Math.max(0, schoolDate.daysBetween(event.startDate, from) - span);
    let start = schoolDate.addDays(event.startDate, Math.floor(behind / interval) * interval);
    while (start <= until && out.length < MAX_OCCURRENCES) {
      push(start);
      start = schoolDate.addDays(start, interval);
    }
  } else if (rule.freq === 'weekly') {
    const days = (rule.byDay && rule.byDay.length ? rule.byDay : [schoolDate.weekday(event.startDate)]).slice().sort();
    const weekStart = (key) => schoolDate.addDays(key, -schoolDate.weekday(key));
    const firstWeek = weekStart(event.startDate);
    const behindWeeks = Math.max(0, Math.floor((schoolDate.daysBetween(firstWeek, from) - span) / 7));
    let week = schoolDate.addDays(firstWeek, Math.floor(behindWeeks / interval) * interval * 7);
    while (week <= until && out.length < MAX_OCCURRENCES) {
      const thisWeek = week;
      days.forEach((day) => push(schoolDate.addDays(thisWeek, day))); // eslint-disable-line no-loop-func
      week = schoolDate.addDays(week, interval * 7);
    }
  } else if (rule.freq === 'monthly') {
    for (let i = 0; out.length < MAX_OCCURRENCES; i += interval) {
      const start = addMonths(event.startDate, i);
      if (start === null) continue; // eslint-disable-line no-continue
      if (start > until) break;
      push(start);
      if (i > 12 * 50) break;
    }
  }
  return out;
};

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const cleanScopes = (personType, scopes = []) => {
  const seen = new Set();
  return scopes
    .map((scope) => {
      const type = String(scope?.type || '');
      let value = String(scope?.value ?? '').trim();
      if (type === 'section' || (type === 'classteacher' && value.includes('|'))) value = normalizeSectionValue(value);
      const wholeClass = type === 'class' || (type === 'classteacher' && !value.includes('|'));
      if (wholeClass) value = value ? normalizeClassName(value) : '';
      if (type === 'student') value = value.toUpperCase();
      return { type, value: type === 'all' ? '' : value, label: String(scope?.label || '').slice(0, 120) };
    })
    .filter((scope) => scopeKey(personType, scope))
    .filter((scope) => {
      const key = scopeKey(personType, scope);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const segmentKey = () => crypto.randomBytes(4).toString('hex');

/** Normalise composer input into stored segments; unusable scopes are dropped. */
const prepareSegments = (segments = []) => segments.map((segment) => {
  const { personType } = segment;
  const reminders = (segment.reminders || []).filter((key) => REMINDER_PRESETS[key]);
  return {
    key: String(segment.key || segmentKey()).slice(0, 40),
    label: String(segment.label || '').trim().slice(0, 80),
    personType,
    scopes: cleanScopes(personType, segment.scopes),
    exclude: cleanScopes(personType, segment.exclude),
    role: segment.role || 'attendee',
    instructions: String(segment.instructions || '').trim(),
    attachments: (segment.attachments || []).filter((a) => a?.name && a?.url),
    notify: segment.notify || 'now',
    email: Boolean(segment.email),
    reminders: [...new Set(reminders)],
    response: segment.response || 'none',
    responseDeadline: segment.responseDeadline || undefined
  };
}).filter((segment) => SCOPE_TYPES[segment.personType] && segment.scopes.length);

/** Fields that, when changed after publishing, make it a new revision people should hear about. */
const MATERIAL_FIELDS = ['title', 'startDate', 'endDate', 'startTime', 'endTime', 'allDay', 'venue'];

const segmentFingerprint = (segment) => JSON.stringify([
  segment.personType, segment.scopes, segment.exclude, segment.instructions, segment.role, segment.attachments
]);

/**
 * What changed between two versions of an event, for deciding who to tell.
 * Returns { material, fields, changedSegments, addedSegments, removedSegments }.
 */
const diffEvents = (before, after) => {
  const fields = MATERIAL_FIELDS.filter((field) => String(before[field] ?? '') !== String(after[field] ?? ''));
  if (JSON.stringify(before.recurrence || {}) !== JSON.stringify(after.recurrence || {})) fields.push('recurrence');
  const beforeSegments = new Map((before.segments || []).map((s) => [s.key, s]));
  const afterSegments = new Map((after.segments || []).map((s) => [s.key, s]));
  const changedSegments = [...afterSegments.values()]
    .filter((s) => beforeSegments.has(s.key) && segmentFingerprint(beforeSegments.get(s.key)) !== segmentFingerprint(s))
    .map((s) => s.key);
  const addedSegments = [...afterSegments.keys()].filter((key) => !beforeSegments.has(key));
  const removedSegments = [...beforeSegments.keys()].filter((key) => !afterSegments.has(key));
  return {
    material: fields.length > 0 || changedSegments.length > 0 || addedSegments.length > 0 || removedSegments.length > 0,
    fields,
    changedSegments,
    addedSegments,
    removedSegments
  };
};

const newUid = (tenantSlug) => `${crypto.randomUUID()}@${tenantSlug || 'school'}.capabble.cloud`;

// ---------------------------------------------------------------------------
// Who may target what
// ---------------------------------------------------------------------------

/**
 * Check the creator may send to these segments. Throws 403 with a plain reason.
 *  - manage / publish_wide: anything;
 *  - create (all classes): any class, section or named person, not whole-school, roles, houses or routes;
 *  - create (assigned): only the sections they teach (or their class teachers), and named people.
 */
const assertCanTarget = async ({ rbac, assignedSections }, segments, visibility = 'segments') => {
  if (rbac.hasAny([PERMISSIONS.MANAGE, PERMISSIONS.PUBLISH_WIDE])) return;
  if (!rbac.has(PERMISSIONS.CREATE)) throw httpError(403, 'You do not have permission to create calendar events.');
  if (visibility !== 'segments') {
    throw httpError(403, 'Only the principal or office can show an event to the whole school.');
  }
  const assignedOnly = rbac.scopeOf(PERMISSIONS.CREATE) === 'assigned';
  const mine = assignedOnly ? await assignedSections() : [];
  const mySections = new Set(mine.map((s) => s.key));

  segments.forEach((segment) => {
    segment.scopes.forEach((scope) => {
      if (WIDE_SCOPES.has(scope.type)) {
        throw httpError(403, 'Ask the principal or office to send to the whole school, a role, a house or a route.');
      }
      if (!assignedOnly || scope.type === 'user') return;
      const ok = (scope.type === 'section' && mySections.has(scope.value))
        || (scope.type === 'classteacher' && mySections.has(scope.value));
      if (!ok) throw httpError(403, 'You can only create events for the classes you teach.');
    });
  });
};

/** Does publishing this event need the principal's approval? */
const TRUSTED = [PERMISSIONS.MANAGE, PERMISSIONS.PUBLISH_WIDE, PERMISSIONS.APPROVE];
const needsApproval = (rbac, segments) => !rbac.hasAny(TRUSTED)
  && segments.some((segment) => FAMILY.has(segment.personType));

// ---------------------------------------------------------------------------
// Viewing
// ---------------------------------------------------------------------------

const SAFE_ATTACHMENT = (a) => ({ name: a.name, url: a.url });

/** The parts of an event one viewer may see: shared fields plus their own segments. */
const viewForViewer = (event, viewer, { canManage = false } = {}) => {
  const { visible, segments } = matchEvent(event, viewer);
  const isCreator = viewer.userId && String(event.createdBy) === viewer.userId;
  if (!visible && !canManage && !isCreator) return null;
  return {
    id: String(event._id),
    uid: event.uid,
    revision: event.revision,
    title: event.title,
    description: event.description,
    category: event.category,
    allDay: event.allDay,
    startDate: event.startDate,
    endDate: event.endDate,
    startTime: event.startTime || null,
    endTime: event.endTime || null,
    venue: event.venue,
    critical: Boolean(event.critical),
    circularNo: event.circularNo || '',
    status: event.status,
    attachments: (event.attachments || []).map(SAFE_ATTACHMENT),
    recurring: Boolean(event.recurrence?.freq),
    createdByName: viewer.kind === 'staff' ? event.createdByName || '' : '',
    parts: segments.map(({ segment, child }) => ({
      segmentKey: segment.key,
      label: segment.label,
      role: segment.role,
      instructions: segment.instructions,
      attachments: (segment.attachments || []).map(SAFE_ATTACHMENT),
      response: segment.response,
      responseDeadline: segment.responseDeadline || null,
      child: child ? { studentId: child.studentId, name: child.name } : null
    })),
    canEdit: canManage || Boolean(isCreator)
  };
};

/** Calendar items (one per occurrence in range) for events a viewer can see. */
const eventItems = (events, viewer, from, to, { isWorking, canManage = false, portal = false } = {}) => {
  const items = [];
  events.forEach((event) => {
    const view = viewForViewer(event, viewer, { canManage: canManage && !portal });
    if (!view || (view.parts.length === 0 && event.visibility === 'segments' && !view.canEdit)) return;
    occurrences(event, from, to, { isWorking }).forEach((occ) => {
      const multi = occ.startDate !== occ.endDate;
      items.push({
        ...view,
        id: `event:${view.id}:${occ.startDate}`,
        eventId: view.id,
        occurrence: occ.startDate,
        source: 'calendar',
        layer: event.category === 'holiday' ? 'school_days' : 'events',
        startDate: occ.startDate,
        endDate: occ.endDate,
        detail: event.description ? event.description.slice(0, 280) : '',
        multiDay: multi,
        link: `${portal ? '/portal/calendar' : '/calendar'}?event=${view.id}&date=${occ.startDate}`,
        readOnly: !view.canEdit
      });
    });
  });
  return items;
};

/** Mongo filter for published events a viewer could see in [from, to]. */
const visibleEventsFilter = (viewerKeys, viewer, from, to) => {
  const audience = [{ targetKeys: { $in: viewerKeys } }, { visibility: 'whole_school' }];
  if (viewer.kind === 'staff') audience.push({ visibility: 'all_staff' });
  return {
    status: 'published',
    startDate: { $lte: to },
    $and: [
      { $or: [{ endDate: { $gte: from } }, { 'recurrence.freq': { $in: ['daily', 'weekly', 'monthly'] } }] },
      { $or: audience }
    ]
  };
};

module.exports = {
  PERMISSIONS,
  MATERIAL_FIELDS,
  httpError,
  occurrences,
  prepareSegments,
  diffEvents,
  newUid,
  assertCanTarget,
  needsApproval,
  viewForViewer,
  eventItems,
  visibleEventsFilter,
  eventTargetKeys
};
