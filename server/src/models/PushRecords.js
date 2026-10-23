const mongoose = require('mongoose');
const createContextModelProxy = require('../tenancy/createContextModelProxy');

/**
 * Push notifications to the Capabble app: the phones each login has signed in on,
 * and the outbox of pushes waiting to go through Expo's push service.
 * Only src/push writes these.
 */
const { ObjectId } = mongoose.Schema.Types;

// One row per app install (an Expo push token). The token moves to whoever signs in on that phone.
const deviceSchema = new mongoose.Schema({
  user: { type: ObjectId, ref: 'User', required: true },
  token: { type: String, required: true, trim: true, maxlength: 200 },
  platform: { type: String, enum: ['ios', 'android'], required: true },
  appVersion: { type: String, trim: true, maxlength: 40, default: '' },
  deviceName: { type: String, trim: true, maxlength: 120, default: '' },
  // The login's tokenVersion when the phone registered: "sign out everywhere" bumps it,
  // and phones signed out that way stop getting pushes until they sign in again.
  tokenVersion: { type: Number, default: 0 },
  lastSeenAt: { type: Date, default: Date.now },
  // Set when Expo says the app was uninstalled or its token is no longer valid.
  disabledAt: { type: Date, default: null },
  disabledReason: { type: String, trim: true, maxlength: 120, default: '' }
}, { timestamps: true, collection: 'devices' });

deviceSchema.index({ token: 1 }, { unique: true });
deviceSchema.index({ user: 1, disabledAt: 1 });

const PUSH_STATUSES = ['queued', 'sending', 'sent', 'delivered', 'failed'];

// One row per notification per phone. `sent`: Expo accepted it; `delivered`: Apple or Google did.
const pushOutboxSchema = new mongoose.Schema({
  dedupeKey: { type: String, required: true, trim: true, maxlength: 200 },
  user: { type: ObjectId, ref: 'User', required: true },
  device: { type: ObjectId, ref: 'Device', required: true },
  token: { type: String, required: true, trim: true, maxlength: 200 },
  notification: { type: ObjectId, ref: 'Notification', default: null },
  kind: { type: String, trim: true, maxlength: 80, default: '' },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  body: { type: String, trim: true, maxlength: 1000, default: '' },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: PUSH_STATUSES, default: 'queued' },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  ticketId: { type: String, trim: true, maxlength: 120, default: '' },
  sentAt: { type: Date, default: null },
  receiptCheckedAt: { type: Date, default: null },
  lastError: { type: String, trim: true, maxlength: 300, default: '' }
}, { timestamps: true, collection: 'push_outbox' });

pushOutboxSchema.index({ dedupeKey: 1 }, { unique: true });
pushOutboxSchema.index({ status: 1, nextAttemptAt: 1 });
pushOutboxSchema.index({ status: 1, sentAt: 1, receiptCheckedAt: 1 });
// Kept 30 days, for looking into "I didn't get it".
pushOutboxSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = {
  Device: createContextModelProxy('Device', deviceSchema),
  PushOutbox: createContextModelProxy('PushOutbox', pushOutboxSchema),
  PUSH_STATUSES
};
