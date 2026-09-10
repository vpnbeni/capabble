const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const {
  PLATFORM_ADMIN_LOGIN_REGEX,
  PLATFORM_ADMIN_LOGIN_MESSAGE,
} = require('../../constants/platformAdminAuth');

const platformAdminSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [PLATFORM_ADMIN_LOGIN_REGEX, PLATFORM_ADMIN_LOGIN_MESSAGE],
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false,
  },
  name: {
    type: String,
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters'],
    default: 'Platform Admin',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  lastLogin: {
    type: Date,
  },
}, {
  timestamps: true,
});

platformAdminSchema.index({ isActive: 1 });

platformAdminSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }

  const saltRounds = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;
  this.password = await bcrypt.hash(this.password, await bcrypt.genSalt(saltRounds));
  next();
});

platformAdminSchema.methods.matchPassword = function(password) {
  return bcrypt.compare(password, this.password);
};

const MODEL_NAME = 'PlatformAdmin';

const getPlatformAdminModel = (connection) => {
  if (!connection) {
    throw new Error('A mongoose connection is required to get PlatformAdmin model');
  }

  return connection.models[MODEL_NAME] || connection.model(MODEL_NAME, platformAdminSchema);
};

module.exports = {
  platformAdminSchema,
  getPlatformAdminModel,
  MODEL_NAME,
};
