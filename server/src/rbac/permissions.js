const mongoose = require('mongoose');
const {
  WILDCARD,
  SCOPES,
  ADMINISTRATOR_ROLE,
  LEGACY_ROLE_TEMPLATE,
  roleTemplates,
  normalizeGrants
} = require('./catalog');

const CUSTOM_PREFIX = 'custom:';

const USER_KINDS = Object.freeze({
  STAFF: 'staff',
  PARENT: 'parent',
  STUDENT: 'student'
});

const PORTAL_KINDS = new Set([USER_KINDS.PARENT, USER_KINDS.STUDENT]);

const isPortalUser = (user) => PORTAL_KINDS.has(user?.kind);

/** Role keys a staff user holds; falls back to the legacy single `role` field. */
const getRoleKeys = (user) => {
  if (!user || isPortalUser(user)) return [];
  if (Array.isArray(user.roles) && user.roles.length > 0) return user.roles;
  return LEGACY_ROLE_TEMPLATE[user.role] || [];
};

const customRoleId = (roleKey) => {
  if (typeof roleKey !== 'string' || !roleKey.startsWith(CUSTOM_PREFIX)) return null;
  const id = roleKey.slice(CUSTOM_PREFIX.length);
  return mongoose.Types.ObjectId.isValid(id) ? id : null;
};

class PermissionSet {
  constructor(grants = []) {
    this.grants = new Map();
    grants.forEach(({ key, scope }) => {
      const existing = this.grants.get(key);
      if (!existing || existing === SCOPES.ASSIGNED) this.grants.set(key, scope);
    });
    this.isAdmin = this.grants.has(WILDCARD);
  }

  has(key) {
    return this.isAdmin || this.grants.has(key);
  }

  hasAny(keys = []) {
    return keys.some((key) => this.has(key));
  }

  hasAnyOnResource(resourceKey) {
    if (this.isAdmin) return true;
    const prefix = `${resourceKey}.`;
    return [...this.grants.keys()].some((key) => key.startsWith(prefix));
  }

  /** `all`, `assigned`, or null when the permission is not held. */
  scopeOf(key) {
    if (this.isAdmin) return SCOPES.ALL;
    return this.grants.get(key) || null;
  }

  toJSON() {
    return [...this.grants.entries()].map(([key, scope]) => ({ key, scope }));
  }
}

/**
 * Build the effective permission set for a user by unioning their roles.
 * @param {object} user  tenant User document
 * @param {import('mongoose').Model} [RoleModel] tenant Role model (needed for custom roles)
 */
const resolvePermissionSet = async (user, RoleModel) => {
  const roleKeys = getRoleKeys(user);
  const grants = [];

  const customIds = [];
  roleKeys.forEach((roleKey) => {
    const template = roleTemplates.get(roleKey);
    if (template) {
      grants.push(...template.permissions);
      return;
    }
    const id = customRoleId(roleKey);
    if (id) customIds.push(id);
  });

  if (customIds.length > 0 && RoleModel) {
    const customRoles = await RoleModel.find({ _id: { $in: customIds }, isActive: { $ne: false } })
      .select('permissions')
      .lean();
    customRoles.forEach((role) => grants.push(...normalizeGrants(role.permissions)));
  }

  return new PermissionSet(grants);
};

const isAdministrator = (user) => getRoleKeys(user).includes(ADMINISTRATOR_ROLE);

module.exports = {
  CUSTOM_PREFIX,
  USER_KINDS,
  PermissionSet,
  isPortalUser,
  getRoleKeys,
  customRoleId,
  resolvePermissionSet,
  isAdministrator
};
