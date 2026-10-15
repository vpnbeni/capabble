/**
 * Row-level scope for "assigned" permissions: a teacher with an assigned-scope
 * grant only sees and changes records for the class-sections they teach.
 *
 * A teacher's sections come from:
 * 1. sections an administrator assigned on their login (User.assignedSections),
 * 2. the current timetable's teacher-subject allocations, and
 * 3. classes where they are the class in-charge in the timetable.
 */
const { SCOPES } = require('./catalog');

const ROMAN = {
  i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10', xi: '11', xii: '12'
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "Class 10th", "10", "X" → "10"; "Nursery" → "nursery". */
const normalizeClassName = (value) => {
  const text = String(value || '').trim().toLowerCase()
    .replace(/^class\s*/, '')
    .replace(/(\d+)\s*(st|nd|rd|th)$/, '$1')
    .trim();
  return ROMAN[text] || text;
};

const normalizeSection = (value) => String(value || '').trim().toUpperCase();

const sectionKey = (className, section) => `${normalizeClassName(className)}|${normalizeSection(section)}`;

/** Regex that matches the common ways a class is written for one normalised class. */
const classNameRegex = (normalized) => {
  const variants = new Set([escapeRegex(normalized)]);
  if (/^\d+$/.test(normalized)) {
    const n = Number(normalized);
    const suffix = (n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
    variants.add(`${normalized}${suffix}`);
    const roman = Object.keys(ROMAN).find((key) => ROMAN[key] === normalized);
    if (roman) variants.add(roman);
  }
  return new RegExp(`^\\s*(class\\s*)?(${[...variants].join('|')})\\s*$`, 'i');
};

const loadTimetableSections = async (req, user) => {
  const TimetableState = req.models?.TimetableState;
  if (!TimetableState || !user.teacher) return [];

  const teacherId = user.teacher.toString();
  const state = await TimetableState.findOne({})
    .sort({ updatedAt: -1 })
    .select('classes teachers teacherSubjectAllocations')
    .lean();
  if (!state) return [];

  const sections = [];
  (state.teacherSubjectAllocations || [])
    .filter((allocation) => String(allocation.teacherId) === teacherId)
    .forEach((allocation) => {
      (allocation.assignments || []).forEach((assignment) => {
        sections.push({ className: assignment.className, section: assignment.section });
      });
    });

  const timetableTeacher = (state.teachers || []).find((teacher) => String(teacher.id) === teacherId);
  const inchargeNames = new Set(
    [teacherId, timetableTeacher?.name, timetableTeacher?.shortName]
      .filter(Boolean)
      .map((name) => String(name).trim().toLowerCase())
  );
  (state.classes || [])
    .filter((cls) => cls.incharge && inchargeNames.has(String(cls.incharge).trim().toLowerCase()))
    .forEach((cls) => sections.push({ className: cls.className, section: cls.section }));

  return sections;
};

/**
 * Class-sections the signed-in teacher is assigned to, as
 * `[{ className, section, key }]`. Cached on the request.
 */
const getAssignedSections = async (req) => {
  if (req.assignedSectionsCache) return req.assignedSectionsCache;

  const user = req.user || {};
  const all = [...(user.assignedSections || [])];
  try {
    all.push(...await loadTimetableSections(req, user));
  } catch (error) {
    console.warn(`[rbac-scope] timetable lookup failed: ${error.message}`);
  }

  const byKey = new Map();
  all.forEach(({ className, section }) => {
    if (!className || !section) return;
    const key = sectionKey(className, section);
    if (!byKey.has(key)) byKey.set(key, { className: normalizeClassName(className), section: normalizeSection(section), key });
  });

  req.assignedSectionsCache = [...byKey.values()];
  return req.assignedSectionsCache;
};

const scopeFor = (req, permissionKey) => req.rbac?.scopeOf(permissionKey) || null;

/**
 * Mongo filter limiting a query to the teacher's sections.
 * @returns {Promise<object|null>} null when the user may see every section.
 */
const buildSectionFilter = async (req, permissionKey, { classField = 'class', sectionField = 'section' } = {}) => {
  const scope = scopeFor(req, permissionKey);
  if (scope === SCOPES.ALL) return null;
  if (!scope) return { _id: { $exists: false } };

  const sections = await getAssignedSections(req);
  if (sections.length === 0) return { _id: { $exists: false } };

  return {
    $or: sections.map(({ className, section }) => ({
      [classField]: classNameRegex(className),
      [sectionField]: new RegExp(`^\\s*${escapeRegex(section)}\\s*$`, 'i')
    }))
  };
};

/** Whether the user may act on one class-section under `permissionKey`. */
const canAccessSection = async (req, permissionKey, className, section) => {
  const scope = scopeFor(req, permissionKey);
  if (scope === SCOPES.ALL) return true;
  if (!scope) return false;
  const sections = await getAssignedSections(req);
  const key = sectionKey(className, section);
  return sections.some((entry) => entry.key === key);
};

/**
 * Add a scope filter to a query filter. Always nested under `$and` so it never
 * collides with the top-level `$or` that academicSessionPlugin adds.
 */
const withScope = (filter = {}, scopeFilter = null) => {
  if (!scopeFilter) return filter;
  return { ...filter, $and: [...(filter.$and || []), scopeFilter] };
};

const isAssignedScope = (req, permissionKey) => scopeFor(req, permissionKey) === SCOPES.ASSIGNED;

/**
 * Route guard for writes when the user only holds an assigned-scope grant.
 * `getSection(req)` returns `{ className, section }` for the target record, or
 * null when it cannot be scoped (bulk/import routes), which is then refused.
 */
const requireSectionInScope = (permissionKey, getSection) => async (req, res, next) => {
  try {
    if (!isAssignedScope(req, permissionKey)) return next();
    const target = await getSection(req);
    if (target && target.className && target.section
      && await canAccessSection(req, permissionKey, target.className, target.section)) {
      return next();
    }
    return res.status(403).json({
      success: false,
      message: 'You can only change records for the classes you are assigned to.',
      errorCode: 'outside_assigned_sections'
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  normalizeClassName,
  normalizeSection,
  sectionKey,
  classNameRegex,
  getAssignedSections,
  buildSectionFilter,
  canAccessSection,
  isAssignedScope,
  requireSectionInScope,
  withScope
};
