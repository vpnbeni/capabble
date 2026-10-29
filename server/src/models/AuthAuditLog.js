const mongoose = require('mongoose');
const createContextModelProxy = require('../tenancy/createContextModelProxy');

const AUTH_AUDIT_EVENTS = Object.freeze([
  'login_success',
  'login_failed',
  'login_locked',
  'logout',
  'refresh_reuse_detected',
  'password_changed',
  'password_reset',
  'password_reset_by_admin',
  'invite_sent',
  'invite_accepted',
  'user_created',
  'user_updated',
  'user_deactivated',
  'user_reactivated',
  'roles_changed',
  'sessions_revoked',
  'role_created',
  'role_updated',
  'role_deleted',
  'view_as_started',
  'view_as_ended'
]);

const actorSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, default: null },
  label: { type: String, default: '' }
}, { _id: false });

const authAuditLogSchema = new mongoose.Schema({
  event: { type: String, enum: AUTH_AUDIT_EVENTS, required: true },
  actor: { type: actorSchema, default: () => ({}) },
  target: { type: actorSchema, default: () => ({}) },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  ip: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

authAuditLogSchema.index({ createdAt: -1 });
authAuditLogSchema.index({ 'target.userId': 1, createdAt: -1 });
authAuditLogSchema.index({ event: 1, createdAt: -1 });
// Keep one year of history.
authAuditLogSchema.index({ createdAt: 1 }, { name: 'ttl_one_year', expireAfterSeconds: 365 * 24 * 60 * 60 });

module.exports = createContextModelProxy('AuthAuditLog', authAuditLogSchema);
