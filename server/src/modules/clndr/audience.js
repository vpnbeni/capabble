/**
 * Who an event is for.
 *
 * A segment names a person type (parent, student, staff) and scopes such as
 * "section 7|B" or "role accountant". Each scope becomes an audience key:
 *
 *   parent@section:7|B   staff@role:accountant   student@class:10   user:<UserId>
 *
 * Two directions use the same keys:
 *  - viewing: work out the signed-in person's own keys once per request
 *    (viewerContext) and find events whose `targetKeys` contain any of them;
 *  - sending: turn each segment back into the logins it reaches
 *    (resolveRecipients), only when notifying.
 *
 * Family keys are per child, so a parent of two children sees which child an
 * item is for. Specific people are always `user:<UserId>` (Teacher ids change
 * when a session is carried forward).
 */
const mongoose = require('mongoose');
const { USER_KINDS, getRoleKeys } = require('../../rbac/permissions');
const {
  normalizeClassName, normalizeSection, sectionKey, classNameRegex, getAssignedSections
} = require('../../rbac/scope');
const { SCOPE_TYPES } = require('./constants');

const USER_FIELDS = 'name email username kind roles role teacher linkedStudents assignedSections emailOptOut isActive';
const STUDENT_FIELDS = 'name rollNumber class section houseId isActive';
const FAMILY_TYPES = new Set(['parent', 'student']);

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || '')) && String(value).length === 24;
const uniq = (values) => [...new Set(values.filter(Boolean).map(String))];

/** "7|b", "VII|B" or { className, section } → "7|B". */
const normalizeSectionValue = (value) => {
  if (value && typeof value === 'object') return sectionKey(value.className, value.section);
  const [className, section] = String(value || '').split('|');
  return className && section ? sectionKey(className, section) : '';
};

/** Audience key for one scope of a segment, or '' when the scope is unusable. */
const scopeKey = (personType, scope) => {
  const type = scope?.type;
  const value = String(scope?.value ?? '').trim();
  if (!SCOPE_TYPES[personType]?.includes(type)) return '';
  switch (type) {
  case 'all': return `${personType}@all`;
  case 'user': return isObjectId(value) ? `user:${value}` : '';
  case 'class': return value ? `${personType}@class:${normalizeClassName(value)}` : '';
  case 'section':
  case 'classteacher': {
    // classteacher also accepts a whole class ("class teachers of class 7").
    const key = value.includes('|') ? normalizeSectionValue(value) : normalizeClassName(value);
    return key ? `${personType}@${type}:${key}` : '';
  }
  case 'student': return value ? `${personType}@student:${value.toUpperCase()}` : '';
  case 'role':
  case 'house':
  case 'route':
    return value ? `${personType}@${type}:${value}` : '';
  default: return '';
  }
};

const segmentKeys = (segment) => uniq((segment.scopes || []).map((scope) => scopeKey(segment.personType, scope)));
const segmentExcludeKeys = (segment) => uniq((segment.exclude || [])
  .map((scope) => scopeKey(segment.personType, scope)));

/** Union of every segment's keys, stored on the event for the "my calendar" query. */
const eventTargetKeys = (segments = []) => uniq(segments.flatMap(segmentKeys));

// ---------------------------------------------------------------------------
// Viewing: the signed-in person's keys
// ---------------------------------------------------------------------------

/**
 * Sections where this staff login is the class teacher: timetable in-charge,
 * or the class_teacher role with assigned sections.
 */
const classTeacherSections = async (models, user) => {
  const keys = new Set();
  if (getRoleKeys(user).includes('class_teacher')) {
    (user.assignedSections || []).forEach(({ className, section }) => {
      if (className && section) keys.add(sectionKey(className, section));
    });
  }
  const { TimetableState } = models;
  if (TimetableState && user.teacher) {
    const state = await TimetableState.findOne({}).sort({ updatedAt: -1 }).select('classes teachers').lean();
    if (state) {
      const teacherId = String(user.teacher);
      const timetableTeacher = (state.teachers || []).find((teacher) => String(teacher.id) === teacherId);
      const names = new Set([teacherId, timetableTeacher?.name, timetableTeacher?.shortName]
        .filter(Boolean).map((name) => String(name).trim().toLowerCase()));
      (state.classes || [])
        .filter((cls) => cls.incharge && names.has(String(cls.incharge).trim().toLowerCase()))
        .forEach((cls) => keys.add(sectionKey(cls.className, cls.section)));
    }
  }
  return [...keys];
};

/** Routes whose bus this staff member drives or conducts. */
const crewRoutes = async (models, teacherId) => {
  const { TransportVehicle, TransportRoute } = models;
  if (!TransportVehicle || !TransportRoute || !teacherId) return [];
  const vehicles = await TransportVehicle.find({ $or: [{ driverId: teacherId }, { conductorId: teacherId }] })
    .select('_id').lean();
  if (!vehicles.length) return [];
  const routes = await TransportRoute.find({ vehicleId: { $in: vehicles.map((v) => v._id) } }).select('_id').lean();
  return routes.map((route) => String(route._id));
};

const safely = async (label, fn, fallback) => {
  try {
    return await fn();
  } catch (error) {
    console.warn(`[clndr] ${label} lookup failed: ${error.message}`);
    return fallback;
  }
};

/**
 * The viewer's audience keys. `req` needs `user` and `models` (a request, or a
 * stand-in for background work). Family logins get one key set per linked child.
 */
const viewerContext = async (req) => {
  const user = req.user || {};
  const models = req.models || {};
  const userId = String(user._id || '');
  const kind = user.kind || USER_KINDS.STAFF;

  if (kind === USER_KINDS.STAFF) {
    const keys = new Set([`user:${userId}`, 'staff@all', ...getRoleKeys(user).map((role) => `staff@role:${role}`)]);
    const sections = await safely('sections', () => getAssignedSections(req), []);
    sections.forEach(({ className, key }) => {
      keys.add(`staff@section:${key}`);
      keys.add(`staff@class:${className}`);
    });
    const ctSections = await safely('class teacher', () => classTeacherSections(models, user), []);
    ctSections.forEach((key) => {
      keys.add(`staff@classteacher:${key}`);
      keys.add(`staff@classteacher:${key.split('|')[0]}`);
    });
    const routes = await safely('crew routes', () => crewRoutes(models, user.teacher), []);
    routes.forEach((routeId) => keys.add(`staff@route:${routeId}`));
    return { kind, userId, keys, children: [], classTeacherOf: ctSections, sections };
  }

  // Parent or student login: keys per linked child.
  const links = user.linkedStudents || [];
  const rolls = uniq(links.map((link) => String(link.rollNumber || '').toUpperCase()));
  const { Student, TransportAssignment } = models;
  const students = Student && rolls.length
    ? await Student.find({ rollNumber: { $in: rolls } }).select(STUDENT_FIELDS).lean()
    : [];
  const assignments = TransportAssignment && students.length
    ? await safely('transport', () => TransportAssignment
      .find({ studentId: { $in: students.map((s) => s._id) }, isActive: true })
      .select('studentId routeId').lean(), [])
    : [];
  const routeByStudent = new Map(assignments.map((a) => [String(a.studentId), String(a.routeId)]));

  const children = students.map((student) => {
    const keys = new Set([
      `${kind}@class:${normalizeClassName(student.class)}`,
      `${kind}@section:${sectionKey(student.class, student.section)}`,
      `${kind}@student:${String(student.rollNumber).toUpperCase()}`
    ]);
    if (student.houseId) keys.add(`${kind}@house:${student.houseId}`);
    const routeId = routeByStudent.get(String(student._id));
    if (routeId) keys.add(`${kind}@route:${routeId}`);
    return {
      studentId: String(student._id),
      rollNumber: student.rollNumber,
      name: student.name || '',
      className: student.class || '',
      section: student.section || '',
      keys
    };
  });
  return { kind, userId, keys: new Set([`user:${userId}`, `${kind}@all`]), children };
};

/** Every key the viewer holds, for the `targetKeys: { $in }` query. */
const allViewerKeys = (viewer) => uniq([...viewer.keys, ...viewer.children.flatMap((child) => [...child.keys])]);

const intersects = (set, keys) => keys.some((key) => set.has(key));

/**
 * Which segments of an event apply to the viewer, labelled.
 * Returns { visible, segments: [{ segment, child? }] }.
 */
const matchEvent = (event, viewer) => {
  const matches = [];
  (event.segments || []).forEach((segment) => {
    const include = segmentKeys(segment);
    const exclude = segmentExcludeKeys(segment);
    if (segment.personType === 'staff') {
      if (viewer.kind !== 'staff') return;
      if (intersects(viewer.keys, include) && !intersects(viewer.keys, exclude)) matches.push({ segment });
      return;
    }
    if (segment.personType !== viewer.kind) return;
    // A family segment can match the login itself (user:/all) or one of its children.
    const baseHit = intersects(viewer.keys, include) && !intersects(viewer.keys, exclude);
    const childHits = viewer.children.filter((child) => {
      const keys = new Set([...viewer.keys, ...child.keys]);
      return intersects(keys, include) && !intersects(keys, exclude);
    });
    if (childHits.length) childHits.forEach((child) => matches.push({ segment, child }));
    else if (baseHit) matches.push({ segment });
  });

  const visible = matches.length > 0
    || event.visibility === 'whole_school'
    || (event.visibility === 'all_staff' && viewer.kind === 'staff');
  return { visible, segments: matches };
};

// ---------------------------------------------------------------------------
// Sending: segments → logins
// ---------------------------------------------------------------------------

const activeUsers = (User, filter) => User.find({ ...filter, isActive: { $ne: false } }).select(USER_FIELDS).lean();

const loadTimetable = async (models) => {
  if (!models.TimetableState) return null;
  return safely('timetable', () => models.TimetableState.findOne({}).sort({ updatedAt: -1 })
    .select('classes teachers teacherSubjectAllocations').lean(), null);
};

/** Teacher ids teaching / class-teaching the given section keys or classes, from the timetable. */
const timetableTeacherIds = (state, { sectionKeys = [], classes = [], inchargeOnly = false }) => {
  if (!state) return [];
  const wantSection = new Set(sectionKeys);
  const wantClass = new Set(classes);
  const hit = (className, section) => wantClass.has(normalizeClassName(className))
    || wantSection.has(sectionKey(className, section));
  const ids = new Set();
  if (!inchargeOnly) {
    (state.teacherSubjectAllocations || []).forEach((allocation) => {
      const teachesIt = (allocation.assignments || []).some((a) => hit(a.className, a.section));
      if (teachesIt) ids.add(String(allocation.teacherId));
    });
  }
  const byName = new Map();
  (state.teachers || []).forEach((teacher) => {
    [teacher.id, teacher.name, teacher.shortName].filter(Boolean)
      .forEach((name) => byName.set(String(name).trim().toLowerCase(), String(teacher.id)));
  });
  (state.classes || []).forEach((cls) => {
    if (!cls.incharge || !hit(cls.className, cls.section)) return;
    const id = byName.get(String(cls.incharge).trim().toLowerCase());
    if (id) ids.add(id);
  });
  return [...ids].filter(isObjectId);
};

const sectionsMatching = (assigned, { sectionKeys = [], classes = [] }) => (assigned || []).some(
  ({ className, section }) => classes.includes(normalizeClassName(className))
    || sectionKeys.includes(sectionKey(className, section))
);

/**
 * Staff logins for one set of staff scopes.
 * Returns { users, unreachable } (unreachable = staff records with no login).
 */
const resolveStaffScopes = async (models, scopes, cache) => {
  const { User } = models;
  const byType = (type) => scopes.filter((scope) => scope.type === type).map((scope) => String(scope.value || ''));
  const users = new Map();
  const add = (list) => list.forEach((user) => users.set(String(user._id), user));
  let unreachable = 0;

  if (scopes.some((scope) => scope.type === 'all')) {
    add(await activeUsers(User, { kind: USER_KINDS.STAFF }));
  }
  const roles = byType('role');
  if (roles.length) {
    const staff = cache.staff || (cache.staff = await activeUsers(User, { kind: USER_KINDS.STAFF }));
    add(staff.filter((user) => getRoleKeys(user).some((role) => roles.includes(role))));
  }

  const teacherLogins = async (teacherIds) => {
    if (!teacherIds.length) return;
    const found = await activeUsers(User, { kind: USER_KINDS.STAFF, teacher: { $in: teacherIds } });
    add(found);
    const withLogin = new Set(found.map((user) => String(user.teacher)));
    unreachable += teacherIds.filter((id) => !withLogin.has(String(id))).length;
  };

  const split = (values) => ({
    sectionKeys: values.filter((value) => value.includes('|')).map(normalizeSectionValue).filter(Boolean),
    classes: values.filter((value) => value && !value.includes('|')).map(normalizeClassName)
  });

  const teaching = split([...byType('section'), ...byType('class').map((value) => value.split('|')[0])]);
  const classTeaching = split(byType('classteacher'));
  const any = (set) => set.sectionKeys.length > 0 || set.classes.length > 0;
  if (any(teaching) || any(classTeaching)) {
    cache.timetable = cache.timetable === undefined ? await loadTimetable(models) : cache.timetable;
    const staff = cache.staff || (cache.staff = await activeUsers(User, { kind: USER_KINDS.STAFF }));
    if (teaching.sectionKeys.length || teaching.classes.length) {
      await teacherLogins(timetableTeacherIds(cache.timetable, teaching));
      add(staff.filter((user) => sectionsMatching(user.assignedSections, teaching)));
    }
    if (classTeaching.sectionKeys.length || classTeaching.classes.length) {
      await teacherLogins(timetableTeacherIds(cache.timetable, { ...classTeaching, inchargeOnly: true }));
      add(staff.filter((user) => getRoleKeys(user).includes('class_teacher')
        && sectionsMatching(user.assignedSections, classTeaching)));
    }
  }

  const routes = byType('route').filter(isObjectId);
  if (routes.length && models.TransportRoute && models.TransportVehicle) {
    const routeDocs = await models.TransportRoute.find({ _id: { $in: routes } }).select('vehicleId').lean();
    const vehicleIds = routeDocs.map((r) => r.vehicleId).filter(Boolean);
    const vehicles = await models.TransportVehicle.find({ _id: { $in: vehicleIds } })
      .select('driverId conductorId').lean();
    await teacherLogins(uniq(vehicles.flatMap((v) => [v.driverId, v.conductorId])));
  }

  const ids = byType('user').filter(isObjectId);
  if (ids.length) add(await activeUsers(User, { _id: { $in: ids }, kind: USER_KINDS.STAFF }));

  return { users: [...users.values()], unreachable };
};

/** Students for one set of family scopes. */
const resolveStudentScopes = async (models, scopes) => {
  const { Student } = models;
  if (!Student) return [];
  const or = [];
  const byType = (type) => scopes.filter((scope) => scope.type === type).map((scope) => String(scope.value || ''));
  if (scopes.some((scope) => scope.type === 'all')) or.push({});
  byType('class').forEach((value) => or.push({ class: classNameRegex(normalizeClassName(value)) }));
  byType('section').map(normalizeSectionValue).filter(Boolean).forEach((key) => {
    const [className, section] = key.split('|');
    const sectionRegex = new RegExp(`^\\s*${escapeRegex(normalizeSection(section))}\\s*$`, 'i');
    or.push({ class: classNameRegex(className), section: sectionRegex });
  });
  const houses = byType('house').filter(isObjectId);
  if (houses.length) or.push({ houseId: { $in: houses } });
  const rolls = byType('student').map((value) => value.toUpperCase()).filter(Boolean);
  if (rolls.length) or.push({ rollNumber: { $in: rolls } });
  const routes = byType('route').filter(isObjectId);
  if (routes.length && models.TransportAssignment) {
    const assignments = await models.TransportAssignment.find({ routeId: { $in: routes }, isActive: true })
      .select('studentId').lean();
    if (assignments.length) or.push({ _id: { $in: assignments.map((a) => a.studentId) } });
  }
  if (!or.length) return [];
  return Student.find({ isActive: { $ne: false }, $or: or }).select(STUDENT_FIELDS).lean();
};

const hasEmail = (user) => Boolean(user.email) && !/\.local$/i.test(user.email);

/**
 * Every login an event reaches, merged across segments.
 * Returns {
 *   recipients: Map(userId → { user, segments: [{ key, children: [names] }] }),
 *   stats: [{ key, label, personType, people, noLogin, noEmail }]
 * }
 * `onlySegments` limits the work to some segment keys (e.g. those an edit touched).
 */
const resolveRecipients = async (models, event, { onlySegments = null } = {}) => {
  const recipients = new Map();
  const stats = [];
  const cache = {};
  const { User } = models;

  const addRecipient = (user, segmentKey, childNames = []) => {
    const id = String(user._id);
    if (!recipients.has(id)) recipients.set(id, { user, segments: [] });
    const entry = recipients.get(id);
    const existing = entry.segments.find((s) => s.key === segmentKey);
    if (existing) existing.children = uniq([...existing.children, ...childNames]);
    else entry.segments.push({ key: segmentKey, children: uniq(childNames) });
  };

  // eslint-disable-next-line no-restricted-syntax
  for (const segment of event.segments || []) {
    // eslint-disable-next-line no-continue
    if (onlySegments && !onlySegments.includes(segment.key)) continue;
    const stat = {
      key: segment.key, label: segment.label, personType: segment.personType, people: 0, noLogin: 0, noEmail: 0
    };

    if (segment.personType === 'staff') {
      /* eslint-disable no-await-in-loop */
      const included = await resolveStaffScopes(models, segment.scopes || [], cache);
      const excluded = (segment.exclude || []).length
        ? await resolveStaffScopes(models, segment.exclude, cache)
        : { users: [] };
      /* eslint-enable no-await-in-loop */
      const excludedIds = new Set(excluded.users.map((user) => String(user._id)));
      const users = included.users.filter((user) => !excludedIds.has(String(user._id)));
      users.forEach((user) => addRecipient(user, segment.key));
      stat.people = users.length;
      stat.noLogin = included.unreachable;
      stat.noEmail = users.filter((user) => !hasEmail(user)).length;
    } else if (FAMILY_TYPES.has(segment.personType)) {
      const kind = segment.personType;
      /* eslint-disable no-await-in-loop */
      const included = await resolveStudentScopes(models, segment.scopes || []);
      const excluded = (segment.exclude || []).length ? await resolveStudentScopes(models, segment.exclude) : [];
      const excludedRolls = new Set(excluded.map((s) => String(s.rollNumber).toUpperCase()));
      const students = included.filter((s) => !excludedRolls.has(String(s.rollNumber).toUpperCase()));
      const nameByRoll = new Map(students.map((s) => [String(s.rollNumber).toUpperCase(), s.name || s.rollNumber]));
      const rolls = [...nameByRoll.keys()];
      const logins = rolls.length
        ? await activeUsers(User, { kind, 'linkedStudents.rollNumber': { $in: rolls } })
        : [];
      const reachedRolls = new Set();
      logins.forEach((user) => {
        const childRolls = (user.linkedStudents || []).map((link) => String(link.rollNumber || '').toUpperCase())
          .filter((roll) => nameByRoll.has(roll));
        childRolls.forEach((roll) => reachedRolls.add(roll));
        addRecipient(user, segment.key, childRolls.map((roll) => nameByRoll.get(roll)));
      });
      const named = (segment.scopes || []).filter((scope) => scope.type === 'user')
        .map((scope) => scope.value).filter(isObjectId);
      if (named.length) {
        const namedUsers = await activeUsers(User, { _id: { $in: named }, kind });
        namedUsers.forEach((user) => addRecipient(user, segment.key));
      }
      /* eslint-enable no-await-in-loop */
      stat.people = logins.length + named.length;
      stat.students = students.length;
      stat.noLogin = rolls.filter((roll) => !reachedRolls.has(roll)).length;
      stat.noEmail = logins.filter((user) => !hasEmail(user)).length;
    }
    stats.push(stat);
  }
  return { recipients, stats };
};

module.exports = {
  scopeKey,
  segmentKeys,
  segmentExcludeKeys,
  eventTargetKeys,
  normalizeSectionValue,
  viewerContext,
  allViewerKeys,
  matchEvent,
  resolveRecipients,
  classTeacherSections,
  timetableTeacherIds,
  hasEmail
};
