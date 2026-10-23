const mongoose = require('mongoose');
const createContextModelProxy = require('../tenancy/createContextModelProxy');
const { RULE_KINDS, HOLIDAY_CATEGORIES, CLOSURE_MODES } = require('../modules/clndr/constants');

/**
 * The school-day master: which days are working days, for whom.
 *
 * One rule per holiday, vacation, closure, half day, weekly off pattern or
 * working-day override. Rules are dated with 'YYYY-MM-DD' school days and are
 * not tied to an academic session (a session label is kept only as a tag), so
 * a holiday saved while viewing one session is still seen from another.
 * Read through modules/clndr/schoolDays.js, never directly by other modules.
 */
const DATE_KEY = [/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'];
const TIME = [/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM'];

const schoolDayRuleSchema = new mongoose.Schema({
  kind: { type: String, enum: [...RULE_KINDS], required: true },
  title: { type: String, trim: true, maxlength: 120, default: '' },
  startDate: { type: String, match: DATE_KEY, required: true },
  endDate: { type: String, match: DATE_KEY, required: true },
  // weekly_off only: the weekday (0 = Sunday) and, optionally, which of its weeks in the month (e.g. [2, 4]).
  weekly: {
    _id: false,
    weekday: { type: Number, min: 0, max: 6 },
    weeksOfMonth: { type: [Number], default: [] }
  },
  category: { type: String, enum: [...HOLIDAY_CATEGORIES], default: 'school' },
  // Whole school, or only some classes / class-sections (normalised with rbac/scope.js).
  appliesTo: {
    _id: false,
    scope: { type: String, enum: ['school', 'classes'], default: 'school' },
    classes: { type: [String], default: [] },
    sections: { type: [String], default: [] }
  },
  mode: { type: String, enum: [...CLOSURE_MODES], default: 'closed' },
  halfDayEndTime: { type: String, match: TIME, default: undefined },
  authority: { type: String, trim: true, maxlength: 120, default: '' },
  orderNo: { type: String, trim: true, maxlength: 80, default: '' },
  reason: { type: String, trim: true, maxlength: 500, default: '' },
  tentative: { type: Boolean, default: false },
  // The calendar event that announced this rule, if any.
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'CalendarEvent', default: null },
  academicSession: { type: String, trim: true, default: '' },
  status: { type: String, enum: ['active', 'cancelled'], default: 'active' },
  revision: { type: Number, default: 1 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true, collection: 'school_day_rules' });

schoolDayRuleSchema.pre('validate', function checkRule(next) {
  if (this.startDate && this.endDate && this.startDate > this.endDate) {
    this.invalidate('endDate', 'The end date must be on or after the start date');
  }
  if (this.kind === 'weekly_off' && !Number.isInteger(this.weekly?.weekday)) {
    this.invalidate('weekly.weekday', 'Choose the weekday that is off');
  }
  if (this.kind === 'half_day' && !this.halfDayEndTime) {
    this.invalidate('halfDayEndTime', 'Set when the half day ends');
  }
  next();
});

schoolDayRuleSchema.index({ status: 1, startDate: 1, endDate: 1 });
schoolDayRuleSchema.index({ kind: 1, status: 1 });

module.exports = createContextModelProxy('SchoolDayRule', schoolDayRuleSchema);
