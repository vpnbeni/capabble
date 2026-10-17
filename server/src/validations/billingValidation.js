const Joi = require('joi');

const code = Joi.string().trim().lowercase().pattern(/^[a-z][a-z0-9_]{1,31}$/);
const couponCode = Joi.string().trim().uppercase().pattern(/^[A-Z0-9_-]{3,32}$/);
const paise = Joi.number().integer().min(0).max(1e13);

// What a school (or the platform admin for a school) picks.
const selectionSchema = Joi.object({
  modules: Joi.array().items(code).unique().max(50).default([]),
  bundleCode: code.allow(null, ''),
  interval: Joi.string().valid('month', 'year').default('year'),
  declaredStudents: Joi.number().integer().min(0).max(1000000),
  couponCode: couponCode.allow(null, ''),
  addons: Joi.array().items(Joi.object({
    code: code.required(),
    quantity: Joi.number().integer().min(1).max(1000).default(1)
  })).max(20).default([]),
  collectionMode: Joi.string().valid('auto_debit', 'manual_link', 'hybrid_auto_manual')
});

const billingProfileSchema = Joi.object({
  billingEmail: Joi.string().trim().lowercase().email({ tlds: false }),
  legalName: Joi.string().trim().max(200).allow(''),
  gstin: Joi.string().trim().uppercase().max(15).allow('', null),
  addressLine1: Joi.string().trim().max(200).allow(''),
  addressLine2: Joi.string().trim().max(200).allow(''),
  city: Joi.string().trim().max(100).allow(''),
  postalCode: Joi.string().trim().pattern(/^[0-9]{6}$/).allow('')
    .messages({ 'string.pattern.base': 'PIN code must be 6 digits' }),
  stateCode: Joi.string().trim().pattern(/^[0-9]{1,2}$/).allow('', null)
});

const cancelSchema = Joi.object({ immediately: Joi.boolean().default(false) });
const payNowSchema = Joi.object({ invoiceId: Joi.string().guid() });

const extensionSchema = Joi.object({ days: Joi.number().integer().min(1).max(365).required() });
const studentsSchema = Joi.object({ declaredStudents: Joi.number().integer().min(0).max(1000000).required() });
const offlinePaymentSchema = Joi.object({
  amountPaise: Joi.number().integer().min(1).max(1e13).required(),
  method: Joi.string().valid('offline_bank', 'offline_cheque', 'offline_cash', 'upi').required(),
  reference: Joi.string().trim().max(200).allow('').default(''),
  receivedAt: Joi.date().iso()
});
const creditNoteSchema = Joi.object({
  amountPaise: Joi.number().integer().min(1).max(1e13).required(),
  reason: Joi.string().trim().min(3).max(500).required(),
  refundPaise: Joi.number().integer().min(0).max(1e13).default(0)
});
const voidSchema = Joi.object({ reason: Joi.string().trim().max(300).allow('').default('') });

const moduleSchema = Joi.object({
  code: code.required(),
  name: Joi.string().trim().max(120).required(),
  description: Joi.string().trim().max(500).allow(''),
  isCore: Joi.boolean(),
  active: Joi.boolean(),
  sortOrder: Joi.number().integer().min(0).max(10000)
});
const priceSchema = Joi.object({
  interval: Joi.string().valid('month', 'year').required(),
  basePaise: paise.required(),
  includedStudents: Joi.number().integer().min(0).max(1000000).default(500),
  perStudentPaise: paise.default(0),
  effectiveFrom: Joi.date().iso()
});
const bundleSchema = Joi.object({
  code: code.required(),
  name: Joi.string().trim().max(120).required(),
  description: Joi.string().trim().max(500).allow(''),
  discountBps: Joi.number().integer().min(0).max(10000).required(),
  moduleCodes: Joi.array().items(code).min(2).unique().required(),
  active: Joi.boolean()
});
const addonSchema = Joi.object({
  code: code.required(),
  name: Joi.string().trim().max(120).required(),
  description: Joi.string().trim().max(500).allow(''),
  amountPaise: paise.required(),
  cycle: Joi.string().valid('month', 'year', 'one_time').required(),
  active: Joi.boolean()
});
const couponSchema = Joi.object({
  code: couponCode.required(),
  description: Joi.string().trim().max(500).allow(''),
  percentBps: Joi.number().integer().min(1).max(10000),
  fixedPaise: Joi.number().integer().min(1).max(1e13),
  duration: Joi.string().valid('once', 'forever', 'repeating').default('once'),
  durationCycles: Joi.number().integer().min(1).max(120).when('duration', { is: 'repeating', then: Joi.required() }),
  maxRedemptions: Joi.number().integer().min(1).allow(null),
  moduleCodes: Joi.array().items(code).unique(),
  expiresAt: Joi.date().iso().allow(null),
  active: Joi.boolean()
}).xor('percentBps', 'fixedPaise');

module.exports = {
  selectionSchema,
  billingProfileSchema,
  cancelSchema,
  payNowSchema,
  extensionSchema,
  studentsSchema,
  offlinePaymentSchema,
  creditNoteSchema,
  voidSchema,
  moduleSchema,
  priceSchema,
  bundleSchema,
  addonSchema,
  couponSchema
};
