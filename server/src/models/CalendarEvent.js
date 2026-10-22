const mongoose = require('mongoose');
const createContextModelProxy = require('../tenancy/createContextModelProxy');
const {
  EVENT_CATEGORIES, EVENT_STATUSES, VISIBILITY, PERSON_TYPES, EVENT_ROLES, NOTIFY_LEVELS,
  REMINDER_PRESETS, RESPONSE_TYPES, RECURRENCE_FREQS
} = require('../modules/clndr/constants');

/**
 * A school event on the calendar (CLNDR).
 *
 * Shared fields (title, dates, venue) plus audience segments. Each segment says
 * who it concerns (a person type × scopes, minus exclusions), what those people
 * should do (instructions, role) and how loudly to tell them. A viewer sees the
 * event when any segment matches them, and only the segments that match.
 *
 * `targetKeys` is the union of every segment's audience keys (see
 * modules/clndr/audience.js) so "my calendar" is one indexed query. Dates are
 * school days ('YYYY-MM-DD') and times are school-local 'HH:MM'; the event is
 * not tied to an academic session (the label is kept only as a tag).
 */
const ObjectId = mongoose.Schema.Types.ObjectId;
const DATE_KEY = [/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'];
const TIME = [/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM'];

const scopeSchema = new mongoose.Schema({
  type: { type: String, required: true, trim: true, maxlength: 20 },
  value: { type: String, trim: true, maxlength: 80, default: '' },
  // What the person picking it saw ("Class 7 B", "Route 3 — Sector 21"), kept for display only.
  label: { type: String, trim: true, maxlength: 120, default: '' }
}, { _id: false });

const attachmentSchema = new mongoose.Schema({
  name: { type: String, trim: true, maxlength: 160, required: true },
  url: { type: String, trim: true, maxlength: 500, required: true }
}, { _id: false });

const segmentSchema = new mongoose.Schema({
  key: { type: String, required: true, trim: true, maxlength: 40 },
  label: { type: String, trim: true, maxlength: 80, default: '' },
  personType: { type: String, enum: [...PERSON_TYPES], required: true },
  scopes: { type: [scopeSchema], default: [] },
  exclude: { type: [scopeSchema], default: [] },
  role: { type: String, enum: [...EVENT_ROLES], default: 'attendee' },
  instructions: { type: String, trim: true, maxlength: 4000, default: '' },
  attachments: { type: [attachmentSchema], default: [] },
  notify: { type: String, enum: [...NOTIFY_LEVELS], default: 'now' },
  email: { type: Boolean, default: false },
  reminders: { type: [{ type: String, enum: Object.keys(REMINDER_PRESETS) }], default: [] },
  response: { type: String, enum: [...RESPONSE_TYPES], default: 'none' },
  responseDeadline: { type: String, match: DATE_KEY, default: undefined }
}, { _id: false });

// One line per notification run (publish, change, cancel, reminder), newest last; capped at 30.
const sendLogSchema = new mongoose.Schema({
  change: { type: String, trim: true, maxlength: 20 },
  revision: { type: Number },
  occurrence: { type: String, default: undefined },
  slot: { type: String, default: undefined },
  status: { type: String, enum: ['queued', 'sending', 'sent', 'failed'], default: 'queued' },
  at: { type: Date, default: Date.now },
  finishedAt: { type: Date, default: null },
  by: { type: ObjectId, ref: 'User', default: null },
  recipients: { type: Number, default: 0 },
  notified: { type: Number, default: 0 },
  emailsQueued: { type: Number, default: 0 },
  stats: { type: mongoose.Schema.Types.Mixed, default: undefined },
  error: { type: String, trim: true, maxlength: 300, default: '' }
});

const calendarEventSchema = new mongoose.Schema({
  uid: { type: String, required: true, trim: true },
  revision: { type: Number, default: 1 },
  title: { type: String, required: [true, 'Give the event a title'], trim: true, maxlength: 160 },
  description: { type: String, trim: true, maxlength: 4000, default: '' },
  category: { type: String, enum: [...EVENT_CATEGORIES], default: 'other' },
  allDay: { type: Boolean, default: true },
  startDate: { type: String, match: DATE_KEY, required: [true, 'Choose the date'] },
  endDate: { type: String, match: DATE_KEY, required: true },
  startTime: { type: String, match: TIME, default: undefined },
  endTime: { type: String, match: TIME, default: undefined },
  venue: { type: String, trim: true, maxlength: 160, default: '' },
  recurrence: {
    _id: false,
    freq: { type: String, enum: [...RECURRENCE_FREQS, null], default: null },
    interval: { type: Number, min: 1, max: 12, default: 1 },
    byDay: { type: [Number], default: [] },
    until: { type: String, match: DATE_KEY, default: undefined },
    exDates: { type: [String], default: [] },
    skipNonWorking: { type: Boolean, default: true }
  },
  status: { type: String, enum: [...EVENT_STATUSES], default: 'draft' },
  publishAt: { type: Date, default: null },
  publishedAt: { type: Date, default: null },
  visibility: { type: String, enum: [...VISIBILITY], default: 'segments' },
  critical: { type: Boolean, default: false },
  circularNo: { type: String, trim: true, maxlength: 60, default: '' },
  attachments: { type: [attachmentSchema], default: [] },
  segments: { type: [segmentSchema], default: [] },
  targetKeys: { type: [String], default: [] },
  // Where an event came from: created here, or announcing a school-day rule.
  source: { type: String, trim: true, maxlength: 40, default: 'calendar' },
  schoolDayRuleId: { type: ObjectId, ref: 'SchoolDayRule', default: null },
  academicSession: { type: String, trim: true, default: '' },
  createdBy: { type: ObjectId, ref: 'User', default: null },
  createdByName: { type: String, trim: true, maxlength: 120, default: '' },
  updatedBy: { type: ObjectId, ref: 'User', default: null },
  submittedBy: { type: ObjectId, ref: 'User', default: null },
  approvedBy: { type: ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  rejectionNote: { type: String, trim: true, maxlength: 500, default: '' },
  cancelledBy: { type: ObjectId, ref: 'User', default: null },
  cancelledAt: { type: Date, default: null },
  cancelReason: { type: String, trim: true, maxlength: 500, default: '' },
  sendLog: { type: [sendLogSchema], default: [] }
}, { timestamps: true, collection: 'calendar_events' });

calendarEventSchema.pre('validate', function checkEvent(next) {
  if (!this.endDate && this.startDate) this.endDate = this.startDate;
  if (this.startDate && this.endDate && this.startDate > this.endDate) {
    this.invalidate('endDate', 'The event must end on or after the day it starts');
  }
  if (!this.allDay) {
    if (!this.startTime) this.invalidate('startTime', 'Set a start time or make it an all-day event');
    if (this.startTime && this.endTime && this.startDate === this.endDate && this.endTime <= this.startTime) {
      this.invalidate('endTime', 'The event must end after it starts');
    }
  } else {
    this.startTime = undefined;
    this.endTime = undefined;
  }
  const keys = new Set();
  (this.segments || []).forEach((segment, index) => {
    if (keys.has(segment.key)) this.invalidate(`segments.${index}.key`, 'Each audience needs its own key');
    keys.add(segment.key);
  });
  next();
});

calendarEventSchema.index({ uid: 1 }, { unique: true });
calendarEventSchema.index({ targetKeys: 1, status: 1, startDate: 1 });
calendarEventSchema.index({ status: 1, visibility: 1, startDate: 1 });
calendarEventSchema.index({ status: 1, publishAt: 1 });
calendarEventSchema.index({ createdBy: 1, updatedAt: -1 });
calendarEventSchema.index({ 'sendLog.status': 1 });

module.exports = createContextModelProxy('CalendarEvent', calendarEventSchema);
