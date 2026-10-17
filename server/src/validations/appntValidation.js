const Joi = require('joi');
const { VISITOR_TYPES, APPOINTMENT_MODES } = require('../modules/appnt/lifecycle');

const date = Joi.string().trim().pattern(/^\d{4}-\d{2}-\d{2}$/).required().messages({
  'string.pattern.base': 'Choose a date',
  'string.empty': 'Choose a date',
  'any.required': 'Choose a date'
});
const time = (label) => Joi.string().trim().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).messages({
  'string.pattern.base': `${label} must be a time like 10:30`,
  'string.empty': `Choose ${label.toLowerCase()}`,
  'any.required': `Choose ${label.toLowerCase()}`
});
const id = Joi.string().trim().hex().length(24).messages({ 'string.length': 'Choose from the list', 'string.hex': 'Choose from the list' });
const text = (max) => Joi.string().trim().allow('').max(max);
const phone = Joi.string().trim().allow('').pattern(/^[+\d][\d\s-]{6,18}$/).messages({ 'string.pattern.base': 'Enter a valid phone number' });
const email = Joi.string().trim().allow('').email({ tlds: { allow: false } }).messages({ 'string.email': 'Enter a valid email address' });

const visitor = Joi.object({
  name: Joi.string().trim().min(1).max(120).required().messages({ 'string.empty': 'Enter the visitor\'s name', 'any.required': 'Enter the visitor\'s name' }),
  phone,
  email,
  relation: text(60),
  organisation: text(120),
  count: Joi.number().integer().min(1).max(20).default(1)
}).required();

const bookingSchema = Joi.object({
  hostId: id.required().messages({ 'any.required': 'Choose who they are meeting' }),
  date,
  startTime: time('Start time').required(),
  visitorType: Joi.string().valid(...VISITOR_TYPES).required().messages({ 'any.only': 'Choose who is visiting', 'any.required': 'Choose who is visiting' }),
  visitor,
  studentId: id.allow('', null),
  staffId: id.allow('', null),
  purpose: Joi.string().trim().min(1).max(80).required().messages({ 'string.empty': 'Choose a purpose', 'any.required': 'Choose a purpose' }),
  agenda: text(1000),
  mode: Joi.string().valid(...APPOINTMENT_MODES).default('in_person'),
  location: text(120),
  overrideTeaching: Joi.boolean().default(false)
});

const walkInSchema = bookingSchema.keys({
  date: Joi.any().strip(),
  startTime: Joi.any().strip()
});

const rescheduleSchema = Joi.object({
  date,
  startTime: time('Start time').required(),
  overrideTeaching: Joi.boolean().default(false),
  note: text(500)
});

const actionSchema = Joi.object({ note: text(500) });

const notesSchema = Joi.object({ outcomeNotes: text(4000).required() });

const availabilityRow = Joi.object({
  day: Joi.number().integer().min(0).max(6).required(),
  start: time('Start time').required(),
  end: time('End time').required()
}).custom((row, helpers) => (row.end > row.start ? row : helpers.message('End time must be after the start time')));

const availabilitySchema = Joi.object({
  slotMinutes: Joi.number().integer().min(5).max(240),
  bufferMinutes: Joi.number().integer().min(0).max(120),
  maxPerDay: Joi.number().integer().min(0).max(100),
  weeklyAvailability: Joi.array().items(availabilityRow).max(28),
  blockedDates: Joi.array().items(Joi.object({ date, reason: text(200) })).max(366),
  location: text(120)
});

const hostSchema = availabilitySchema.keys({
  teacherId: id.allow('', null),
  userId: id.allow('', null),
  displayName: Joi.string().trim().min(1).max(120).messages({ 'string.empty': 'Enter a name' }),
  title: text(120),
  email,
  requiresApproval: Joi.boolean(),
  parentBookable: Joi.boolean(),
  parentVisibility: Joi.string().valid('all', 'linked'),
  isActive: Joi.boolean()
});

const settingsSchema = Joi.object({
  allowParentRequests: Joi.boolean(),
  minNoticeHours: Joi.number().integer().min(0).max(720),
  maxAdvanceDays: Joi.number().integer().min(1).max(365),
  maxOpenRequestsPerParent: Joi.number().integer().min(1).max(20),
  purposes: Joi.array().items(Joi.string().trim().min(1).max(80)).min(1).max(30).messages({ 'array.min': 'Keep at least one purpose' }),
  emailNotifications: Joi.boolean()
});

const portalRequestSchema = Joi.object({
  hostId: id.required().messages({ 'any.required': 'Choose who you want to meet' }),
  date,
  startTime: time('Time').required(),
  purpose: Joi.string().trim().min(1).max(80).required().messages({ 'string.empty': 'Choose a purpose', 'any.required': 'Choose a purpose' }),
  agenda: text(1000),
  mode: Joi.string().valid(...APPOINTMENT_MODES).default('in_person'),
  phone
});

module.exports = {
  bookingSchema,
  walkInSchema,
  rescheduleSchema,
  actionSchema,
  notesSchema,
  availabilitySchema,
  hostSchema,
  settingsSchema,
  portalRequestSchema
};
