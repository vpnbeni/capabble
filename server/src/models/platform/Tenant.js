const mongoose = require('mongoose');
const { createAllEnabledFeatureToggles } = require('../../constants/tenantFeatures');

const TENANT_STATUS = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  // The school closed its workspace and the export window ended: no sign-in, data kept until purge.
  CLOSED: 'closed',
  // Purged: the database and files are gone. The record stays for billing history and audit.
  DELETED: 'deleted',
};

const closureActorSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, default: null },
  email: { type: String, trim: true, lowercase: true, default: '' },
  name: { type: String, trim: true, default: '' }
}, { _id: false });

/**
 * A school's request to close its workspace (Settings → Account → Close workspace).
 * Pending while requestedAt is set and canceledAt is empty. Nothing is disabled or deleted
 * when it is recorded: a later platform job closes the workspace after exportUntil and
 * deletes its data by deleteAfter.
 */
const closureSchema = new mongoose.Schema({
  requestedAt: { type: Date, default: null },
  requestedBy: { type: closureActorSchema, default: null },
  exportUntil: { type: Date, default: null },
  deleteAfter: { type: Date, default: null },
  canceledAt: { type: Date, default: null },
  canceledBy: { type: closureActorSchema, default: null },
  // Set by the daily workspace job (dataLifecycle/lifecycleJob.js).
  closedAt: { type: Date, default: null },
  deletionNoticeSentAt: { type: Date, default: null }
}, { _id: false });

const tenantSchema = new mongoose.Schema({
  slug: {
    type: String,
    required: [true, 'Tenant slug is required'],
    trim: true,
    lowercase: true,
    unique: true,
    match: [/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/, 'Invalid tenant slug'],
  },
  name: {
    type: String,
    required: [true, 'Tenant name is required'],
    trim: true,
    maxlength: [120, 'Tenant name cannot exceed 120 characters'],
  },
  dbName: {
    type: String,
    required: [true, 'Tenant dbName is required'],
    trim: true,
    unique: true,
  },
  status: {
    type: String,
    enum: Object.values(TENANT_STATUS),
    default: TENANT_STATUS.ACTIVE,
  },
  adminEmail: {
    type: String,
    required: [true, 'Initial admin email is required'],
    trim: true,
    lowercase: true,
  },
  // Testing only, set from the admin portal: the school owner may switch to any
  // login and act as them (see rbac/viewAs). Off for every real school.
  allowUserSwitching: {
    type: Boolean,
    default: false,
  },
  featureToggles: {
    type: mongoose.Schema.Types.Mixed,
    default: () => createAllEnabledFeatureToggles(),
  },
  closure: {
    type: closureSchema,
    default: null
  },
  deletedAt: {
    type: Date,
    default: null,
  },
  // Set when the workspace was re-imported from an archive (admin portal).
  restoredAt: {
    type: Date,
    default: null,
  },
  metadata: {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    schoolCode: {
      type: String,
      trim: true,
      default: '',
    },
    affiliationNo: {
      type: String,
      trim: true,
      default: '',
    },
    udiseCode: {
      type: String,
      trim: true,
      default: '',
    },
  },
}, {
  timestamps: true,
});

tenantSchema.index({ status: 1 });

const MODEL_NAME = 'Tenant';

const getTenantModel = (connection) => {
  if (!connection) {
    throw new Error('A mongoose connection is required to get Tenant model');
  }

  return connection.models[MODEL_NAME] || connection.model(MODEL_NAME, tenantSchema);
};

module.exports = {
  TENANT_STATUS,
  tenantSchema,
  getTenantModel,
  MODEL_NAME,
};
