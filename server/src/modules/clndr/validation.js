const Joi = require('joi');
const {
  RULE_KINDS, HOLIDAY_CATEGORIES, CLOSURE_MODES, EVENT_CATEGORIES, VISIBILITY, PERSON_TYPES, EVENT_ROLES,
  NOTIFY_LEVELS, REMINDER_PRESETS, RESPONSE_TYPES, RECURRENCE_FREQS
} = require('./constants');

const dateKey = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/)
  .messages({ 'string.pattern.base': '{#label} must be YYYY-MM-DD' });
const time = Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/)
  .messages({ 'string.pattern.base': '{#label} must be HH:MM' });

const scope = Joi.object({
  type: Joi.string().max(20).required(),
  value: Joi.string().allow('').max(80).default(''),
  label: Joi.string().allow('').max(120).default('')
});

const attachment = Joi.object({
  name: Joi.string().max(160).required(),
  url: Joi.string().uri({ scheme: ['https', 'http'] }).max(500).required()
});

const segment = Joi.object({
  key: Joi.string().max(40),
  label: Joi.string().allow('').max(80).default(''),
  personType: Joi.string().valid(...PERSON_TYPES).required(),
  scopes: Joi.array().items(scope).min(1).max(50).required(),
  exclude: Joi.array().items(scope).max(50).default([]),
  role: Joi.string().valid(...EVENT_ROLES).default('attendee'),
  instructions: Joi.string().allow('').max(4000).default(''),
  attachments: Joi.array().items(attachment).max(10).default([]),
  notify: Joi.string().valid(...NOTIFY_LEVELS).default('now'),
  email: Joi.boolean().default(false),
  reminders: Joi.array().items(Joi.string().valid(...Object.keys(REMINDER_PRESETS))).max(4).default([]),
  response: Joi.string().valid(...RESPONSE_TYPES).default('none'),
  responseDeadline: dateKey.allow(null, '')
});

const recurrence = Joi.object({
  freq: Joi.string().valid(...RECURRENCE_FREQS).allow(null),
  interval: Joi.number().integer().min(1).max(12).default(1),
  byDay: Joi.array().items(Joi.number().integer().min(0).max(6)).max(7).default([]),
  until: dateKey.allow(null, ''),
  exDates: Joi.array().items(dateKey).max(200).default([]),
  skipNonWorking: Joi.boolean().default(true)
});

const eventFields = {
  title: Joi.string().trim().max(160),
  description: Joi.string().allow('').max(4000),
  category: Joi.string().valid(...EVENT_CATEGORIES),
  allDay: Joi.boolean(),
  startDate: dateKey,
  endDate: dateKey.allow(null, ''),
  startTime: time.allow(null, ''),
  endTime: time.allow(null, ''),
  venue: Joi.string().allow('').max(160),
  recurrence: recurrence.allow(null),
  visibility: Joi.string().valid(...VISIBILITY),
  critical: Joi.boolean(),
  circularNo: Joi.string().allow('').max(60),
  attachments: Joi.array().items(attachment).max(10),
  segments: Joi.array().items(segment).max(20),
  publishAt: Joi.date().iso().allow(null, '')
};

const createEvent = Joi.object({
  ...eventFields,
  title: eventFields.title.required(),
  startDate: eventFields.startDate.required(),
  publish: Joi.boolean().default(false)
});

const updateEvent = Joi.object({
  ...eventFields,
  // Who hears about a change to a published event.
  notify: Joi.string().valid('affected', 'everyone', 'none').default('affected')
});

const publishEvent = Joi.object({ publishAt: Joi.date().iso().allow(null, '') });
const cancelEvent = Joi.object({
  reason: Joi.string().allow('').max(500).default(''),
  occurrence: dateKey.allow(null, ''),
  notify: Joi.boolean().default(true)
});
const rejectEvent = Joi.object({ note: Joi.string().allow('').max(500).default('') });
const respond = Joi.object({
  segmentKey: Joi.string().max(40).required(),
  studentId: Joi.string().max(40).allow('', null),
  value: Joi.string().valid('acknowledged', 'yes', 'no', 'maybe', 'given', 'declined').required(),
  count: Joi.number().integer().min(0).max(20),
  note: Joi.string().allow('').max(500).default('')
});
const previewAudience = Joi.object({ segments: Joi.array().items(segment).min(1).max(20).required() });

const ruleFields = {
  kind: Joi.string().valid(...RULE_KINDS),
  title: Joi.string().allow('').max(120),
  startDate: dateKey,
  endDate: dateKey,
  weekly: Joi.object({
    weekday: Joi.number().integer().min(0).max(6).required(),
    weeksOfMonth: Joi.array().items(Joi.number().integer().min(1).max(5)).max(5).default([])
  }).allow(null),
  category: Joi.string().valid(...HOLIDAY_CATEGORIES),
  appliesTo: Joi.object({
    scope: Joi.string().valid('school', 'classes').default('school'),
    classes: Joi.array().items(Joi.string().max(20)).max(30).default([]),
    sections: Joi.array().items(Joi.string().max(30)).max(200).default([])
  }),
  mode: Joi.string().valid(...CLOSURE_MODES),
  halfDayEndTime: time.allow(null, ''),
  authority: Joi.string().allow('').max(120),
  orderNo: Joi.string().allow('').max(80),
  reason: Joi.string().allow('').max(500),
  tentative: Joi.boolean()
};

const announce = Joi.object({
  families: Joi.boolean().default(true),
  staff: Joi.boolean().default(true),
  email: Joi.boolean().default(false),
  note: Joi.string().allow('').max(2000).default('')
});

const createRule = Joi.object({
  ...ruleFields,
  kind: ruleFields.kind.required(),
  startDate: ruleFields.startDate.required(),
  endDate: ruleFields.endDate,
  announce: announce.allow(null)
});
const updateRule = Joi.object({ ...ruleFields, announce: announce.allow(null) });
const bulkRules = Joi.object({ rules: Joi.array().items(createRule).min(1).max(200).required() });

module.exports = {
  createEvent,
  updateEvent,
  publishEvent,
  cancelEvent,
  rejectEvent,
  previewAudience,
  createRule,
  updateRule,
  bulkRules,
  respond
};
