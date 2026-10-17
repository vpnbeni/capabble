const mongoose = require('mongoose');
const createContextModelProxy = require('../tenancy/createContextModelProxy');
const {
  APPOINTMENT_STATUSES,
  VISITOR_TYPES,
  APPOINTMENT_SOURCES,
  APPOINTMENT_MODES,
  DEFAULT_PURPOSES
} = require('../modules/appnt/lifecycle');

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const { ObjectId } = mongoose.Schema.Types;

// A person who can be booked. Linked to a staff record (Teacher) and/or a login (User),
// so the principal can be a host even without a staff record.
const hostSchema = new mongoose.Schema({
  teacher: { type: ObjectId, ref: 'Teacher', default: null },
  user: { type: ObjectId, ref: 'User', default: null },
  displayName: { type: String, required: true, trim: true, maxlength: 120 },
  title: { type: String, trim: true, maxlength: 120, default: '' },
  email: { type: String, trim: true, lowercase: true, maxlength: 200, default: '' },
  location: { type: String, trim: true, maxlength: 120, default: '' },
  slotMinutes: { type: Number, min: 5, max: 240, default: 15 },
  bufferMinutes: { type: Number, min: 0, max: 120, default: 0 },
  maxPerDay: { type: Number, min: 0, max: 100, default: 0 }, // 0 = no limit
  weeklyAvailability: [{
    _id: false,
    day: { type: Number, min: 0, max: 6, required: true }, // 0 = Sunday
    start: { type: String, match: TIME, required: true },
    end: { type: String, match: TIME, required: true }
  }],
  blockedDates: [{
    _id: false,
    date: { type: String, match: DATE, required: true },
    reason: { type: String, trim: true, maxlength: 200, default: '' }
  }],
  requiresApproval: { type: Boolean, default: true },
  parentBookable: { type: Boolean, default: false },
  parentVisibility: { type: String, enum: ['all', 'linked'], default: 'all' },
  isActive: { type: Boolean, default: true },
  createdBy: { type: String, trim: true, default: '' },
  updatedBy: { type: String, trim: true, default: '' }
}, { timestamps: true });
hostSchema.index({ teacher: 1 }, { unique: true, partialFilterExpression: { teacher: { $type: 'objectId' } } });
hostSchema.index({ user: 1 }, { unique: true, partialFilterExpression: { user: { $type: 'objectId' } } });
hostSchema.index({ isActive: 1, displayName: 1 });

const timelineSchema = new mongoose.Schema({
  status: { type: String, enum: APPOINTMENT_STATUSES, required: true },
  at: { type: Date, default: Date.now },
  by: { type: String, trim: true, default: '' },
  note: { type: String, trim: true, maxlength: 500, default: '' }
}, { _id: false });

const appointmentSchema = new mongoose.Schema({
  refNo: { type: String, required: true, unique: true, trim: true },
  date: { type: String, match: DATE, required: true },
  startTime: { type: String, match: TIME, required: true },
  endTime: { type: String, match: TIME, required: true },
  host: { type: ObjectId, ref: 'AppointmentHost', required: true },
  hostName: { type: String, trim: true, default: '' },
  // Set only while the appointment holds its slot; the unique index blocks double booking.
  slotKey: { type: String, default: undefined },
  mode: { type: String, enum: APPOINTMENT_MODES, default: 'in_person' },
  location: { type: String, trim: true, maxlength: 120, default: '' },
  visitorType: { type: String, enum: VISITOR_TYPES, required: true },
  visitor: {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 20, default: '' },
    email: { type: String, trim: true, lowercase: true, maxlength: 200, default: '' },
    relation: { type: String, trim: true, maxlength: 60, default: '' },
    organisation: { type: String, trim: true, maxlength: 120, default: '' },
    count: { type: Number, min: 1, max: 20, default: 1 }
  },
  student: { type: ObjectId, ref: 'Student', default: null },
  studentSnapshot: {
    name: { type: String, trim: true, default: '' },
    rollNumber: { type: String, trim: true, default: '' },
    className: { type: String, trim: true, default: '' },
    section: { type: String, trim: true, default: '' }
  },
  staff: { type: ObjectId, ref: 'Teacher', default: null },
  purpose: { type: String, trim: true, maxlength: 80, default: DEFAULT_PURPOSES[DEFAULT_PURPOSES.length - 1] },
  agenda: { type: String, trim: true, maxlength: 1000, default: '' },
  status: { type: String, enum: APPOINTMENT_STATUSES, required: true },
  source: { type: String, enum: APPOINTMENT_SOURCES, required: true },
  requestedBy: { type: ObjectId, ref: 'User', default: null },
  overrideTeaching: { type: Boolean, default: false },
  checkInAt: { type: Date, default: null },
  checkOutAt: { type: Date, default: null },
  outcomeNotes: { type: String, trim: true, maxlength: 4000, default: '' },
  cancelReason: { type: String, trim: true, maxlength: 500, default: '' },
  timeline: { type: [timelineSchema], default: [] },
  createdBy: { type: String, trim: true, default: '' }
}, { timestamps: true });
appointmentSchema.index({ date: 1, host: 1, startTime: 1 });
appointmentSchema.index({ status: 1, date: 1 });
appointmentSchema.index({ requestedBy: 1, date: -1 });
appointmentSchema.index({ slotKey: 1 }, { unique: true, sparse: true });

const settingsSchema = new mongoose.Schema({
  key: { type: String, default: 'default', unique: true },
  allowParentRequests: { type: Boolean, default: false },
  minNoticeHours: { type: Number, min: 0, max: 720, default: 24 },
  maxAdvanceDays: { type: Number, min: 1, max: 365, default: 30 },
  maxOpenRequestsPerParent: { type: Number, min: 1, max: 20, default: 3 },
  purposes: { type: [String], default: () => [...DEFAULT_PURPOSES] },
  emailNotifications: { type: Boolean, default: true },
  refSeq: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = {
  AppointmentHost: createContextModelProxy('AppointmentHost', hostSchema),
  Appointment: createContextModelProxy('Appointment', appointmentSchema),
  AppointmentSettings: createContextModelProxy('AppointmentSettings', settingsSchema)
};
