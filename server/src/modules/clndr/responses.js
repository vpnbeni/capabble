/**
 * Replies to calendar events: acknowledge, RSVP and consent.
 *
 * An audience (segment) can ask its people for a reply. A family replies once
 * per audience to an RSVP or acknowledgement, however many of its children it
 * covers (so one family's "3 coming" counts once); consent is given per child.
 * Everyone else replies for themselves. Only the
 * person themselves can reply, and only to an audience that reaches them —
 * checked with the same audience rules as viewing.
 */
const schoolDate = require('../../utils/schoolDate');
const { VALUES_FOR, familyReply } = require('./constants');
const { viewerContext, matchEvent, resolveRecipients } = require('./audience');
const { httpError } = require('./events');

const joinNames = (names = []) => (names.length > 1
  ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  : names[0] || '');

const keyOf = (eventId, segmentKey, studentId = '') => `${eventId}:${segmentKey}:${studentId || ''}`;

/** This person's replies for these events, keyed eventId:segmentKey:studentId. */
const myResponses = async (models, userId, eventIds) => {
  const { CalendarResponse } = models;
  if (!CalendarResponse || !userId || !eventIds.length) return new Map();
  const rows = await CalendarResponse.find({ userId, eventId: { $in: eventIds } })
    .select('eventId segmentKey studentId value count note respondedAt').lean();
  return new Map(rows.map((row) => [keyOf(row.eventId, row.segmentKey, row.studentId), {
    value: row.value, count: row.count, note: row.note, respondedAt: row.respondedAt
  }]));
};

/** Put each viewer's own reply on the parts of these items (events only). */
const attachResponses = async (models, userId, items) => {
  const asks = (item) => item.eventId && item.parts?.some((p) => p.response && p.response !== 'none');
  const eventIds = [...new Set(items.filter(asks).map((item) => item.eventId))];
  if (!eventIds.length) return items;
  const mine = await myResponses(models, userId, eventIds);
  items.forEach((item) => {
    (item.parts || []).forEach((part) => {
      if (!part.response || part.response === 'none') return;
      // A family answer has no child; older ones were saved per child, so fall back to those.
      const keys = familyReply(part.response)
        ? ['', ...(part.children || []).map((child) => child.studentId)]
        : [part.child?.studentId];
      const found = keys.map((studentId) => mine.get(keyOf(item.eventId, part.segmentKey, studentId))).find(Boolean);
      // eslint-disable-next-line no-param-reassign
      part.myResponse = found || null;
    });
  });
  return items;
};

/**
 * Record a reply from the signed-in person.
 * body: { segmentKey, studentId?, value, count?, note? }
 */
const respond = async (req, eventId, body, { timeZone = schoolDate.DEFAULT_TIME_ZONE } = {}) => {
  const { CalendarEvent, CalendarResponse } = req.models;
  const event = await CalendarEvent.findById(eventId).select('-sendLog').lean();
  if (!event || event.status !== 'published') throw httpError(404, 'Event not found.');
  const viewer = await viewerContext(req);
  const { segments } = matchEvent(event, viewer);
  const inSegment = segments.filter((entry) => entry.segment.key === body.segmentKey);
  const family = inSegment.length > 0 && familyReply(inSegment[0].segment.response);
  const match = family
    ? inSegment[0]
    : inSegment.find((entry) => String(entry.child?.studentId || '') === String(body.studentId || ''));
  if (!match) throw httpError(403, 'This event does not ask you for a reply.');
  const { segment } = match;
  const child = family ? null : match.child;
  const familyNames = family ? inSegment.map((entry) => entry.child?.name).filter(Boolean) : [];
  if (!segment.response || segment.response === 'none') {
    throw httpError(400, 'This event does not ask for a reply.');
  }
  if (!(VALUES_FOR[segment.response] || []).includes(body.value)) {
    throw httpError(400, 'Choose one of the answers offered.');
  }
  if (segment.responseDeadline && schoolDate.today(timeZone) > segment.responseDeadline) {
    throw httpError(400, `Replies closed on ${segment.responseDeadline}. Contact the school.`);
  }
  const count = segment.response === 'rsvp' && body.value === 'yes'
    ? Math.max(1, Math.min(20, Number(body.count) || 1))
    : undefined;
  const note = String(body.note || '').trim().slice(0, 500);
  const now = new Date();
  const filter = {
    eventId: event._id, segmentKey: segment.key, userId: req.user._id, studentId: child?.studentId || ''
  };
  const doc = await CalendarResponse.findOneAndUpdate(filter, {
    $set: {
      type: segment.response,
      value: body.value,
      count,
      note,
      respondedAt: now,
      userName: req.user.name || req.user.email || '',
      studentName: child?.name || familyNames.join(', ')
    },
    $push: { history: { $each: [{ value: body.value, count, note, at: now }], $slice: -20 } }
  }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
  if (family) {
    // Answers saved per child before family replies would count the family twice.
    await CalendarResponse.deleteMany({
      eventId: event._id, segmentKey: segment.key, userId: req.user._id, studentId: { $ne: '' }
    });
  }
  return {
    segmentKey: segment.key,
    studentId: doc.studentId || null,
    value: doc.value,
    count: doc.count,
    note: doc.note,
    respondedAt: doc.respondedAt
  };
};

/**
 * Who has and hasn't replied, per audience that asked for replies.
 * Returns [{ key, label, type, deadline, expected, counts: { value: n }, headcount,
 *            responded: [{ name, child, value, count, note, at }], pending: [{ userId, name, child }] }]
 */
const tracker = async (models, event) => {
  const asking = (event.segments || []).filter((s) => s.response && s.response !== 'none');
  if (!asking.length) return [];
  const [{ recipients }, rows] = await Promise.all([
    resolveRecipients(models, event, { onlySegments: asking.map((s) => s.key) }),
    models.CalendarResponse.find({ eventId: event._id }).lean()
  ]);
  const answered = new Map(rows.map((row) => [
    keyOf(event._id, row.segmentKey, `${row.userId}:${row.studentId}`), row
  ]));
  // A family's answer, or (saved before family replies) the latest of its per-child answers.
  const familyRow = (segmentKey, userId, childIds) => answered.get(keyOf(event._id, segmentKey, `${userId}:`))
    || childIds.map((id) => answered.get(keyOf(event._id, segmentKey, `${userId}:${id}`))).filter(Boolean)
      .sort((a, b) => new Date(b.respondedAt) - new Date(a.respondedAt))[0];
  return asking.map((segment) => {
    const family = segment.personType !== 'staff' && familyReply(segment.response);
    const expected = [];
    recipients.forEach(({ user, segments }) => {
      const hit = segments.find((s) => s.key === segment.key);
      if (!hit) return;
      if (family && hit.childIds?.length) {
        // One answer per family login, for all its children in this audience.
        expected.push({
          user, studentId: '', child: joinNames(hit.children), childIds: hit.childIds
        });
      } else if (segment.personType !== 'staff' && hit.childIds?.length) {
        // Consent: per child (a student login's child is themselves).
        hit.childIds.forEach((studentId, i) => expected.push({ user, studentId, child: hit.children[i] || '' }));
      } else {
        expected.push({ user, studentId: '', child: '' });
      }
    });
    const responded = [];
    const pending = [];
    expected.forEach(({
      user, studentId, child, childIds
    }) => {
      const row = childIds
        ? familyRow(segment.key, user._id, childIds)
        : answered.get(keyOf(event._id, segment.key, `${user._id}:${studentId}`));
      if (row) {
        responded.push({
          name: user.name || row.userName,
          child,
          value: row.value,
          count: row.count,
          note: row.note,
          at: row.respondedAt
        });
      } else {
        pending.push({ userId: String(user._id), name: user.name || user.username || '', child, studentId });
      }
    });
    const counts = responded.reduce((acc, r) => ({ ...acc, [r.value]: (acc[r.value] || 0) + 1 }), {});
    const headcount = responded.filter((r) => r.value === 'yes').reduce((sum, r) => sum + (r.count || 1), 0);
    return {
      key: segment.key,
      label: segment.label,
      type: segment.response,
      deadline: segment.responseDeadline || null,
      expected: expected.length,
      counts,
      headcount,
      responded: responded.sort((a, b) => String(a.name).localeCompare(String(b.name))),
      pending: pending.sort((a, b) => String(a.name).localeCompare(String(b.name)))
    };
  });
};

/** People in an audience who haven't replied yet, shaped for delivery's `extraUsers`. */
const pendingRecipients = async (models, event, segmentKey = null) => {
  const segments = (event.segments || [])
    .filter((s) => s.response && s.response !== 'none' && (!segmentKey || s.key === segmentKey));
  if (!segments.length) return [];
  const [{ recipients }, rows] = await Promise.all([
    resolveRecipients(models, event, { onlySegments: segments.map((s) => s.key) }),
    models.CalendarResponse.find({ eventId: event._id }).select('segmentKey userId studentId').lean()
  ]);
  const done = new Set(rows.map((row) => `${row.segmentKey}:${row.userId}:${row.studentId}`));
  const out = [];
  recipients.forEach(({ user, segments: hits }) => {
    const missing = hits
      .map((hit) => {
        const segment = segments.find((s) => s.key === hit.key);
        if (!segment) return null;
        if (segment.personType !== 'staff' && familyReply(segment.response) && hit.childIds?.length) {
          const answeredFamily = done.has(`${hit.key}:${user._id}:`)
            || hit.childIds.some((id) => done.has(`${hit.key}:${user._id}:${id}`));
          return answeredFamily ? null : { key: hit.key, children: hit.children, childIds: hit.childIds };
        }
        if (segment.personType !== 'staff' && hit.childIds?.length) {
          const idx = hit.childIds
            .map((id, i) => (done.has(`${hit.key}:${user._id}:${id}`) ? -1 : i))
            .filter((i) => i >= 0);
          if (!idx.length) return null;
          return { key: hit.key, children: idx.map((i) => hit.children[i]), childIds: idx.map((i) => hit.childIds[i]) };
        }
        return done.has(`${hit.key}:${user._id}:`) ? null : { key: hit.key, children: [], childIds: [] };
      })
      .filter(Boolean);
    if (missing.length) out.push({ user, segments: missing });
  });
  return out;
};

module.exports = {
  keyOf, myResponses, attachResponses, respond, tracker, pendingRecipients
};
