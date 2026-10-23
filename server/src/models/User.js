const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { USER_ROLES } = require('../utils/constants');
const { USER_KINDS } = require('../rbac/permissions');
const createContextModelProxy = require('../tenancy/createContextModelProxy');
const {
  syncTenantUserDirectoryFromUser,
  removeTenantUserDirectoryFromUser
} = require('../tenancy/tenantUserDirectoryService');

const linkedStudentSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  // Admission/roll number is stable across academic sessions; the portal uses
  // it to find the student's record in the current session.
  rollNumber: {
    type: String,
    trim: true,
    required: true
  },
  relation: {
    type: String,
    trim: true,
    default: ''
  }
}, { _id: false });

const assignedSectionSchema = new mongoose.Schema({
  className: { type: String, trim: true, required: true },
  section: { type: String, trim: true, required: true }
}, { _id: false });

const refreshSessionSchema = new mongoose.Schema({
  familyId: { type: String, required: true },
  tokenHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
  rememberMe: { type: Boolean, default: true },
  userAgent: { type: String, default: '' },
  ip: { type: String, default: '' }
}, { _id: false });

const userSchema = new mongoose.Schema({
  // Staff and parents sign in with email. Students may instead have only a
  // username (login ID), so email is optional when a username is set.
  email: {
    type: String,
    lowercase: true,
    trim: true,
    match: [
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      'Please provide a valid email'
    ],
    required: [
      function emailRequired() { return !this.username; },
      'Email or login ID is required'
    ]
  },
  username: {
    type: String,
    lowercase: true,
    trim: true,
    match: [/^[a-z0-9][a-z0-9._-]{1,39}$/, 'Login ID may only use letters, numbers, dot, dash and underscore']
  },
  name: {
    type: String,
    trim: true,
    maxlength: 120,
    default: ''
  },
  kind: {
    type: String,
    enum: Object.values(USER_KINDS),
    default: USER_KINDS.STAFF,
    required: true
  },
  // Role keys: built-in template keys (e.g. 'administrator') or 'custom:<roleId>'.
  roles: {
    type: [String],
    default: undefined
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Teacher',
    default: null
  },
  assignedSections: {
    type: [assignedSectionSchema],
    default: undefined
  },
  linkedStudents: {
    type: [linkedStudentSchema],
    default: undefined
  },
  // Email categories this person turned off (e.g. 'calendar'); in-app notices still arrive.
  emailOptOut: {
    type: [String],
    default: undefined
  },
  // SHA-256 of this person's private calendar feed token (modules/clndr/feed.js); reset makes a new one.
  calendarFeedTokenHash: {
    type: String,
    default: undefined,
    select: false
  },
  mustChangePassword: {
    type: Boolean,
    default: false
  },
  // Bumped whenever access must be cut immediately (password, roles, deactivation).
  tokenVersion: {
    type: Number,
    default: 0
  },
  failedLoginCount: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date,
    default: null
  },
  inviteTokenHash: {
    type: String,
    default: null,
    select: false
  },
  inviteExpiresAt: {
    type: Date,
    default: null
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  // Legacy single role, kept in sync from `kind` + `roles` for older code paths.
  role: {
    type: String,
    enum: Object.values(USER_ROLES),
    default: USER_ROLES.DATA_ENTRY_OPERATOR,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isEmailVerified: {
    type: Boolean,
    default: true  // default true so existing users are unaffected
  },
  emailVerificationOtpHash: {
    type: String,
    default: null,
  },
  emailVerificationOtpExpiresAt: {
    type: Date,
    default: null,
  },
  emailVerificationOtpAttemptCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  lastLogin: {
    type: Date
  },
  passwordChangedAt: {
    type: Date
  },
  passwordResetOtpHash: {
    type: String,
    default: null,
  },
  passwordResetOtpExpiresAt: {
    type: Date,
    default: null,
  },
  passwordResetOtpSentAt: {
    type: Date,
    default: null,
  },
  passwordResetOtpAttemptCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  passwordResetOtpLastAttemptAt: {
    type: Date,
    default: null,
  },
  // Never put a TTL (`expires`) on a date inside this array: MongoDB would
  // expire the whole user document, not the array entry.
  refreshTokens: {
    type: [refreshSessionSchema],
    default: [],
    select: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
userSchema.index(
  { email: 1 },
  { name: 'email_unique_present', unique: true, partialFilterExpression: { email: { $type: 'string' } } }
);
userSchema.index(
  { username: 1 },
  { name: 'username_unique_present', unique: true, partialFilterExpression: { username: { $type: 'string' } } }
);
userSchema.index({ kind: 1, isActive: 1 });
userSchema.index({ 'linkedStudents.rollNumber': 1 });
userSchema.index({ teacher: 1 }, { sparse: true });
userSchema.index({ calendarFeedTokenHash: 1 }, { sparse: true });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ createdAt: -1 });

// Virtual for user display name
userSchema.virtual('displayName').get(function () {
  if (this.name) return this.name;
  if (this.email) return this.email.split('@')[0];
  return this.username || '';
});

// Keep the legacy `role` field consistent with kind/roles.
userSchema.pre('validate', function (next) {
  if (this.kind && this.kind !== USER_KINDS.STAFF) {
    this.role = this.kind;
  } else if (Array.isArray(this.roles) && this.roles.length > 0) {
    this.role = this.roles.includes('administrator') ? USER_ROLES.ADMIN : USER_ROLES.STAFF;
  }
  next();
});

// Pre-save middleware to hash password
userSchema.pre('save', async function (next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) return next();

  try {
    // Hash the password with cost of 12
    const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_ROUNDS, 10) || 12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Pre-save middleware to set passwordChangedAt
userSchema.pre('save', function (next) {
  if (!this.isModified('password') || this.isNew) return next();

  this.passwordChangedAt = Date.now() - 1000;
  next();
});

// Instance method to check password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

// Instance method to check if password changed after JWT was issued
userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10
    );
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

// Instance method to remove all refresh sessions (sign out everywhere)
userSchema.methods.removeAllRefreshTokens = function () {
  this.refreshTokens = [];
  return this.save({ validateBeforeSave: false });
};

// Static method to find active users
userSchema.statics.findActive = function () {
  return this.find({ isActive: true });
};

// Static method to find by role
userSchema.statics.findByRole = function (role) {
  return this.find({ role, isActive: true });
};

// Static method to get user stats
userSchema.statics.getStats = async function () {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$role',
        count: { $sum: 1 },
        active: {
          $sum: {
            $cond: [{ $eq: ['$isActive', true] }, 1, 0]
          }
        }
      }
    }
  ]);

  const total = await this.countDocuments();
  const activeTotal = await this.countDocuments({ isActive: true });

  return {
    total,
    activeTotal,
    byRole: stats,
    lastUpdated: new Date()
  };
};

const syncDirectoryBestEffort = async (userDoc, tenantDbName) => {
  if (!userDoc?._id) {
    return;
  }

  try {
    await syncTenantUserDirectoryFromUser({
      user: userDoc,
      tenantDbName
    });
  } catch (error) {
    console.error(
      `[tenant-user-directory] sync_failed userId=${userDoc._id.toString()} message=${error.message}`
    );
  }
};

const removeFromDirectoryBestEffort = async (userDoc, tenantDbName) => {
  if (!userDoc?._id) {
    return;
  }

  try {
    await removeTenantUserDirectoryFromUser({
      user: userDoc,
      tenantDbName
    });
  } catch (error) {
    console.error(
      `[tenant-user-directory] remove_failed userId=${userDoc._id.toString()} message=${error.message}`
    );
  }
};

// Keep central directory in sync for fast tenant-by-email resolution.
userSchema.post('save', async function () {
  await syncDirectoryBestEffort(this, this.constructor?.db?.name || null);
});

userSchema.post('findOneAndUpdate', async function (doc) {
  if (!doc) {
    return;
  }

  await syncDirectoryBestEffort(doc, this.model?.db?.name || null);
});

userSchema.post('deleteOne', { document: true, query: false }, async function () {
  await removeFromDirectoryBestEffort(this, this.constructor?.db?.name || null);
});

userSchema.post('findOneAndDelete', async function (doc) {
  if (!doc) {
    return;
  }

  await removeFromDirectoryBestEffort(doc, this.model?.db?.name || null);
});

// Transform output to remove sensitive data
userSchema.methods.toJSON = function () {
  const userObject = this.toObject();

  delete userObject.password;
  delete userObject.refreshTokens;
  delete userObject.inviteTokenHash;
  delete userObject.__v;

  return userObject;
};

module.exports = createContextModelProxy('User', userSchema);
