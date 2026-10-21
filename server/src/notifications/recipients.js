/**
 * Who gets a notification. Every helper returns active tenant User documents
 * (lean, with the fields templates need) for the given tenant models.
 */
const { USER_KINDS, getRoleKeys, resolvePermissionSet } = require('../rbac/permissions');
const { ADMINISTRATOR_ROLE } = require('../rbac/catalog');

const USER_FIELDS = 'name email username kind roles role teacher linkedStudents isActive';
const FAMILY_KINDS = [USER_KINDS.PARENT, USER_KINDS.STUDENT];

const uniqueIds = (ids = []) => [...new Set(ids.filter(Boolean).map(String))];

const byIds = (models, userIds) => {
  const ids = uniqueIds(userIds);
  if (!ids.length) return [];
  return models.User.find({ _id: { $in: ids }, isActive: { $ne: false } }).select(USER_FIELDS).lean();
};

/** Staff logins linked to these Teacher records. */
const usersForTeachers = (models, teacherIds) => {
  const ids = uniqueIds(teacherIds);
  if (!ids.length) return [];
  return models.User.find({ teacher: { $in: ids }, kind: USER_KINDS.STAFF, isActive: { $ne: false } }).select(USER_FIELDS).lean();
};

/**
 * Parent and/or student logins for these students. Links are matched on the
 * admission number, which stays the same across academic sessions.
 */
const familyForRollNumbers = (models, rollNumbers, { kinds = FAMILY_KINDS } = {}) => {
  const rolls = [...new Set(rollNumbers.filter(Boolean).map((r) => String(r).toUpperCase()))];
  if (!rolls.length) return [];
  return models.User.find({ kind: { $in: kinds }, 'linkedStudents.rollNumber': { $in: rolls }, isActive: { $ne: false } })
    .select(USER_FIELDS)
    .lean();
};

const STUDENT_FIELDS = 'rollNumber name class section';

/** Students matching a filter (session-scoped in a request), with the fields templates need. */
const loadStudents = (models, filter) => (models.Student ? models.Student.find(filter).select(STUDENT_FIELDS).lean() : []);

/** Family logins for these students, plus admission no. → name so templates can say whose. */
const familyFor = async (models, students, options) => {
  const rows = students.filter((s) => s?.rollNumber);
  return {
    users: await familyForRollNumbers(models, rows.map((s) => s.rollNumber), options),
    studentsByRoll: Object.fromEntries(rows.map((s) => [String(s.rollNumber).toUpperCase(), s.name || '']))
  };
};

const activeStaff = (models) => models.User.find({ kind: USER_KINDS.STAFF, isActive: { $ne: false } }).select(USER_FIELDS).lean();

const administrators = async (models) => (await activeStaff(models)).filter((u) => getRoleKeys(u).includes(ADMINISTRATOR_ROLE));

const usersWithRole = async (models, roleKey) => (await activeStaff(models)).filter((u) => getRoleKeys(u).includes(roleKey));

/** Staff whose roles grant any of these permissions (administrators always do). */
const usersWithPermission = async (models, permissionKeys) => {
  const keys = [].concat(permissionKeys);
  const staff = await activeStaff(models);
  const sets = await Promise.all(staff.map((u) => resolvePermissionSet(u, models.Role)));
  return staff.filter((u, i) => sets[i].hasAny(keys));
};

/** Staff linked to a Teacher record — the people who teach. */
const teachingStaff = (models) => models.User.find({ kind: USER_KINDS.STAFF, teacher: { $ne: null }, isActive: { $ne: false } }).select(USER_FIELDS).lean();

module.exports = {
  byIds,
  usersForTeachers,
  familyForRollNumbers,
  loadStudents,
  familyFor,
  administrators,
  usersWithRole,
  usersWithPermission,
  teachingStaff,
  FAMILY_KINDS
};
