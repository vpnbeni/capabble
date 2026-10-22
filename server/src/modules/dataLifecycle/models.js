/*
 * Central (platform database) records for backups, workspace archives, purges and re-imports.
 * Each purge and re-import record doubles as its audit entry: who approved it, when, and what it did.
 */
const mongoose = require('mongoose');
const { getPlatformConnection } = require('../../config/platformDatabase');

const { Schema } = mongoose;

const actorSchema = new Schema({
  id: { type: String, default: '' },
  email: { type: String, trim: true, lowercase: true, default: '' },
  name: { type: String, trim: true, default: '' }
}, { _id: false });

/** One row per scheduled job; only the instance holding the lease runs it. */
const jobLeaseSchema = new Schema({
  _id: { type: String },
  holder: { type: String, default: '' },
  lockedUntil: { type: Date, default: () => new Date(0) },
  lastRunAt: { type: Date, default: null },
  // IST day (YYYY-MM-DD) of the last completed run, so a daily job runs once a day.
  lastDay: { type: String, default: '' },
  attemptDay: { type: String, default: '' },
  attempts: { type: Number, default: 0 },
  lastResult: { type: Schema.Types.Mixed, default: null }
}, { collection: 'job_leases', versionKey: false });

const backupFileSchema = new Schema({
  kind: { type: String, enum: ['central', 'tenant', 'billing'], required: true },
  label: { type: String, default: '' },
  dbName: { type: String, default: '' },
  key: { type: String, default: '' },
  bytes: { type: Number, default: 0 },
  sha256: { type: String, default: '' },
  ok: { type: Boolean, default: false },
  error: { type: String, default: '' }
}, { _id: false });

const backupRunSchema = new Schema({
  runId: { type: String, required: true, unique: true },
  trigger: { type: String, enum: ['scheduled', 'manual'], default: 'scheduled' },
  status: { type: String, enum: ['running', 'ok', 'partial', 'failed'], default: 'running' },
  storage: { type: String, default: '' },
  prefix: { type: String, default: '' },
  startedAt: { type: Date, default: Date.now },
  finishedAt: { type: Date, default: null },
  files: { type: [backupFileSchema], default: [] },
  error: { type: String, default: '' }
}, { collection: 'backup_runs', versionKey: false });
backupRunSchema.index({ startedAt: -1 });

const workspaceArchiveSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, required: true, index: true },
  slug: { type: String, required: true },
  reason: { type: String, enum: ['closure', 'on_demand'], default: 'on_demand' },
  status: { type: String, enum: ['building', 'ready', 'failed', 'deleted'], default: 'building' },
  requestedBy: { type: actorSchema, default: null },
  key: { type: String, default: '' },
  filename: { type: String, default: '' },
  bytes: { type: Number, default: 0 },
  sha256: { type: String, default: '' },
  filesMode: { type: String, enum: ['included', 'links', 'partial', 'none', ''], default: '' },
  fileCount: { type: Number, default: 0 },
  documentCount: { type: Number, default: 0 },
  readyAt: { type: Date, default: null },
  deletedAt: { type: Date, default: null },
  error: { type: String, default: '' }
}, { collection: 'workspace_archives', timestamps: true, versionKey: false });

const PURGE_OPEN_STATUSES = ['awaiting_approval', 'running'];

const workspacePurgeSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, required: true, index: true },
  slug: { type: String, required: true },
  name: { type: String, default: '' },
  dbName: { type: String, default: '' },
  status: {
    type: String,
    enum: ['awaiting_approval', 'running', 'done', 'failed', 'dismissed'],
    default: 'awaiting_approval'
  },
  dueAt: { type: Date, required: true },
  // The time the job ran with (differs from createdAt only when a test clock was used).
  clockAt: { type: Date, required: true },
  supportNotifiedAt: { type: Date, default: null },
  approvedBy: { type: actorSchema, default: null },
  approvedAt: { type: Date, default: null },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  plan: { type: Schema.Types.Mixed, default: null },
  result: { type: Schema.Types.Mixed, default: null },
  error: { type: String, default: '' }
}, { collection: 'workspace_purges', timestamps: true, versionKey: false });
// At most one open purge per tenant, even if two job runs race.
workspacePurgeSchema.index(
  { tenantId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: PURGE_OPEN_STATUSES } }, name: 'one_open_purge_per_tenant' }
);

const workspaceImportSchema = new Schema({
  key: { type: String, required: true },
  source: { type: String, enum: ['upload', 'archive'], default: 'upload' },
  status: { type: String, enum: ['planned', 'running', 'done', 'failed'], default: 'planned' },
  targetSlug: { type: String, default: '' },
  tenantId: { type: Schema.Types.ObjectId, default: null },
  plan: { type: Schema.Types.Mixed, default: null },
  steps: { type: [Schema.Types.Mixed], default: [] },
  createdBy: { type: actorSchema, default: null },
  startedAt: { type: Date, default: null },
  finishedAt: { type: Date, default: null },
  error: { type: String, default: '' }
}, { collection: 'workspace_imports', timestamps: true, versionKey: false });

const define = (name, schema) => {
  const connection = getPlatformConnection();
  return connection.models[name] || connection.model(name, schema);
};

const getModels = () => ({
  JobLease: define('JobLease', jobLeaseSchema),
  BackupRun: define('BackupRun', backupRunSchema),
  WorkspaceArchive: define('WorkspaceArchive', workspaceArchiveSchema),
  WorkspacePurge: define('WorkspacePurge', workspacePurgeSchema),
  WorkspaceImport: define('WorkspaceImport', workspaceImportSchema)
});

module.exports = { getModels, PURGE_OPEN_STATUSES };
