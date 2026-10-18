const mongoose = require('mongoose');
const { createAllEnabledFeatureToggles } = require('../../constants/tenantFeatures');

const TENANT_STATUS = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
};

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
  featureToggles: {
    type: mongoose.Schema.Types.Mixed,
    default: () => createAllEnabledFeatureToggles(),
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
