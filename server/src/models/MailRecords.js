const mongoose = require('mongoose');
const createContextModelProxy = require('../tenancy/createContextModelProxy');

/**
 * School email: the school's own SMTP account (optional), the outbox of emails
 * waiting to go, and addresses that must not be emailed again.
 * Only src/mail/outbox.js and the mail settings controller write these.
 */
const ObjectId = mongoose.Schema.Types.ObjectId;

const secretSchema = new mongoose.Schema({
  iv: String,
  tag: String,
  data: String
}, { _id: false });

// One document per school.
const schoolMailSettingsSchema = new mongoose.Schema({
  key: { type: String, default: 'default', unique: true },
  enabled: { type: Boolean, default: false },
  host: { type: String, trim: true, maxlength: 200, default: '' },
  port: { type: Number, min: 1, max: 65535, default: 587 },
  secure: { type: Boolean, default: false },
  user: { type: String, trim: true, maxlength: 200, default: '' },
  password: { type: secretSchema, default: undefined },
  fromName: { type: String, trim: true, maxlength: 120, default: '' },
  fromEmail: { type: String, trim: true, lowercase: true, maxlength: 200, default: '' },
  replyTo: { type: String, trim: true, lowercase: true, maxlength: 200, default: '' },
  // At most this many emails a day through the school's own account (its provider's limit).
  dailyLimit: { type: Number, min: 1, max: 100000, default: 1500 },
  lastTestAt: { type: Date, default: null },
  lastTestOk: { type: Boolean, default: null },
  lastError: { type: String, trim: true, maxlength: 300, default: '' },
  updatedBy: { type: ObjectId, ref: 'User', default: null }
}, { timestamps: true, collection: 'school_mail_settings' });

const MAIL_STATUSES = ['queued', 'sending', 'sent', 'failed', 'suppressed', 'capped', 'skipped'];

const mailOutboxSchema = new mongoose.Schema({
  // Same key → stored once, so a re-run never emails twice.
  dedupeKey: { type: String, required: true, trim: true, maxlength: 300 },
  category: { type: String, trim: true, maxlength: 40, default: 'calendar' },
  to: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
  toName: { type: String, trim: true, maxlength: 120, default: '' },
  userId: { type: ObjectId, ref: 'User', default: null },
  subject: { type: String, required: true, maxlength: 300 },
  html: { type: String, default: '' },
  text: { type: String, default: '' },
  ics: { type: String, default: '' },
  icsMethod: { type: String, enum: ['PUBLISH', 'CANCEL', ''], default: '' },
  unsubscribeUrl: { type: String, trim: true, maxlength: 600, default: '' },
  entity: {
    _id: false,
    type: { type: String, trim: true, maxlength: 40, default: '' },
    id: { type: String, trim: true, maxlength: 60, default: '' }
  },
  status: { type: String, enum: MAIL_STATUSES, default: 'queued' },
  sender: { type: String, enum: ['school', 'platform', ''], default: '' },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  lastError: { type: String, trim: true, maxlength: 300, default: '' },
  messageId: { type: String, trim: true, maxlength: 300, default: '' },
  sentAt: { type: Date, default: null }
}, { timestamps: true, collection: 'mail_outbox' });

mailOutboxSchema.index({ dedupeKey: 1 }, { unique: true });
mailOutboxSchema.index({ status: 1, nextAttemptAt: 1 });
mailOutboxSchema.index({ 'entity.id': 1, status: 1 });
mailOutboxSchema.index({ sender: 1, sentAt: 1 });
// Sent and failed mail is kept 90 days for the delivery report.
mailOutboxSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

const mailSuppressionSchema = new mongoose.Schema({
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
  reason: { type: String, enum: ['bounced', 'complained', 'manual'], default: 'bounced' },
  detail: { type: String, trim: true, maxlength: 300, default: '' }
}, { timestamps: true, collection: 'mail_suppressions' });
mailSuppressionSchema.index({ email: 1 }, { unique: true });

module.exports = {
  SchoolMailSettings: createContextModelProxy('SchoolMailSettings', schoolMailSettingsSchema),
  MailOutbox: createContextModelProxy('MailOutbox', mailOutboxSchema),
  MailSuppression: createContextModelProxy('MailSuppression', mailSuppressionSchema),
  MAIL_STATUSES
};
