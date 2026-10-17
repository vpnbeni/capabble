/**
 * School-side management of logins: staff (with roles), parents and students.
 * There is no self sign-up; every account is created here.
 *
 * Mounted at /api/users. Reads need `core.users.read`, changes `core.users.manage`
 * (enforced by the tenant access gate from the permission catalog).
 */
const crypto = require('crypto');
const mongoose = require('mongoose');
const Joi = require('joi');
const asyncHandler = require('../middleware/asyncHandler');
const { newPasswordRule } = require('../validations/authValidation');
const {
  ADMINISTRATOR_ROLE,
  roleTemplates,
  suggestRoleForDesignation,
  SCOPES
} = require('../rbac/catalog');
const {
  USER_KINDS,
  CUSTOM_PREFIX,
  customRoleId,
  getRoleKeys,
  isAdministrator,
  resolvePermissionSet
} = require('../rbac/permissions');
const { revokeAllSessions } = require('../rbac/session');
const { recordAuthEvent } = require('../rbac/audit');
const { ensureUserIndexes } = require('../rbac/userIndexes');
const { isPlaceholderEmail, realEmailOrEmpty } = require('../utils/placeholderEmail');
const { sortClassNames, sortSectionNames } = require('../utils/sortSections');
const {
  generateTemporaryPassword,
  createInvite,
  buildInviteUrl,
  sendInviteEmail
} = require('../rbac/credentials');

const objectId = Joi.string().pattern(/^[0-9a-fA-F]{24}$/).messages({ 'string.pattern.base': 'Invalid ID' });
const usernameRule = Joi.string().trim().lowercase().pattern(/^[a-z0-9][a-z0-9._-]{1,39}$/)
  .messages({ 'string.pattern.base': 'Login ID may only use letters, numbers, dot, dash and underscore (2-40 characters)' });
const sectionRule = Joi.object({
  className: Joi.string().trim().max(50).required(),
  section: Joi.string().trim().max(50).required()
});
const studentLinkRule = Joi.object({
  studentId: objectId.required(),
  relation: Joi.string().trim().max(40).allow('').default('')
});
const credentialRule = Joi.object({
  method: Joi.string().valid('invite', 'temporary').required(),
  password: newPasswordRule.optional()
});

const createSchema = Joi.object({
  kind: Joi.string().valid(...Object.values(USER_KINDS)).required(),
  name: Joi.string().trim().max(120).allow('').default(''),
  email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).allow('', null),
  username: usernameRule.allow('', null),
  roles: Joi.array().items(Joi.string().trim().max(80)).default([]),
  teacherId: objectId.allow(null, ''),
  assignedSections: Joi.array().items(sectionRule).max(100).default([]),
  students: Joi.array().items(studentLinkRule).max(20).default([]),
  credential: credentialRule.required()
});

const updateSchema = Joi.object({
  name: Joi.string().trim().max(120).allow(''),
  email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).allow('', null),
  username: usernameRule.allow('', null),
  roles: Joi.array().items(Joi.string().trim().max(80)),
  teacherId: objectId.allow(null, ''),
  assignedSections: Joi.array().items(sectionRule).max(100),
  students: Joi.array().items(studentLinkRule).max(20),
  isActive: Joi.boolean()
}).min(1);

const bulkPortalSchema = Joi.object({
  kind: Joi.string().valid(USER_KINDS.PARENT, USER_KINDS.STUDENT).required(),
  className: Joi.string().trim().max(50).allow(''),
  section: Joi.string().trim().max(50).allow(''),
  studentIds: Joi.array().items(objectId).max(1000),
  method: Joi.string().valid('invite', 'temporary').required()
}).or('className', 'studentIds');

const httpError = (statusCode, message, errorCode) => Object.assign(new Error(message), { statusCode, errorCode });

const validate = (schema, body) => {
  const { error, value } = schema.validate(body, { abortEarly: true, stripUnknown: true });
  if (error) throw httpError(400, error.details[0].message.replace(/"/g, ''), 'validation_error');
  return value;
};

const handle = (fn) => asyncHandler(async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message, errorCode: error.errorCode });
    }
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || error.keyValue || {})[0] || 'value';
      return res.status(409).json({
        success: false,
        message: field === 'email' ? 'Another login already uses this email.' : 'Another login already uses this login ID.',
        errorCode: 'duplicate'
      });
    }
    return next(error);
  }
});

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sanitizeUsername = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9._-]/g, '').replace(/^[^a-z0-9]+/, '').slice(0, 40);

const getModels = (req) => {
  const { User, Role, Teacher, Student, AuthAuditLog } = req.models || {};
  if (!User) throw httpError(500, 'Tenant context is missing');
  return { User, Role, Teacher, Student, AuthAuditLog };
};

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

const loadRoleNames = async (Role) => {
  const names = new Map([...roleTemplates.values()].map((template) => [template.key, template.name]));
  if (Role) {
    const custom = await Role.find({}).select('name').lean();
    custom.forEach((role) => names.set(`${CUSTOM_PREFIX}${role._id}`, role.name));
  }
  return names;
};

const serializeUsers = async (req, users) => {
  const { Role, Teacher, Student } = getModels(req);
  const roleNames = await loadRoleNames(Role);

  const teacherIds = users.map((user) => user.teacher).filter(Boolean);
  const studentIds = users.flatMap((user) => (user.linkedStudents || []).map((link) => link.student));
  const [teachers, students] = await Promise.all([
    Teacher && teacherIds.length ? Teacher.find({ _id: { $in: teacherIds } }).select('name designation employeeId').lean() : [],
    Student && studentIds.length ? Student.find({ _id: { $in: studentIds } }).select('name class section rollNumber').lean() : []
  ]);
  const teacherById = new Map(teachers.map((teacher) => [teacher._id.toString(), teacher]));
  const studentById = new Map(students.map((student) => [student._id.toString(), student]));
  const now = Date.now();

  return users.map((user) => {
    const teacher = user.teacher ? teacherById.get(user.teacher.toString()) : null;
    return {
      _id: user._id,
      kind: user.kind || USER_KINDS.STAFF,
      name: user.name || teacher?.name || '',
      email: user.email || null,
      username: user.username || null,
      loginId: user.username ? `${user.username}@${req.tenant?.slug}` : user.email,
      roles: getRoleKeys(user).map((key) => ({ key, name: roleNames.get(key) || 'Removed role' })),
      teacher: teacher ? { _id: teacher._id, name: teacher.name, designation: teacher.designation || '' } : null,
      assignedSections: user.assignedSections || [],
      linkedStudents: (user.linkedStudents || []).map((link) => {
        const student = studentById.get(link.student.toString());
        return {
          studentId: link.student,
          rollNumber: link.rollNumber,
          relation: link.relation || '',
          name: student?.name || '',
          className: student?.class || '',
          section: student?.section || ''
        };
      }),
      isActive: user.isActive,
      mustChangePassword: Boolean(user.mustChangePassword),
      invitePending: Boolean(user.inviteExpiresAt && new Date(user.inviteExpiresAt).getTime() > now),
      inviteExpiresAt: user.inviteExpiresAt || null,
      lockedUntil: user.lockUntil && new Date(user.lockUntil).getTime() > now ? user.lockUntil : null,
      lastLogin: user.lastLogin || null,
      createdAt: user.createdAt
    };
  });
};

// ---------------------------------------------------------------------------
// Guardrails
// ---------------------------------------------------------------------------

const ADMIN_FILTER = {
  isActive: true,
  kind: { $nin: [USER_KINDS.PARENT, USER_KINDS.STUDENT] },
  $or: [
    { roles: ADMINISTRATOR_ROLE },
    { role: 'admin', $or: [{ roles: { $exists: false } }, { roles: { $size: 0 } }] }
  ]
};

const assertNotLastAdministrator = async (User, user) => {
  if (!isAdministrator(user) || !user.isActive) return;
  const count = await User.countDocuments({ $and: [ADMIN_FILTER, { _id: { $ne: user._id } }] });
  if (count === 0) {
    throw httpError(409, 'This is the only active administrator. Make someone else an administrator first.', 'last_administrator');
  }
};

/** Validate role keys and make sure the actor is not granting more than they hold. */
const resolveRoleKeys = async (req, keys = []) => {
  const { Role } = getModels(req);
  const unique = [...new Set(keys.filter(Boolean))];

  const customIds = unique.map(customRoleId).filter(Boolean);
  const customRoles = customIds.length && Role
    ? await Role.find({ _id: { $in: customIds }, isActive: { $ne: false } }).select('_id').lean()
    : [];
  const validCustom = new Set(customRoles.map((role) => `${CUSTOM_PREFIX}${role._id}`));

  const invalid = unique.filter((key) => !roleTemplates.has(key) && !validCustom.has(key));
  if (invalid.length) throw httpError(400, 'One or more roles no longer exist. Refresh and try again.', 'invalid_role');

  if (!req.rbac?.isAdmin) {
    if (unique.includes(ADMINISTRATOR_ROLE)) {
      throw httpError(403, 'Only an administrator can give the Administrator role.', 'cannot_grant');
    }
    const granted = await resolvePermissionSet({ kind: USER_KINDS.STAFF, roles: unique }, Role);
    const exceeds = granted.toJSON().some(({ key, scope }) => {
      const held = req.rbac?.scopeOf(key);
      return !held || (held === SCOPES.ASSIGNED && scope === SCOPES.ALL);
    });
    if (exceeds) {
      throw httpError(403, 'You can only give roles whose access you have yourself.', 'cannot_grant');
    }
  }
  return unique;
};

const assertCanManageTarget = (req, target) => {
  if (isAdministrator(target) && !req.rbac?.isAdmin) {
    throw httpError(403, 'Only an administrator can change another administrator.', 'cannot_manage_admin');
  }
};

const resolveStudentLinks = async (req, links = []) => {
  if (!links.length) return [];
  const { Student } = getModels(req);
  if (!Student) throw httpError(400, 'Student records are not available for this school.');
  const ids = [...new Set(links.map((link) => link.studentId))];
  const students = await Student.find({ _id: { $in: ids } }).select('rollNumber').lean();
  if (students.length !== ids.length) throw httpError(400, 'One or more students could not be found.', 'student_not_found');
  const byId = new Map(students.map((student) => [student._id.toString(), student]));
  return ids.map((id) => ({
    student: new mongoose.Types.ObjectId(id),
    rollNumber: byId.get(id).rollNumber,
    relation: links.find((link) => link.studentId === id)?.relation || ''
  }));
};

const resolveTeacher = async (req, teacherId, excludeUserId = null) => {
  if (!teacherId) return null;
  const { User, Teacher } = getModels(req);
  if (!Teacher) throw httpError(400, 'Staff records are not available for this school.');
  const teacher = await Teacher.findById(teacherId).select('_id').lean();
  if (!teacher) throw httpError(400, 'That staff member could not be found.', 'teacher_not_found');
  const linked = await User.findOne({ teacher: teacher._id, ...(excludeUserId ? { _id: { $ne: excludeUserId } } : {}) })
    .select('_id').lean();
  if (linked) throw httpError(409, 'That staff member already has a login.', 'teacher_has_login');
  return teacher._id;
};

const assertRealEmail = (email) => {
  if (email && isPlaceholderEmail(email)) {
    throw httpError(400, "That's a placeholder address from a staff import, not a real mailbox. Enter the person's own email.", 'placeholder_email');
  }
};

const assertIdentityFree = async (User, { email, username }, excludeUserId = null) => {
  assertRealEmail(email);
  const exclude = excludeUserId ? { _id: { $ne: excludeUserId } } : {};
  if (email && await User.exists({ email, ...exclude })) {
    throw httpError(409, 'Another login already uses this email.', 'duplicate_email');
  }
  if (username && await User.exists({ username, ...exclude })) {
    throw httpError(409, 'Another login already uses this login ID.', 'duplicate_username');
  }
};

/**
 * Set the first password (or a reset) using the chosen method. Caller saves.
 * @returns {{ temporaryPassword?: string, inviteToken?: string }}
 */
const applyCredential = (user, credential) => {
  if (credential.method === 'invite') {
    if (!user.email) {
      throw httpError(400, 'An invite needs an email address. Use a temporary password for this login instead.', 'invite_needs_email');
    }
    // Unusable until the invite is accepted.
    user.password = crypto.randomBytes(32).toString('base64url');
    user.mustChangePassword = false;
    return { inviteToken: createInvite(user) };
  }
  const temporaryPassword = credential.password || generateTemporaryPassword();
  user.password = temporaryPassword;
  user.mustChangePassword = true;
  user.inviteTokenHash = null;
  user.inviteExpiresAt = null;
  return { temporaryPassword };
};

/** After saving: email the invite, and return what the admin should see once. */
const deliverCredential = async (req, user, { temporaryPassword, inviteToken }) => {
  if (temporaryPassword) return { temporaryPassword };
  const inviteUrl = buildInviteUrl(req, inviteToken);
  let emailSent = false;
  try {
    emailSent = await sendInviteEmail({ req, user, inviteUrl });
  } catch (error) {
    console.error(`[users] invite email failed for ${user.email}: ${error.message}`);
  }
  await recordAuthEvent(req, { event: 'invite_sent', target: user, details: { emailSent } });
  return { inviteUrl, emailSent };
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

// GET /api/users?kind=&status=&search=&page=&limit=
const listUsers = handle(async (req, res) => {
  const { User } = getModels(req);
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
  const and = [];

  const kind = String(req.query.kind || '');
  if (kind === USER_KINDS.STAFF) and.push({ kind: { $nin: [USER_KINDS.PARENT, USER_KINDS.STUDENT] } });
  else if (Object.values(USER_KINDS).includes(kind)) and.push({ kind });

  const status = String(req.query.status || '');
  if (status === 'active') and.push({ isActive: true });
  if (status === 'inactive') and.push({ isActive: false });
  if (status === 'invited') and.push({ inviteExpiresAt: { $gt: new Date() } });

  const search = String(req.query.search || '').trim().slice(0, 80);
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    and.push({ $or: [{ name: pattern }, { email: pattern }, { username: pattern }, { 'linkedStudents.rollNumber': pattern }] });
  }

  const filter = and.length ? { $and: and } : {};
  const [users, total] = await Promise.all([
    User.find(filter).sort({ isActive: -1, name: 1, email: 1 }).skip((page - 1) * limit).limit(limit).lean({ virtuals: false }),
    User.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: {
      users: await serializeUsers(req, users),
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
    }
  });
});

// GET /api/users/:id
const getUser = handle(async (req, res) => {
  const { User } = getModels(req);
  const user = await User.findById(req.params.id).lean();
  if (!user) throw httpError(404, 'Login not found.');
  const [serialized] = await serializeUsers(req, [user]);
  res.json({ success: true, data: serialized });
});

// POST /api/users
const createUser = handle(async (req, res) => {
  const { User } = getModels(req);
  await ensureUserIndexes(User);
  const body = validate(createSchema, req.body);
  const email = body.email || null;
  let username = body.username || null;

  const doc = { kind: body.kind, name: body.name, email, isActive: true, isEmailVerified: true };

  if (body.kind === USER_KINDS.STAFF) {
    if (!email) throw httpError(400, 'Staff logins need an email address.');
    doc.roles = await resolveRoleKeys(req, body.roles);
    if (!doc.roles.length) throw httpError(400, 'Choose at least one role.');
    doc.teacher = await resolveTeacher(req, body.teacherId);
    doc.assignedSections = body.assignedSections;
  } else {
    const links = await resolveStudentLinks(req, body.students);
    if (!links.length) throw httpError(400, 'Link at least one student.');
    if (body.kind === USER_KINDS.PARENT && !email) throw httpError(400, 'Parent logins need an email address.');
    if (body.kind === USER_KINDS.STUDENT) {
      if (links.length !== 1) throw httpError(400, 'A student login belongs to exactly one student.');
      if (await User.exists({ kind: USER_KINDS.STUDENT, 'linkedStudents.rollNumber': links[0].rollNumber })) {
        throw httpError(409, 'This student already has a login.', 'student_has_login');
      }
      username = username || sanitizeUsername(links[0].rollNumber);
      if (!username) throw httpError(400, 'Enter a login ID for this student.');
    }
    doc.linkedStudents = links;
  }
  doc.username = username;

  await assertIdentityFree(User, { email, username });

  const user = new User(doc);
  const credential = applyCredential(user, body.credential);
  await user.save();

  await recordAuthEvent(req, {
    event: 'user_created',
    target: user,
    details: { kind: user.kind, roles: doc.roles || [], method: body.credential.method }
  });
  const delivery = await deliverCredential(req, user, credential);
  const [serialized] = await serializeUsers(req, [user.toObject()]);

  res.status(201).json({ success: true, message: 'Login created', data: { user: serialized, ...delivery } });
});

// PATCH /api/users/:id
const updateUser = handle(async (req, res) => {
  const { User } = getModels(req);
  const body = validate(updateSchema, req.body);
  const user = await User.findById(req.params.id).select('+refreshTokens');
  if (!user) throw httpError(404, 'Login not found.');
  assertCanManageTarget(req, user);

  const isSelf = user._id.equals(req.user._id);
  const changes = {};
  let cutAccess = false;
  let refreshPermissions = false;

  if (body.name !== undefined) user.name = body.name;

  if (body.email !== undefined || body.username !== undefined) {
    const email = body.email !== undefined ? body.email || null : user.email;
    const username = body.username !== undefined ? body.username || null : user.username;
    if (!email && !username) throw httpError(400, 'A login needs an email or a login ID.');
    if (user.kind !== USER_KINDS.STUDENT && !email) throw httpError(400, 'This login needs an email address.');
    await assertIdentityFree(User, { email: email !== user.email ? email : null, username: username !== user.username ? username : null }, user._id);
    if (email !== user.email) changes.email = { from: user.email, to: email };
    if (username !== user.username) changes.username = { from: user.username, to: username };
    user.email = email;
    user.username = username;
  }

  if (body.roles !== undefined) {
    if (user.kind === USER_KINDS.PARENT || user.kind === USER_KINDS.STUDENT) {
      throw httpError(400, 'Parent and student logins do not have roles.');
    }
    const roles = await resolveRoleKeys(req, body.roles);
    if (!roles.length) throw httpError(400, 'Choose at least one role.');
    const losingAdmin = isAdministrator(user) && !roles.includes(ADMINISTRATOR_ROLE);
    if (losingAdmin) {
      if (isSelf) throw httpError(409, 'You cannot remove your own Administrator role.', 'self_lockout');
      await assertNotLastAdministrator(User, user);
    }
    changes.roles = { from: getRoleKeys(user), to: roles };
    user.roles = roles;
    refreshPermissions = true;
  }

  if (body.teacherId !== undefined) {
    user.teacher = body.teacherId ? await resolveTeacher(req, body.teacherId, user._id) : null;
    refreshPermissions = true;
  }
  if (body.assignedSections !== undefined) {
    user.assignedSections = body.assignedSections;
    refreshPermissions = true;
  }

  if (body.students !== undefined) {
    if (user.kind !== USER_KINDS.PARENT && user.kind !== USER_KINDS.STUDENT) {
      throw httpError(400, 'Only parent and student logins are linked to students.');
    }
    const links = await resolveStudentLinks(req, body.students);
    if (!links.length) throw httpError(400, 'Link at least one student.');
    if (user.kind === USER_KINDS.STUDENT && links.length !== 1) throw httpError(400, 'A student login belongs to exactly one student.');
    changes.students = { from: (user.linkedStudents || []).map((l) => l.rollNumber), to: links.map((l) => l.rollNumber) };
    user.linkedStudents = links;
    refreshPermissions = true;
  }

  if (body.isActive !== undefined && body.isActive !== user.isActive) {
    if (!body.isActive) {
      if (isSelf) throw httpError(409, 'You cannot deactivate your own login.', 'self_lockout');
      await assertNotLastAdministrator(User, user);
      cutAccess = true;
    }
    user.isActive = body.isActive;
    changes.isActive = body.isActive;
  }

  if (cutAccess) revokeAllSessions(user);
  // Make open sessions pick up new roles/links on their next refresh.
  else if (refreshPermissions) user.tokenVersion = (user.tokenVersion || 0) + 1;

  await user.save();

  let event = 'user_updated';
  if (changes.isActive === false) event = 'user_deactivated';
  else if (changes.isActive === true) event = 'user_reactivated';
  else if (changes.roles) event = 'roles_changed';
  await recordAuthEvent(req, { event, target: user, details: changes });

  const [serialized] = await serializeUsers(req, [user.toObject()]);
  res.json({ success: true, message: 'Login updated', data: serialized });
});

// POST /api/users/:id/reset-password  { method: 'invite' | 'temporary', password? }
const resetUserPassword = handle(async (req, res) => {
  const { User } = getModels(req);
  const credentialInput = validate(credentialRule, req.body);
  const user = await User.findById(req.params.id).select('+password +refreshTokens');
  if (!user) throw httpError(404, 'Login not found.');
  assertCanManageTarget(req, user);
  if (user._id.equals(req.user._id)) {
    throw httpError(400, 'Use "Change password" in your account to change your own password.', 'self_reset');
  }

  const credential = applyCredential(user, credentialInput);
  revokeAllSessions(user);
  user.failedLoginCount = 0;
  user.lockUntil = null;
  await user.save();

  await recordAuthEvent(req, { event: 'password_reset_by_admin', target: user, details: { method: credentialInput.method } });
  const delivery = await deliverCredential(req, user, credential);
  res.json({ success: true, message: 'Password reset. The person has been signed out everywhere.', data: delivery });
});

// POST /api/users/:id/sign-out
const signOutEverywhere = handle(async (req, res) => {
  const { User } = getModels(req);
  const user = await User.findById(req.params.id).select('+refreshTokens');
  if (!user) throw httpError(404, 'Login not found.');
  assertCanManageTarget(req, user);
  revokeAllSessions(user);
  await user.save({ validateBeforeSave: false });
  await recordAuthEvent(req, { event: 'sessions_revoked', target: user });
  res.json({ success: true, message: 'Signed out on every device.' });
});

// POST /api/users/bulk-portal
const bulkCreatePortalLogins = handle(async (req, res) => {
  const { User, Student } = getModels(req);
  if (!Student) throw httpError(400, 'Student records are not available for this school.');
  await ensureUserIndexes(User);
  const body = validate(bulkPortalSchema, req.body);

  const filter = { isActive: { $ne: false } };
  if (body.studentIds?.length) filter._id = { $in: body.studentIds };
  else {
    filter.class = new RegExp(`^\\s*${escapeRegex(body.className)}\\s*$`, 'i');
    if (body.section) filter.section = new RegExp(`^\\s*${escapeRegex(body.section)}\\s*$`, 'i');
  }
  const students = await Student.find(filter)
    .select('name rollNumber class section email guardianEmail guardianName fatherName motherName')
    .sort({ class: 1, section: 1, name: 1 })
    .limit(1000)
    .lean();

  const created = [];
  const linked = [];
  const skipped = [];

  const createOne = async (doc, method, label) => {
    const user = new User(doc);
    const credential = applyCredential(user, { method: method === 'invite' && doc.email ? 'invite' : 'temporary' });
    await user.save();
    await recordAuthEvent(req, { event: 'user_created', target: user, details: { kind: user.kind, bulk: true } });
    const delivery = await deliverCredential(req, user, credential);
    created.push({
      userId: user._id,
      name: user.name,
      loginId: user.username ? `${user.username}@${req.tenant?.slug}` : user.email,
      ...label,
      ...delivery
    });
  };

  if (body.kind === USER_KINDS.STUDENT) {
    const existing = new Set((await User.find({
      kind: USER_KINDS.STUDENT,
      'linkedStudents.rollNumber': { $in: students.map((s) => s.rollNumber) }
    }).select('linkedStudents.rollNumber').lean()).flatMap((u) => u.linkedStudents.map((l) => l.rollNumber)));

    // Sequential on purpose: login IDs must stay unique within the batch.
    // eslint-disable-next-line no-restricted-syntax
    for (const student of students) {
      const label = { studentName: student.name, className: student.class, section: student.section };
      if (existing.has(student.rollNumber)) {
        skipped.push({ ...label, reason: 'Already has a login' });
        // eslint-disable-next-line no-continue
        continue;
      }
      const base = sanitizeUsername(student.rollNumber);
      if (!base) {
        skipped.push({ ...label, reason: 'Admission number cannot be used as a login ID' });
        // eslint-disable-next-line no-continue
        continue;
      }
      let username = base;
      // eslint-disable-next-line no-await-in-loop
      for (let n = 2; await User.exists({ username }); n += 1) username = `${base}-${n}`;
      const ownEmail = realEmailOrEmpty(student.email);
      const email = ownEmail && !(await User.exists({ email: ownEmail })) ? ownEmail : null; // eslint-disable-line no-await-in-loop
      try {
        // eslint-disable-next-line no-await-in-loop
        await createOne({
          kind: USER_KINDS.STUDENT,
          name: student.name,
          username,
          email,
          isEmailVerified: true,
          linkedStudents: [{ student: student._id, rollNumber: student.rollNumber, relation: '' }]
        }, body.method, label);
      } catch (error) {
        skipped.push({ ...label, reason: error.message });
      }
    }
  } else {
    const byEmail = new Map();
    students.forEach((student) => {
      const label = { studentName: student.name, className: student.class, section: student.section };
      const email = String(student.guardianEmail || '').trim().toLowerCase();
      if (!email) {
        skipped.push({ ...label, reason: 'No guardian email on the student record' });
        return;
      }
      if (!byEmail.has(email)) byEmail.set(email, []);
      byEmail.get(email).push(student);
    });

    // eslint-disable-next-line no-restricted-syntax
    for (const [email, children] of byEmail) {
      const label = {
        studentName: children.map((c) => c.name).join(', '),
        className: children[0].class,
        section: children[0].section
      };
      const links = children.map((c) => ({ student: c._id, rollNumber: c.rollNumber, relation: c.guardianName ? 'Guardian' : 'Parent' }));
      // eslint-disable-next-line no-await-in-loop
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        if (existingUser.kind !== USER_KINDS.PARENT) {
          skipped.push({ ...label, reason: `${email} is already used by a ${existingUser.kind === USER_KINDS.STUDENT ? 'student' : 'staff'} login` });
          // eslint-disable-next-line no-continue
          continue;
        }
        const have = new Set((existingUser.linkedStudents || []).map((l) => l.rollNumber));
        const missing = links.filter((l) => !have.has(l.rollNumber));
        if (missing.length) {
          existingUser.linkedStudents = [...(existingUser.linkedStudents || []), ...missing];
          existingUser.tokenVersion = (existingUser.tokenVersion || 0) + 1;
          // eslint-disable-next-line no-await-in-loop
          await existingUser.save();
          linked.push({ userId: existingUser._id, name: existingUser.name, loginId: email, ...label });
        } else {
          skipped.push({ ...label, reason: 'Parent already has a login for these students' });
        }
        // eslint-disable-next-line no-continue
        continue;
      }
      const first = children[0];
      try {
        // eslint-disable-next-line no-await-in-loop
        await createOne({
          kind: USER_KINDS.PARENT,
          name: first.guardianName || first.fatherName || first.motherName || '',
          email,
          isEmailVerified: true,
          linkedStudents: links
        }, body.method, label);
      } catch (error) {
        skipped.push({ ...label, reason: error.message });
      }
    }
  }

  res.status(201).json({
    success: true,
    message: `${created.length} login${created.length === 1 ? '' : 's'} created`,
    data: { created, linked, skipped }
  });
});

// GET /api/users/candidates/staff?search=
const listStaffCandidates = handle(async (req, res) => {
  const { User, Teacher } = getModels(req);
  if (!Teacher) return res.json({ success: true, data: [] });
  const search = String(req.query.search || '').trim().slice(0, 80);
  const filter = { isActive: { $ne: false } };
  if (search) filter.name = new RegExp(escapeRegex(search), 'i');
  const [teachers, linked] = await Promise.all([
    Teacher.find(filter).select('name designation email employeeId').sort({ name: 1 }).limit(50).lean(),
    User.find({ teacher: { $ne: null } }).select('teacher').lean()
  ]);
  const linkedIds = new Set(linked.map((u) => String(u.teacher)));
  res.json({
    success: true,
    data: teachers.map((teacher) => ({
      _id: teacher._id,
      name: teacher.name,
      designation: teacher.designation || '',
      // Imported staff without an email have a placeholder address; never offer it.
      email: realEmailOrEmpty(teacher.email),
      employeeId: teacher.employeeId || '',
      hasLogin: linkedIds.has(String(teacher._id)),
      suggestedRole: suggestRoleForDesignation(teacher.designation)
    }))
  });
});

// GET /api/users/candidates/students?search=&className=&section=
const listStudentCandidates = handle(async (req, res) => {
  const { User, Student } = getModels(req);
  if (!Student) return res.json({ success: true, data: [] });
  const search = String(req.query.search || '').trim().slice(0, 80);
  const filter = { isActive: { $ne: false } };
  const and = [];
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    and.push({ $or: [{ name: pattern }, { rollNumber: pattern }, { guardianEmail: pattern }] });
  }
  if (req.query.className) filter.class = new RegExp(`^\\s*${escapeRegex(req.query.className)}\\s*$`, 'i');
  if (req.query.section) filter.section = new RegExp(`^\\s*${escapeRegex(req.query.section)}\\s*$`, 'i');
  if (and.length) filter.$and = and;

  const students = await Student.find(filter)
    .select('name rollNumber class section guardianEmail guardianName fatherName')
    .sort({ class: 1, section: 1, name: 1 })
    .limit(50)
    .lean();
  const rollNumbers = students.map((s) => s.rollNumber);
  const users = await User.find({ 'linkedStudents.rollNumber': { $in: rollNumbers } }).select('kind linkedStudents').lean();
  const hasStudentLogin = new Set();
  const hasParentLogin = new Set();
  users.forEach((user) => (user.linkedStudents || []).forEach((link) => {
    if (user.kind === USER_KINDS.STUDENT) hasStudentLogin.add(link.rollNumber);
    if (user.kind === USER_KINDS.PARENT) hasParentLogin.add(link.rollNumber);
  }));

  res.json({
    success: true,
    data: students.map((student) => ({
      _id: student._id,
      name: student.name,
      rollNumber: student.rollNumber,
      className: student.class,
      section: student.section,
      guardianEmail: student.guardianEmail || '',
      guardianName: student.guardianName || student.fatherName || '',
      hasStudentLogin: hasStudentLogin.has(student.rollNumber),
      hasParentLogin: hasParentLogin.has(student.rollNumber)
    }))
  });
});

// GET /api/users/candidates/classes?kind=student|parent
// Classes and sections that have active students, with how many still need a
// login of that kind. Feeds the "Create for a class" pickers.
const listClassCandidates = handle(async (req, res) => {
  const { User, Student } = getModels(req);
  if (!Student) return res.json({ success: true, data: { classOptions: [] } });
  const kind = req.query.kind === USER_KINDS.PARENT ? USER_KINDS.PARENT : USER_KINDS.STUDENT;

  const [students, users] = await Promise.all([
    Student.find({ isActive: { $ne: false } }).select('rollNumber class section guardianEmail').lean(),
    User.find({ kind }).select('linkedStudents.rollNumber').lean()
  ]);
  const hasLogin = new Set(users.flatMap((u) => (u.linkedStudents || []).map((l) => l.rollNumber)));

  // Bulk create matches class and section case-insensitively, so group the same way.
  const emptyCounts = () => ({ total: 0, withoutLogin: 0, missingGuardianEmail: 0 });
  const classes = new Map();
  students.forEach((student) => {
    const className = String(student.class || '').trim();
    const section = String(student.section || '').trim();
    if (!className) return;
    const classKey = className.toLowerCase();
    if (!classes.has(classKey)) classes.set(classKey, { className, ...emptyCounts(), sections: new Map() });
    const entry = classes.get(classKey);
    const targets = [entry];
    if (section) {
      const sectionKey = section.toLowerCase();
      if (!entry.sections.has(sectionKey)) entry.sections.set(sectionKey, { section, ...emptyCounts() });
      targets.push(entry.sections.get(sectionKey));
    }
    const needsLogin = !hasLogin.has(student.rollNumber);
    const noEmail = kind === USER_KINDS.PARENT && needsLogin && !String(student.guardianEmail || '').trim();
    targets.forEach((target) => {
      target.total += 1;
      if (needsLogin) target.withoutLogin += 1;
      if (noEmail) target.missingGuardianEmail += 1;
    });
  });

  const classOptions = Array.from(classes.values())
    .sort((a, b) => sortClassNames(a.className, b.className))
    .map((entry) => ({
      ...entry,
      sections: Array.from(entry.sections.values())
        .sort((a, b) => sortSectionNames(a.section, b.section, entry.className))
    }));
  res.json({ success: true, data: { classOptions } });
});

// GET /api/users/audit?userId=&page=
const listAuditLog = handle(async (req, res) => {
  const { AuthAuditLog } = getModels(req);
  if (!AuthAuditLog) return res.json({ success: true, data: { events: [], pagination: { page: 1, pages: 1, total: 0 } } });
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = 50;
  const filter = {};
  if (req.query.userId && mongoose.Types.ObjectId.isValid(req.query.userId)) {
    filter.$or = [{ 'target.userId': req.query.userId }, { 'actor.userId': req.query.userId }];
  }
  const [events, total] = await Promise.all([
    AuthAuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuthAuditLog.countDocuments(filter)
  ]);
  res.json({ success: true, data: { events, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } } });
});

module.exports = {
  listUsers,
  getUser,
  createUser,
  updateUser,
  resetUserPassword,
  signOutEverywhere,
  bulkCreatePortalLogins,
  listStaffCandidates,
  listStudentCandidates,
  listClassCandidates,
  listAuditLog,
  // exported for tests
  ADMIN_FILTER,
  sanitizeUsername
};
