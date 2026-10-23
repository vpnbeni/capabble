const mongoose = require('mongoose');
const createContextModelProxy = require('../tenancy/createContextModelProxy');

/**
 * One person's reply to a calendar event audience that asked for one:
 * acknowledge ("seen it"), RSVP (yes / no / maybe, with how many coming) or
 * consent per child (given / declined). Parents answer per child; everyone
 * else answers for themselves. The latest answer wins (one row per person,
 * audience and child), and every change is kept in `history` for the record.
 */
const { RESPONSE_VALUES } = require('../modules/clndr/constants');

const ObjectId = mongoose.Schema.Types.ObjectId;

const calendarResponseSchema = new mongoose.Schema({
  eventId: { type: ObjectId, ref: 'CalendarEvent', required: true },
  segmentKey: { type: String, required: true, trim: true, maxlength: 40 },
  type: { type: String, enum: ['acknowledge', 'rsvp', 'consent'], required: true },
  userId: { type: ObjectId, ref: 'User', required: true },
  userName: { type: String, trim: true, maxlength: 120, default: '' },
  // For a parent answering for one child; empty for answers about oneself.
  studentId: { type: String, trim: true, maxlength: 40, default: '' },
  studentName: { type: String, trim: true, maxlength: 120, default: '' },
  value: { type: String, enum: [...RESPONSE_VALUES], required: true },
  count: { type: Number, min: 0, max: 20, default: undefined },
  note: { type: String, trim: true, maxlength: 500, default: '' },
  respondedAt: { type: Date, default: Date.now },
  history: {
    type: [{ _id: false, value: String, count: Number, note: String, at: Date }],
    default: []
  }
}, { timestamps: true, collection: 'calendar_responses' });

calendarResponseSchema.index({ eventId: 1, segmentKey: 1, userId: 1, studentId: 1 }, { unique: true });
calendarResponseSchema.index({ eventId: 1, value: 1 });
calendarResponseSchema.index({ userId: 1, eventId: 1 });

module.exports = createContextModelProxy('CalendarResponse', calendarResponseSchema);
