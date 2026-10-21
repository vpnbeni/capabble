const mongoose = require('mongoose');
const createContextModelProxy = require('../tenancy/createContextModelProxy');

const TONES = ['info', 'success', 'warning', 'danger'];

// One row per recipient. Written by src/notifications (never by a controller directly),
// read by the bell and the notifications page. Old rows expire after 180 days.
const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  kind: { type: String, required: true, trim: true, maxlength: 80 },
  module: { type: String, trim: true, maxlength: 20, default: 'core' },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  body: { type: String, trim: true, maxlength: 1000, default: '' },
  link: { type: String, trim: true, maxlength: 300, default: '' },
  tone: { type: String, enum: TONES, default: 'info' },
  entity: {
    _id: false,
    type: { type: String, trim: true, maxlength: 40, default: '' },
    id: { type: String, trim: true, maxlength: 60, default: '' }
  },
  // Same key for the same recipient is stored once, so listeners and reminders can retry safely.
  dedupeKey: { type: String, trim: true, maxlength: 200 },
  readAt: { type: Date, default: null }
}, { timestamps: true });

notificationSchema.index({ recipient: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index(
  { recipient: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } }
);
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

module.exports = createContextModelProxy('Notification', notificationSchema);
