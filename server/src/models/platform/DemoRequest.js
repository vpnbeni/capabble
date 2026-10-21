const mongoose = require('mongoose');

/*
 * A "Request a demo" lead from the marketing site (capabble.cloud/request-demo).
 * Created by the public endpoint, worked by platform admins in the admin portal.
 */
const DEMO_REQUEST_STATUSES = ['new', 'contacted', 'scheduled', 'closed'];

const demoRequestSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  institution: { type: String, required: true, trim: true },
  role: { type: String, trim: true, default: '' },
  email: { type: String, required: true, trim: true, lowercase: true },
  phone: { type: String, required: true, trim: true },
  city: { type: String, trim: true, default: '' },
  state: { type: String, trim: true, default: '' },
  studentCount: { type: String, trim: true, default: '' },
  modules: { type: [String], default: [] },
  preferredTime: { type: String, trim: true, default: '' },
  message: { type: String, trim: true, default: '' },
  status: {
    type: String,
    enum: DEMO_REQUEST_STATUSES,
    default: 'new'
  },
  notes: { type: String, trim: true, default: '' },
  statusUpdatedAt: { type: Date, default: null },
  statusUpdatedBy: { type: String, default: null },
  source: { type: String, trim: true, default: 'website' },
  createdIp: { type: String, default: null },
  createdUserAgent: { type: String, default: null }
}, {
  timestamps: true
});

demoRequestSchema.index({ status: 1, createdAt: -1 });
demoRequestSchema.index({ createdAt: -1 });

const MODEL_NAME = 'DemoRequest';

const getDemoRequestModel = (connection) => {
  if (!connection) {
    throw new Error('A mongoose connection is required to get DemoRequest model');
  }

  return connection.models[MODEL_NAME] || connection.model(MODEL_NAME, demoRequestSchema);
};

module.exports = {
  demoRequestSchema,
  getDemoRequestModel,
  DEMO_REQUEST_STATUSES,
  MODEL_NAME
};
