const { roleTemplates } = require('./catalog');
const { getRoleKeys, customRoleId, isPortalUser, resolvePermissionSet } = require('./permissions');

/** Human-readable role list for a user. */
const describeRoles = async (user, RoleModel) => {
  const keys = getRoleKeys(user);
  const customIds = keys.map(customRoleId).filter(Boolean);
  const customRoles = customIds.length > 0 && RoleModel
    ? await RoleModel.find({ _id: { $in: customIds } }).select('name').lean()
    : [];
  const customNames = new Map(customRoles.map((role) => [role._id.toString(), role.name]));

  return keys
    .map((key) => {
      const template = roleTemplates.get(key);
      if (template) return { key, name: template.name };
      const id = customRoleId(key);
      return id && customNames.has(id) ? { key, name: customNames.get(id) } : null;
    })
    .filter(Boolean);
};

const describeLinkedStudents = async (user, StudentModel) => {
  const links = Array.isArray(user.linkedStudents) ? user.linkedStudents : [];
  if (links.length === 0 || !StudentModel) return [];

  const students = await StudentModel.find({ _id: { $in: links.map((link) => link.student) } })
    .select('name rollNumber class section profileImage')
    .lean();
  const byId = new Map(students.map((student) => [student._id.toString(), student]));

  return links.map((link) => {
    const student = byId.get(link.student.toString());
    return {
      studentId: link.student,
      rollNumber: link.rollNumber,
      relation: link.relation || '',
      name: student?.name || '',
      className: student?.class || '',
      section: student?.section || '',
      profileImage: student?.profileImage || null
    };
  });
};

/**
 * What the web app needs to know about the signed-in user. Contains no tokens:
 * the session lives in httpOnly cookies.
 */
const buildAuthUserPayload = async (user, { models = {}, tenant = null, rbac = null } = {}) => {
  const portal = isPortalUser(user);
  const permissionSet = portal ? null : rbac || await resolvePermissionSet(user, models.Role);

  return {
    _id: user._id,
    email: user.email || null,
    username: user.username || null,
    name: user.name || '',
    displayName: user.displayName,
    kind: user.kind || 'staff',
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: Boolean(user.mustChangePassword),
    lastLogin: user.lastLogin || null,
    createdAt: user.createdAt,
    roles: portal ? [] : await describeRoles(user, models.Role),
    isAdmin: Boolean(permissionSet?.isAdmin),
    permissions: permissionSet ? permissionSet.toJSON() : [],
    linkedStudents: portal ? await describeLinkedStudents(user, models.Student) : [],
    teacher: user.teacher || null,
    featureToggles: tenant?.featureToggles || null,
    tenant: tenant ? { slug: tenant.slug, name: tenant.name || '' } : null
  };
};

module.exports = {
  buildAuthUserPayload,
  describeRoles,
  describeLinkedStudents
};
