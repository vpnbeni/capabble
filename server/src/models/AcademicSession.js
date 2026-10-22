const mongoose = require('mongoose');
const createContextModelProxy = require('../tenancy/createContextModelProxy');
const schoolDate = require('../utils/schoolDate');

const DATE_KEY = [/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'];

const academicSessionSchema = new mongoose.Schema({
  label: {
    type: String,
    required: [true, 'Session label is required'],
    trim: true,
    match: [/^\d{4}-\d{4}$/, 'Session label must be in format YYYY-YYYY (e.g., 2025-2026)'],
    unique: true
  },
  startYear: {
    type: Number,
    required: [true, 'Start year is required']
  },
  endYear: {
    type: Number,
    required: [true, 'End year is required']
  },
  // First and last school day ('YYYY-MM-DD'). Filled from the label (1 April to 31 March) when not set.
  startDate: { type: String, trim: true, match: DATE_KEY },
  endDate: { type: String, trim: true, match: DATE_KEY },
  isCurrent: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['active', 'archived'],
    default: 'active'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

academicSessionSchema.pre('validate', function fillDates(next) {
  const dates = schoolDate.sessionDates(this.label);
  if (dates) {
    if (!this.startDate) this.startDate = dates.startDate;
    if (!this.endDate) this.endDate = dates.endDate;
  }
  if (this.startDate && this.endDate && this.startDate > this.endDate) {
    this.invalidate('endDate', 'The session must end after it starts');
  }
  next();
});

// Indexes
academicSessionSchema.index({ label: 1 }, { unique: true });
academicSessionSchema.index({ isCurrent: 1 });
academicSessionSchema.index({ status: 1 });
academicSessionSchema.index({ startYear: -1 });

/**
 * Derive the academic session label from a given date, using the school day in
 * India time (the session runs April to March).
 */
academicSessionSchema.statics.labelFromDate = function (dateValue) {
  return schoolDate.sessionLabelFor(schoolDate.dateKey(dateValue || new Date()));
};

/**
 * First and last school day of a session document or label. Sessions saved
 * before these fields existed fall back to 1 April to 31 March.
 */
academicSessionSchema.statics.datesFor = function (sessionOrLabel) {
  const label = typeof sessionOrLabel === 'string' ? sessionOrLabel : sessionOrLabel?.label;
  const fallback = schoolDate.sessionDates(label);
  if (!fallback) return null;
  return {
    startDate: (typeof sessionOrLabel === 'object' && sessionOrLabel?.startDate) || fallback.startDate,
    endDate: (typeof sessionOrLabel === 'object' && sessionOrLabel?.endDate) || fallback.endDate
  };
};

/**
 * Return current session label based on today's date.
 */
academicSessionSchema.statics.currentLabel = function () {
  return this.labelFromDate(new Date());
};

/**
 * Ensure a session document exists for the given label; create if missing.
 * Returns the session document.
 */
academicSessionSchema.statics.ensureSession = async function (label, createdBy) {
  const match = label.match(/^(\d{4})-(\d{4})$/);
  if (!match) throw new Error(`Invalid session label: ${label}`);

  const startYear = Number(match[1]);
  const endYear = Number(match[2]);

  let session = await this.findOne({ label });
  if (!session) {
    session = await this.create({
      label,
      startYear,
      endYear,
      isCurrent: false,
      createdBy
    });
  }
  return session;
};

/**
 * Generate available sessions from current academic year onward.
 * Default horizon ends at session ending year 2030 (i.e., 2029-2030).
 * You can override via ACADEMIC_SESSION_LAST_END_YEAR.
 */
academicSessionSchema.statics.generateAvailableSessions = function () {
  const currentStartYear = Number(this.currentLabel().slice(0, 4));
  const configuredLastEndYear = Number.parseInt(process.env.ACADEMIC_SESSION_LAST_END_YEAR || '2030', 10);
  const lastEndYear = Number.isFinite(configuredLastEndYear) && configuredLastEndYear >= currentStartYear + 1
    ? configuredLastEndYear
    : currentStartYear + 1;
  const lastStartYear = lastEndYear - 1;

  const sessions = [];
  for (let sy = currentStartYear; sy <= lastStartYear; sy++) {
    sessions.push({
      label: `${sy}-${sy + 1}`,
      startYear: sy,
      endYear: sy + 1,
      ...schoolDate.sessionDates(`${sy}-${sy + 1}`),
      isCurrent: sy === currentStartYear
    });
  }
  return sessions;
};

module.exports = createContextModelProxy('AcademicSession', academicSessionSchema);
