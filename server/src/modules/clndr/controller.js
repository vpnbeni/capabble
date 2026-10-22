/**
 * Calendar (CLNDR) API for the school panel: my calendar, school days, and
 * creating, publishing, approving and cancelling events.
 */
const schoolDate = require('../../utils/schoolDate');
const { getAssignedSections, normalizeClassName, sectionKey } = require('../../rbac/scope');
const { roleTemplates } = require('../../rbac/catalog');
const { send } = require('../../notifications/send');
const recipients = require('../../notifications/recipients');
const { calendarFor, timeZoneFor } = require('./service');
const schoolDays = require('./schoolDays');
const {
  PERMISSIONS, httpError, prepareSegments, diffEvents, newUid, assertCanTarget, needsApproval, viewForViewer,
  eventTargetKeys
} = require('./events');
const { viewerContext, resolveRecipients } = require('./audience');
const { deliverLater, summary, tenantRefOf } = require('./delivery');
const { summaryFor } = require('../../mail/outbox');
const {
  respond, tracker, pendingRecipients, attachResponses
} = require('./responses');

/** Wrap a handler: errors with `status` become that response; anything else goes to the error handler. */
const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    if (error.status) {
      const extra = error.details ? { details: error.details } : {};
      return res.status(error.status).json({ success: false, message: error.message, ...extra });
    }
    if (error.name === 'ValidationError') {
      const first = Object.values(error.errors || {})[0];
      return res.status(400).json({ success: false, message: first?.message || error.message });
    }
    return next(error);
  }
};

/** Validate req.body with a Joi schema. */
const body = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body || {}, { abortEarly: true, stripUnknown: true });
  if (error) return res.status(400).json({ success: false, message: error.details[0].message.replace(/"/g, '') });
  req.body = value;
  return next();
};

const can = (req, ...keys) => Boolean(req.rbac?.hasAny(keys));
const isMine = (req, event) => String(event.createdBy || '') === String(req.user._id);
const actorFor = (req) => ({ rbac: req.rbac, assignedSections: () => getAssignedSections(req) });

const rangeFromQuery = (query, today) => {
  const from = schoolDate.isDateKey(query.from) ? query.from : `${today.slice(0, 7)}-01`;
  const to = schoolDate.isDateKey(query.to) ? query.to : schoolDate.addDays(from, 41);
  return { from, to };
};

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

// GET /api/calendar/me?from&to&layers=a,b
const getMine = handle(async (req, res) => {
  const today = schoolDate.today(await timeZoneFor(req.models));
  const { from, to } = rangeFromQuery(req.query, today);
  const layers = String(req.query.layers || '').split(',').map((s) => s.trim()).filter(Boolean);
  const data = await calendarFor(req, { from, to, layers });
  res.json({ success: true, data });
});

// GET /api/calendar/days?from&to&class&section — the school-day map other screens use
const getDays = handle(async (req, res) => {
  const today = schoolDate.today(await timeZoneFor(req.models));
  const { from, to } = rangeFromQuery(req.query, today);
  const scope = req.query.class
    ? { className: String(req.query.class), section: String(req.query.section || '') }
    : null;
  const days = await schoolDays.range(req.models, from, to, scope);
  res.json({ success: true, data: { from, to, days } });
});

// GET /api/calendar/view/:id — one event as this person sees it
const viewEvent = handle(async (req, res) => {
  const { CalendarEvent } = req.models;
  const event = await CalendarEvent.findById(req.params.id).select('-sendLog').lean();
  const mayOpen = event
    && (event.status === 'published' || isMine(req, event) || can(req, PERMISSIONS.MANAGE, PERMISSIONS.APPROVE));
  if (!mayOpen) {
    throw httpError(404, 'Event not found.');
  }
  const viewer = await viewerContext(req);
  const view = viewForViewer(event, viewer, { canManage: can(req, PERMISSIONS.MANAGE) });
  if (!view) throw httpError(404, 'Event not found.');
  await attachResponses(req.models, viewer.userId, [{ eventId: view.id, parts: view.parts }]);
  res.json({ success: true, data: view });
});

const listFields = 'title category startDate endDate startTime endTime allDay status publishAt publishedAt revision '
  + 'createdBy createdByName submittedBy rejectionNote visibility critical recurrence.freq '
  + 'segments.label segments.personType '
  + 'updatedAt cancelledAt';

// GET /api/calendar/events?status&mine=1 — the events list for creators and approvers
const listEvents = handle(async (req, res) => {
  const { CalendarEvent } = req.models;
  const filter = {};
  if (req.query.status) filter.status = { $in: String(req.query.status).split(',') };
  const seesAll = can(req, PERMISSIONS.MANAGE, PERMISSIONS.APPROVE);
  if (!seesAll || req.query.mine === '1') filter.createdBy = req.user._id;
  if (req.query.from && schoolDate.isDateKey(req.query.from)) filter.endDate = { $gte: req.query.from };
  const events = await CalendarEvent.find(filter).select(listFields).sort({ updatedAt: -1 }).limit(200).lean();
  res.json({
    success: true,
    data: events.map((event) => ({
      ...event,
      id: String(event._id),
      audiences: (event.segments || []).map((s) => s.label || s.personType),
      segments: undefined,
      mine: isMine(req, event)
    }))
  });
});

const loadEditable = async (req) => {
  const { CalendarEvent } = req.models;
  const event = await CalendarEvent.findById(req.params.id);
  if (!event) throw httpError(404, 'Event not found.');
  const mine = isMine(req, event);
  if (!mine && !can(req, PERMISSIONS.MANAGE)) {
    if (event.status === 'pending_approval' && can(req, PERMISSIONS.APPROVE)) return event;
    throw httpError(403, 'Only the person who created this event, or the principal, can change it.');
  }
  if (mine && !can(req, PERMISSIONS.CREATE, PERMISSIONS.MANAGE, PERMISSIONS.PUBLISH_WIDE)) {
    throw httpError(403, 'You do not have permission to change calendar events.');
  }
  return event;
};

// GET /api/calendar/events/:id — everything, for the editor, with how its emails went
const getEvent = handle(async (req, res) => {
  const event = await loadEditable(req);
  const plain = event.toObject();
  const emails = await summaryFor(req.models, plain._id);
  res.json({ success: true, data: { ...plain, id: String(plain._id), mine: isMine(req, event), emails } });
});

// ---------------------------------------------------------------------------
// Writing events
// ---------------------------------------------------------------------------

const EVENT_FIELDS = [
  'title', 'description', 'category', 'allDay', 'startDate', 'venue',
  'visibility', 'critical', 'circularNo', 'attachments'
];

const assignFields = (event, input) => {
  // A one-day event moved to a new date stays a one-day event.
  const singleDay = !event.endDate || event.endDate === event.startDate;
  if (input.startDate !== undefined && input.endDate === undefined && singleDay) event.endDate = input.startDate;
  EVENT_FIELDS.forEach((field) => { if (input[field] !== undefined) event[field] = input[field]; });
  if (input.endDate !== undefined || input.startDate !== undefined) {
    event.endDate = input.endDate || event.endDate || event.startDate;
  }
  if (input.startTime !== undefined) event.startTime = input.startTime || undefined;
  if (input.endTime !== undefined) event.endTime = input.endTime || undefined;
  if (input.recurrence !== undefined) {
    event.recurrence = input.recurrence?.freq
      ? { ...input.recurrence, until: input.recurrence.until || undefined }
      : { freq: null, interval: 1, byDay: [], exDates: [], skipNonWorking: true };
  }
  if (input.segments !== undefined) {
    event.segments = prepareSegments(input.segments);
    event.targetKeys = eventTargetKeys(event.segments);
  }
  if (input.publishAt !== undefined) event.publishAt = input.publishAt ? new Date(input.publishAt) : null;
  event.academicSession = schoolDate.sessionLabelFor(event.startDate);
};

const assertPublishable = (event) => {
  if (event.visibility === 'segments' && !(event.segments || []).length) {
    throw httpError(400, 'Choose who this event is for before publishing.');
  }
  if (event.recurrence?.freq && !event.recurrence.until) {
    // Repeating events stop at the end of the session unless told otherwise.
    event.recurrence.until = schoolDate.sessionDates(schoolDate.sessionLabelFor(event.startDate))?.endDate;
  }
};

const approversFor = async (req, event) => (await recipients.usersWithPermission(req.models, [PERMISSIONS.APPROVE]))
  .filter((user) => String(user._id) !== String(event.createdBy));

/** Make an approved or trusted event live: scheduled for later, or published and announced now. */
const goLive = async (req, event) => {
  if (event.publishAt && event.publishAt > new Date()) {
    event.status = 'scheduled';
    await event.save();
    return { status: event.status, publishAt: event.publishAt };
  }
  event.status = 'published';
  event.publishedAt = new Date();
  await event.save();
  const runId = await deliverLater(req, event, { change: 'published' });
  return { status: event.status, runId };
};

/** Publish now, schedule, or send for approval. Saves the event. */
const publish = async (req, event, { publishAt } = {}) => {
  if (event.status === 'cancelled') throw httpError(400, 'This event was cancelled.');
  if (event.status === 'published') throw httpError(400, 'This event is already published.');
  if (publishAt !== undefined) event.publishAt = publishAt ? new Date(publishAt) : null;
  assertPublishable(event);
  await assertCanTarget(actorFor(req), event.segments, event.visibility);

  if (needsApproval(req.rbac, event.segments)) {
    event.status = 'pending_approval';
    event.submittedBy = req.user._id;
    event.rejectionNote = '';
    await event.save();
    const approvers = await approversFor(req, event);
    await send(tenantRefOf(req), approvers, 'calendar.approval_requested', {
      event: summary(event), byName: req.user.name || '', entity: { type: 'calendar_event', id: String(event._id) }
    });
    return { status: event.status };
  }
  return goLive(req, event);
};

// POST /api/calendar/events
const createEvent = handle(async (req, res) => {
  const { CalendarEvent } = req.models;
  if (!can(req, PERMISSIONS.CREATE, PERMISSIONS.MANAGE, PERMISSIONS.PUBLISH_WIDE)) {
    throw httpError(403, 'You do not have permission to create calendar events.');
  }
  const event = new CalendarEvent({
    uid: newUid(req.tenant?.slug),
    status: 'draft',
    createdBy: req.user._id,
    createdByName: req.user.name || req.user.email || '',
    updatedBy: req.user._id
  });
  assignFields(event, req.body);
  await assertCanTarget(actorFor(req), event.segments, event.visibility);
  await event.validate();
  let outcome = { status: 'draft' };
  if (req.body.publish) outcome = await publish(req, event);
  else await event.save();
  res.status(201).json({ success: true, data: { id: String(event._id), ...outcome } });
});

/** Who hears about an edit: segment keys to notify as 'changed' and as 'added'. */
const notifyPlan = (diff, mode, event) => {
  if (mode === 'none' || !diff.material) return { changed: [], added: [] };
  const all = event.segments.map((s) => s.key);
  if (mode === 'everyone' || diff.fields.length) {
    return { changed: all.filter((key) => !diff.addedSegments.includes(key)), added: diff.addedSegments };
  }
  return { changed: diff.changedSegments, added: diff.addedSegments };
};

// PATCH /api/calendar/events/:id
const updateEvent = handle(async (req, res) => {
  const event = await loadEditable(req);
  if (event.status === 'cancelled') throw httpError(400, 'This event was cancelled and can no longer be changed.');
  const before = event.toObject();
  assignFields(event, req.body);
  event.updatedBy = req.user._id;
  await assertCanTarget(actorFor(req), event.segments, event.visibility);
  const diff = diffEvents(before, event.toObject());

  if (event.status !== 'published') {
    await event.save();
    return res.json({ success: true, data: { id: String(event._id), status: event.status, changed: diff } });
  }

  if (diff.material) event.revision += 1;
  // A teacher's material change to an event families see goes back to the principal.
  if (diff.material && needsApproval(req.rbac, event.segments)) {
    event.status = 'draft';
    const outcome = await publish(req, event);
    return res.json({ success: true, data: { id: String(event._id), ...outcome, changed: diff } });
  }
  assertPublishable(event);
  await event.save();

  const plan = notifyPlan(diff, req.body.notify, event);
  const runs = [];
  if (plan.changed.length) {
    runs.push(await deliverLater(req, event, { change: 'changed', onlySegments: plan.changed, changes: diff.fields }));
  }
  if (plan.added.length) runs.push(await deliverLater(req, event, { change: 'added', onlySegments: plan.added }));
  if (req.body.notify !== 'none' && diff.removedSegments.length) {
    // People in removed audiences hear it's no longer for them.
    const old = { ...before, segments: before.segments.filter((s) => diff.removedSegments.includes(s.key)) };
    const { recipients: removed } = await resolveRecipients(req.models, old);
    const stillIn = (await resolveRecipients(req.models, event)).recipients;
    const extraUsers = [...removed.values()].filter(({ user }) => !stillIn.has(String(user._id)));
    if (extraUsers.length) runs.push(await deliverLater(req, event, { change: 'removed', extraUsers }));
  }
  return res.json({
    success: true, data: { id: String(event._id), status: event.status, changed: diff, runs: runs.length }
  });
});

// POST /api/calendar/events/:id/publish
const publishEvent = handle(async (req, res) => {
  const event = await loadEditable(req);
  if (!['draft', 'scheduled'].includes(event.status)) throw httpError(400, 'Only a draft can be published.');
  if (event.status === 'scheduled') event.status = 'draft';
  const outcome = await publish(req, event, { publishAt: req.body.publishAt });
  res.json({ success: true, data: { id: String(event._id), ...outcome } });
});

const loadPending = async (req) => {
  const event = await req.models.CalendarEvent.findById(req.params.id);
  if (!event) throw httpError(404, 'Event not found.');
  if (event.status !== 'pending_approval') throw httpError(400, 'This event is not waiting for approval.');
  if (isMine(req, event) && !can(req, PERMISSIONS.MANAGE)) {
    throw httpError(403, 'Someone else has to approve your event.');
  }
  return event;
};

// POST /api/calendar/events/:id/approve
const approveEvent = handle(async (req, res) => {
  const event = await loadPending(req);
  event.approvedBy = req.user._id;
  event.approvedAt = new Date();
  const outcome = await goLive(req, event);
  const creator = event.createdBy ? await recipients.byIds(req.models, [event.createdBy]) : [];
  await send(tenantRefOf(req), creator, 'calendar.approval_decided', {
    event: summary(event), decision: 'approved', entity: { type: 'calendar_event', id: String(event._id) }
  });
  res.json({ success: true, data: { id: String(event._id), ...outcome } });
});

// POST /api/calendar/events/:id/reject
const rejectEvent = handle(async (req, res) => {
  const event = await loadPending(req);
  event.status = 'draft';
  event.rejectionNote = req.body.note || '';
  await event.save();
  const creator = event.createdBy ? await recipients.byIds(req.models, [event.createdBy]) : [];
  await send(tenantRefOf(req), creator, 'calendar.approval_decided', {
    event: summary(event),
    decision: 'returned',
    note: event.rejectionNote,
    entity: { type: 'calendar_event', id: String(event._id) }
  });
  res.json({ success: true, data: { id: String(event._id), status: event.status } });
});

// POST /api/calendar/events/:id/cancel { reason, occurrence?, notify }
const cancelEvent = handle(async (req, res) => {
  const event = await loadEditable(req);
  if (event.status === 'cancelled') throw httpError(400, 'This event is already cancelled.');
  const wasLive = event.status === 'published';
  const { occurrence, reason, notify } = req.body;

  if (occurrence && event.recurrence?.freq) {
    // Cancel one date of a repeating event.
    event.recurrence.exDates = [...new Set([...(event.recurrence.exDates || []), occurrence])];
    event.updatedBy = req.user._id;
    await event.save();
    if (wasLive && notify) await deliverLater(req, event, { change: 'cancelled', occurrence, reason });
    return res.json({
      success: true, data: { id: String(event._id), status: event.status, cancelledOccurrence: occurrence }
    });
  }

  event.status = 'cancelled';
  event.cancelledAt = new Date();
  event.cancelledBy = req.user._id;
  event.cancelReason = reason || '';
  event.revision += 1;
  await event.save();
  if (wasLive && notify) await deliverLater(req, event, { change: 'cancelled', reason });
  return res.json({ success: true, data: { id: String(event._id), status: event.status } });
});

// DELETE /api/calendar/events/:id — drafts only
const deleteEvent = handle(async (req, res) => {
  const event = await loadEditable(req);
  if (!['draft', 'pending_approval'].includes(event.status)) {
    throw httpError(400, 'Published events are cancelled, not deleted, so people are told.');
  }
  await event.deleteOne();
  res.json({ success: true, data: { id: String(event._id), deleted: true } });
});

// ---------------------------------------------------------------------------
// Replies (acknowledge, RSVP, consent)
// ---------------------------------------------------------------------------

// POST /api/calendar/view/:id/respond { segmentKey, value, count?, note? } — the signed-in person's reply
const respondToEvent = handle(async (req, res) => {
  const result = await respond(req, req.params.id, req.body, { timeZone: await timeZoneFor(req.models) });
  res.json({ success: true, data: result });
});

// GET /api/calendar/events/:id/responses — who has and hasn't replied
const listResponses = handle(async (req, res) => {
  const event = await loadEditable(req);
  res.json({ success: true, data: await tracker(req.models, event.toObject()) });
});

// POST /api/calendar/events/:id/remind-pending { segmentKey? } — nudge people who haven't replied
const remindPending = handle(async (req, res) => {
  const event = await loadEditable(req);
  if (event.status !== 'published') throw httpError(400, 'Only a published event can send reminders.');
  const extraUsers = await pendingRecipients(req.models, event.toObject(), req.body?.segmentKey || null);
  if (!extraUsers.length) return res.json({ success: true, data: { reminded: 0 } });
  const today = schoolDate.today(await timeZoneFor(req.models));
  await deliverLater(req, event, { change: 'response_reminder', extraUsers, slot: today });
  return res.json({ success: true, data: { reminded: extraUsers.length } });
});

// ---------------------------------------------------------------------------
// Audience picker
// ---------------------------------------------------------------------------

// POST /api/calendar/audience/preview { segments } — who each audience reaches
const previewAudience = handle(async (req, res) => {
  if (!can(req, PERMISSIONS.CREATE, PERMISSIONS.MANAGE, PERMISSIONS.PUBLISH_WIDE)) {
    throw httpError(403, 'You do not have permission to create calendar events.');
  }
  const segments = prepareSegments(req.body.segments);
  await assertCanTarget(actorFor(req), segments, 'segments');
  const { recipients: reached, stats } = await resolveRecipients(req.models, { segments });
  const people = [...reached.values()].map(({ user, segments: hits }) => ({
    id: String(user._id),
    name: user.name || user.username || user.email || '',
    kind: user.kind,
    hasEmail: Boolean(user.email) && !/\.local$/i.test(user.email),
    segments: hits.map((hit) => hit.key),
    children: [...new Set(hits.flatMap((hit) => hit.children || []))]
  }));
  const byKind = people.reduce((acc, person) => ({ ...acc, [person.kind]: (acc[person.kind] || 0) + 1 }), {});
  res.json({
    success: true,
    data: {
      total: people.length,
      byKind,
      inSeveral: people.filter((person) => person.segments.length > 1).length,
      segments: stats,
      people: people.slice(0, 500)
    }
  });
});

// GET /api/calendar/audience/options — what the picker can offer this creator
const audienceOptions = handle(async (req, res) => {
  const {
    Student, ActivityHouse, TransportRoute, Role
  } = req.models;
  const wide = can(req, PERMISSIONS.MANAGE, PERMISSIONS.PUBLISH_WIDE);
  const assignedOnly = !wide && req.rbac.scopeOf(PERMISSIONS.CREATE) === 'assigned';

  const pairs = Student
    ? await Student.aggregate([
      { $match: { isActive: { $ne: false } } },
      { $group: { _id: { class: '$class', section: '$section' }, count: { $sum: 1 } } }
    ])
    : [];
  const byKey = new Map();
  pairs.forEach(({ _id, count }) => {
    if (!_id?.class) return;
    const key = sectionKey(_id.class, _id.section || '');
    const entry = byKey.get(key) || {
      key,
      className: normalizeClassName(_id.class),
      section: String(_id.section || '').trim().toUpperCase(),
      students: 0
    };
    entry.students += count;
    byKey.set(key, entry);
  });
  let sections = [...byKey.values()].filter((s) => s.section);
  if (assignedOnly) {
    const mine = new Set((await getAssignedSections(req)).map((s) => s.key));
    sections = sections.filter((s) => mine.has(s.key));
  }
  const classOrder = (c) => (/^\d+$/.test(c) ? Number(c) : -1);
  sections.sort((a, b) => classOrder(a.className) - classOrder(b.className) || a.className.localeCompare(b.className)
    || a.section.localeCompare(b.section));
  const classes = [...new Set(sections.map((s) => s.className))];

  const [houses, routes, customRoles] = wide ? await Promise.all([
    ActivityHouse ? ActivityHouse.find({ isActive: { $ne: false } }).select('name').lean() : [],
    TransportRoute ? TransportRoute.find({ isActive: { $ne: false } }).select('name routeNo code').lean() : [],
    Role ? Role.find({ isActive: { $ne: false } }).select('name').lean() : []
  ]) : [[], [], []];

  res.json({
    success: true,
    data: {
      wide,
      assignedOnly,
      canApprove: can(req, PERMISSIONS.APPROVE, PERMISSIONS.MANAGE),
      needsApprovalForFamilies: needsApproval(req.rbac, [{ personType: 'parent' }]),
      classes,
      sections,
      houses: houses.map((h) => ({ id: String(h._id), name: h.name })),
      routes: routes.map((r) => ({
        id: String(r._id), name: [r.routeNo || r.code, r.name].filter(Boolean).join(' — ')
      })),
      roles: wide
        ? [
          ...[...roleTemplates.values()].map((t) => ({ key: t.key, name: t.name })),
          ...customRoles.map((role) => ({ key: `custom:${role._id}`, name: role.name }))
        ]
        : []
    }
  });
});

// GET /api/calendar/audience/people?q=&kind=staff|parent|student — find named people or students
const lookupPeople = handle(async (req, res) => {
  if (!can(req, PERMISSIONS.CREATE, PERMISSIONS.MANAGE, PERMISSIONS.PUBLISH_WIDE)) {
    throw httpError(403, 'You do not have permission to create calendar events.');
  }
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ success: true, data: [] });
  const pattern = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const kind = ['staff', 'parent', 'student'].includes(req.query.kind) ? req.query.kind : 'staff';
  const { User, Student } = req.models;
  if (kind !== 'staff' && req.query.by === 'student' && Student) {
    const students = await Student.find({ isActive: { $ne: false }, $or: [{ name: pattern }, { rollNumber: pattern }] })
      .select('name rollNumber class section').limit(20).lean();
    return res.json({
      success: true,
      data: students.map((s) => ({
        type: 'student',
        value: s.rollNumber,
        label: `${s.name} (${[s.class, s.section].filter(Boolean).join(' ')}, ${s.rollNumber})`
      }))
    });
  }
  const users = await User.find({
    kind, isActive: { $ne: false }, $or: [{ name: pattern }, { email: pattern }, { username: pattern }]
  }).select('name email username').limit(20).lean();
  return res.json({
    success: true,
    data: users.map((u) => ({
      type: 'user',
      value: String(u._id),
      label: [u.name || u.username, u.email && `(${u.email})`].filter(Boolean).join(' ')
    }))
  });
});

// ---------------------------------------------------------------------------
// School days
// ---------------------------------------------------------------------------

// GET /api/school-days?from&to — rules plus the resolved school-wide days
const listSchoolDays = handle(async (req, res) => {
  const today = schoolDate.today(await timeZoneFor(req.models));
  const label = schoolDate.sessionLabelFor(today);
  const session = schoolDate.sessionDates(label);
  const from = schoolDate.isDateKey(req.query.from) ? req.query.from : session.startDate;
  const to = schoolDate.isDateKey(req.query.to) ? req.query.to : session.endDate;
  const { SchoolDayRule } = req.models;
  const rules = await SchoolDayRule.find({
    $or: [{ startDate: { $lte: to }, endDate: { $gte: from } }, { kind: 'weekly_off' }],
    ...(req.query.all === '1' ? {} : { status: 'active' })
  }).sort({ startDate: 1 }).lean();
  const days = await schoolDays.range(req.models, from, to, null);
  const working = Object.values(days).filter((day) => day.working).length;
  res.json({
    success: true,
    data: {
      from,
      to,
      today,
      rules: rules.map((rule) => ({ ...rule, id: String(rule._id) })),
      summary: { days: Object.keys(days).length, working, off: Object.keys(days).length - working },
      usingDefaultSunday: !rules.some((rule) => rule.kind === 'weekly_off' && rule.status === 'active')
    }
  });
});

const applyRuleInput = (rule, input) => {
  ['kind', 'title', 'startDate', 'endDate', 'category', 'mode', 'authority', 'orderNo', 'reason', 'tentative']
    .forEach((field) => { if (input[field] !== undefined) rule[field] = input[field]; });
  if (!rule.endDate) rule.endDate = rule.startDate;
  if (input.kind === 'weekly_off' && !input.endDate) rule.endDate = '9999-12-31';
  if (input.weekly !== undefined) rule.weekly = input.weekly || undefined;
  if (input.halfDayEndTime !== undefined) rule.halfDayEndTime = input.halfDayEndTime || undefined;
  if (input.appliesTo !== undefined) rule.appliesTo = schoolDays.normalizeAppliesTo(input.appliesTo);
  rule.academicSession = schoolDate.sessionLabelFor(rule.startDate);
};

/** Announce a holiday, closure or half day as a published calendar event. */
const announceRule = async (req, rule, options) => {
  if (!can(req, PERMISSIONS.PUBLISH_WIDE, PERMISSIONS.MANAGE)) {
    throw httpError(403, 'Only the principal or office can announce school days to everyone.');
  }
  const { CalendarEvent } = req.models;
  const segments = [];
  // Families of the classes the rule covers (or everyone); staff always all.
  const familyScopes = rule.appliesTo?.scope === 'classes'
    ? [
      ...(rule.appliesTo.classes || []).map((value) => ({ type: 'class', value })),
      ...(rule.appliesTo.sections || []).map((value) => ({ type: 'section', value }))
    ]
    : [{ type: 'all', value: '' }];
  const instructions = options.note || rule.reason || '';
  if (options.families) {
    segments.push({
      key: 'parents', label: 'Parents', personType: 'parent', scopes: familyScopes, instructions, email: options.email
    });
    segments.push({ key: 'students', label: 'Students', personType: 'student', scopes: familyScopes, instructions });
  }
  if (options.staff) {
    segments.push({
      key: 'staff',
      label: 'Staff',
      personType: 'staff',
      scopes: [{ type: 'all', value: '' }],
      instructions,
      email: options.email
    });
  }
  const title = rule.title || schoolDays.defaultTitle(rule);
  const event = new CalendarEvent({
    uid: newUid(req.tenant?.slug),
    title,
    description: [rule.reason, rule.authority && `Order: ${[rule.authority, rule.orderNo].filter(Boolean).join(' ')}`]
      .filter(Boolean).join('\n'),
    category: rule.kind === 'half_day' ? 'other' : 'holiday',
    allDay: true,
    startDate: rule.startDate,
    endDate: rule.kind === 'weekly_off' ? rule.startDate : rule.endDate,
    critical: rule.kind === 'closure',
    status: 'draft',
    source: 'school_day',
    schoolDayRuleId: rule._id,
    createdBy: req.user._id,
    createdByName: req.user.name || '',
    segments: prepareSegments(segments)
  });
  event.targetKeys = eventTargetKeys(event.segments);
  event.academicSession = schoolDate.sessionLabelFor(event.startDate);
  await goLive(req, event);
  rule.eventId = event._id;
  await rule.save();
  return event;
};

// POST /api/school-days/rules
const createRule = handle(async (req, res) => {
  const { SchoolDayRule } = req.models;
  const rule = new SchoolDayRule({ createdBy: req.user._id, updatedBy: req.user._id });
  applyRuleInput(rule, req.body);
  await rule.validate();
  await rule.save();
  let eventId = null;
  if (req.body.announce && rule.kind !== 'weekly_off') {
    eventId = String((await announceRule(req, rule, req.body.announce))._id);
  }
  res.status(201).json({ success: true, data: { id: String(rule._id), eventId } });
});

// POST /api/school-days/rules/bulk { rules } — e.g. a holiday list from CSV
const createRules = handle(async (req, res) => {
  const { SchoolDayRule } = req.models;
  const docs = req.body.rules.map((input) => {
    const rule = new SchoolDayRule({ createdBy: req.user._id, updatedBy: req.user._id });
    applyRuleInput(rule, input);
    return rule;
  });
  await Promise.all(docs.map((doc) => doc.validate()));
  await SchoolDayRule.insertMany(docs.map((doc) => doc.toObject()));
  res.status(201).json({ success: true, data: { created: docs.length } });
});

// PATCH /api/school-days/rules/:id
const updateRule = handle(async (req, res) => {
  const { SchoolDayRule, CalendarEvent } = req.models;
  const rule = await SchoolDayRule.findById(req.params.id);
  if (!rule) throw httpError(404, 'School day not found.');
  applyRuleInput(rule, req.body);
  rule.updatedBy = req.user._id;
  rule.revision += 1;
  await rule.save();
  // Keep a linked announcement's dates in step and tell people it moved.
  if (rule.eventId && CalendarEvent) {
    const event = await CalendarEvent.findById(rule.eventId);
    const moved = event && (event.startDate !== rule.startDate || event.endDate !== rule.endDate);
    if (moved && event.status === 'published') {
      const before = event.toObject();
      event.startDate = rule.startDate;
      event.endDate = rule.endDate;
      event.title = rule.title || event.title;
      event.revision += 1;
      await event.save();
      const diff = diffEvents(before, event.toObject());
      await deliverLater(req, event, { change: 'changed', changes: diff.fields });
    }
  } else if (req.body.announce && rule.kind !== 'weekly_off') {
    await announceRule(req, rule, req.body.announce);
  }
  res.json({ success: true, data: { id: String(rule._id), eventId: rule.eventId ? String(rule.eventId) : null } });
});

// POST /api/school-days/rules/:id/cancel — the day is a normal working day again
const cancelRule = handle(async (req, res) => {
  const { SchoolDayRule, CalendarEvent } = req.models;
  const rule = await SchoolDayRule.findById(req.params.id);
  if (!rule) throw httpError(404, 'School day not found.');
  rule.status = 'cancelled';
  rule.updatedBy = req.user._id;
  rule.revision += 1;
  await rule.save();
  if (rule.eventId && CalendarEvent) {
    const event = await CalendarEvent.findById(rule.eventId);
    if (event && event.status === 'published') {
      event.status = 'cancelled';
      event.cancelledAt = new Date();
      event.cancelledBy = req.user._id;
      event.cancelReason = String(req.body?.reason || '').slice(0, 500);
      event.revision += 1;
      await event.save();
      await deliverLater(req, event, { change: 'cancelled', reason: event.cancelReason });
    }
  }
  res.json({ success: true, data: { id: String(rule._id), status: rule.status } });
});

module.exports = {
  handle,
  body,
  getMine,
  getDays,
  viewEvent,
  listEvents,
  getEvent,
  respondToEvent,
  listResponses,
  remindPending,
  createEvent,
  updateEvent,
  publishEvent,
  approveEvent,
  rejectEvent,
  cancelEvent,
  deleteEvent,
  previewAudience,
  audienceOptions,
  lookupPeople,
  listSchoolDays,
  createRule,
  createRules,
  updateRule,
  cancelRule,
  goLive,
  publish
};
