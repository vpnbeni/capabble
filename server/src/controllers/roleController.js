/**
 * Roles: built-in templates (read-only, from the permission catalog) plus
 * custom roles each school defines. Mounted at /api/roles.
 */
const Joi = require('joi');
const asyncHandler = require('../middleware/asyncHandler');
const {
  catalog,
  roleTemplates,
  normalizeGrants,
  isKnownPermission,
  WILDCARD,
  SCOPES
} = require('../rbac/catalog');
const { CUSTOM_PREFIX } = require('../rbac/permissions');
const { recordAuthEvent } = require('../rbac/audit');
const eventBus = require('../events/eventBus');
const EVENTS = require('../events/eventNames');

const grantSchema = Joi.object({
  key: Joi.string().trim().max(80).required(),
  scope: Joi.string().valid(SCOPES.ALL, SCOPES.ASSIGNED).default(SCOPES.ALL)
});

const roleSchema = Joi.object({
  name: Joi.string().trim().min(2).max(60).required(),
  description: Joi.string().trim().max(240).allow('').default(''),
  basedOn: Joi.string().trim().max(80).allow('').default(''),
  permissions: Joi.array().items(grantSchema).max(300).required()
});

const httpError = (statusCode, message, errorCode) => Object.assign(new Error(message), { statusCode, errorCode });

const handle = (fn) => asyncHandler(async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message, errorCode: error.errorCode });
    }
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'A role with this name already exists.', errorCode: 'duplicate' });
    }
    return next(error);
  }
});

const validateRole = (req, body) => {
  const { error, value } = roleSchema.validate(body, { stripUnknown: true });
  if (error) throw httpError(400, error.details[0].message.replace(/"/g, ''), 'validation_error');

  const unknown = value.permissions.filter((grant) => grant.key === WILDCARD || !isKnownPermission(grant.key));
  if (unknown.length) throw httpError(400, 'One or more permissions are not recognised.', 'invalid_permission');

  const permissions = normalizeGrants(value.permissions);
  if (!req.rbac?.isAdmin) {
    const exceeds = permissions.some(({ key, scope }) => {
      const held = req.rbac?.scopeOf(key);
      return !held || (held === SCOPES.ASSIGNED && scope === SCOPES.ALL);
    });
    if (exceeds) throw httpError(403, 'A role can only include access you have yourself.', 'cannot_grant');
  }
  return { ...value, permissions };
};

const countHolders = (User, roleKey) => User.countDocuments({ roles: roleKey });

// GET /api/roles
const listRoles = handle(async (req, res) => {
  const { Role, User } = req.models;
  const custom = await Role.find({}).sort({ name: 1 }).lean();
  const keys = [...[...roleTemplates.keys()], ...custom.map((role) => `${CUSTOM_PREFIX}${role._id}`)];
  const counts = await User.aggregate([
    { $match: { roles: { $in: keys } } },
    { $unwind: '$roles' },
    { $group: { _id: '$roles', count: { $sum: 1 } } }
  ]);
  const countByKey = new Map(counts.map((row) => [row._id, row.count]));

  const system = [...roleTemplates.values()].map((template) => ({
    key: template.key,
    name: template.name,
    description: template.description,
    isSystem: true,
    locked: template.locked,
    permissions: template.permissions,
    userCount: countByKey.get(template.key) || 0
  }));
  const customRoles = custom.map((role) => ({
    key: `${CUSTOM_PREFIX}${role._id}`,
    _id: role._id,
    name: role.name,
    description: role.description,
    basedOn: role.basedOn,
    isSystem: false,
    locked: false,
    permissions: normalizeGrants(role.permissions),
    userCount: countByKey.get(`${CUSTOM_PREFIX}${role._id}`) || 0,
    updatedAt: role.updatedAt
  }));

  res.json({ success: true, data: [...system, ...customRoles] });
});

// GET /api/roles/catalog — modules, resources and actions for the role editor
const getCatalog = handle(async (req, res) => {
  res.json({
    success: true,
    data: {
      modules: catalog.modules,
      resources: catalog.resources.map(({ key, module, label, actions, scopable }) => ({
        key, module, label, actions, scopable: Boolean(scopable)
      })),
      actionLabels: catalog.actionLabels
    }
  });
});

// POST /api/roles
const createRole = handle(async (req, res) => {
  const value = validateRole(req, req.body);
  const role = await req.models.Role.create({ ...value, createdBy: req.user._id, updatedBy: req.user._id });
  await recordAuthEvent(req, { event: 'role_created', target: null, details: { roleId: role._id, name: role.name } });
  res.status(201).json({ success: true, message: 'Role created', data: { ...role.toObject(), key: `${CUSTOM_PREFIX}${role._id}` } });
});

// PUT /api/roles/:id
const updateRole = handle(async (req, res) => {
  const { Role, User } = req.models;
  const role = await Role.findById(req.params.id);
  if (!role) throw httpError(404, 'Role not found.');
  const value = validateRole(req, req.body);
  const permissionsBefore = JSON.stringify(role.toObject().permissions || []);

  role.name = value.name;
  role.description = value.description;
  role.permissions = value.permissions;
  role.updatedBy = req.user._id;
  await role.save();

  // People with this role pick up the change on their next request; bump their
  // token version so open sessions refresh and re-read their permissions.
  await User.updateMany({ roles: `${CUSTOM_PREFIX}${role._id}` }, { $inc: { tokenVersion: 1 } });
  await recordAuthEvent(req, { event: 'role_updated', target: null, details: { roleId: role._id, name: role.name } });
  if (JSON.stringify(role.toObject().permissions || []) !== permissionsBefore) {
    eventBus.emitFromRequest(req, EVENTS.ROLE_PERMISSIONS_CHANGED, { roleKey: `${CUSTOM_PREFIX}${role._id}`, roleName: role.name });
  }
  res.json({ success: true, message: 'Role updated', data: { ...role.toObject(), key: `${CUSTOM_PREFIX}${role._id}` } });
});

// DELETE /api/roles/:id — only when nobody holds it
const deleteRole = handle(async (req, res) => {
  const { Role, User } = req.models;
  const role = await Role.findById(req.params.id);
  if (!role) throw httpError(404, 'Role not found.');
  const holders = await countHolders(User, `${CUSTOM_PREFIX}${role._id}`);
  if (holders > 0) {
    throw httpError(409, `${holders} login${holders === 1 ? ' has' : 's have'} this role. Give them another role first.`, 'role_in_use');
  }
  await role.deleteOne();
  await recordAuthEvent(req, { event: 'role_deleted', target: null, details: { roleId: role._id, name: role.name } });
  res.json({ success: true, message: 'Role deleted' });
});

module.exports = {
  listRoles,
  getCatalog,
  createRole,
  updateRole,
  deleteRole
};
