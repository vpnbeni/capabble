const Joi = require('joi');

const code = Joi.string().trim().lowercase().pattern(/^[a-z][a-z0-9_]{1,31}$/);
const couponCode = Joi.string().trim().uppercase().pattern(/^[A-Z0-9_-]{3,32}$/);
const paise = Joi.number().integer().min(0).max(1e13);
const interval = Joi.string().valid('month', 'year');

const tenantIdentity = Joi.object({
  tenantId: Joi.string().trim().max(120).required(),
  tenantSlug: Joi.string().trim().lowercase().max(120).required(),
  tenantName: Joi.string().trim().max(200).required(),
  billingEmail: Joi.string().trim().lowercase().email({ tlds: false }).allow('').default(''),
  declaredStudents: Joi.number().integer().min(0).max(1000000),
  trialDays: Joi.number().integer().min(1).max(365),
  days: Joi.number().integer().min(1).max(3650),
  planCode: Joi.any().strip()
});

const selection = Joi.object({
  modules: Joi.array().items(code).unique().max(50).default([]),
  bundleCode: code.allow(null, ''),
  interval: interval.default('year'),
  declaredStudents: Joi.number().integer().min(0).max(1000000),
  couponCode: couponCode.allow(null, ''),
  addons: Joi.array().items(Joi.object({ code: code.required(), quantity: Joi.number().integer().min(1).max(1000).default(1) })).max(20).default([]),
  collectionMode: Joi.string().valid('auto_debit', 'manual_link', 'hybrid_auto_manual'),
  reportedStudents: Joi.number().integer().min(0).max(1000000).allow(null)
});

// Opting in to a trial: the plan, and the school's agreement to the terms it was shown.
const trialStart = selection.keys({
  consent: Joi.boolean().valid(true).required().messages({ 'any.only': 'Agree to the trial terms to start your trial' })
});

const adminTrial = Joi.object({
  reason: Joi.string().trim().min(3).max(300).required(),
  days: Joi.number().integer().min(1).max(90)
});

const profile = Joi.object({
  billingEmail: Joi.string().trim().lowercase().email({ tlds: false }),
  legalName: Joi.string().trim().max(200).allow(''),
  gstin: Joi.string().trim().uppercase().max(15).allow('', null),
  addressLine1: Joi.string().trim().max(200).allow(''),
  addressLine2: Joi.string().trim().max(200).allow(''),
  city: Joi.string().trim().max(100).allow(''),
  postalCode: Joi.string().trim().pattern(/^[0-9]{6}$/).allow(''),
  stateCode: Joi.string().trim().pattern(/^[0-9]{1,2}$/).allow('', null),
  // v1 shape
  address: Joi.object({
    line1: Joi.string().allow(''),
    line2: Joi.string().allow(''),
    city: Joi.string().allow(''),
    postalCode: Joi.string().allow(''),
    state: Joi.any(),
    country: Joi.any()
  }),
  placeOfSupply: Joi.string().trim().allow('', null)
});

const moduleInput = Joi.object({
  code: code.required(),
  name: Joi.string().trim().max(120).required(),
  description: Joi.string().trim().max(500).allow(''),
  isCore: Joi.boolean(),
  active: Joi.boolean(),
  sortOrder: Joi.number().integer().min(0).max(10000)
});

const priceInput = Joi.object({
  interval: interval.required(),
  basePaise: paise.required(),
  includedStudents: Joi.number().integer().min(0).max(1000000).default(500),
  perStudentPaise: paise.default(0),
  effectiveFrom: Joi.date().iso()
});

const bundleInput = Joi.object({
  code: code.required(),
  name: Joi.string().trim().max(120).required(),
  description: Joi.string().trim().max(500).allow(''),
  discountBps: Joi.number().integer().min(0).max(10000).required(),
  moduleCodes: Joi.array().items(code).min(2).unique().required(),
  active: Joi.boolean()
});

const addonInput = Joi.object({
  code: code.required(),
  name: Joi.string().trim().max(120).required(),
  description: Joi.string().trim().max(500).allow(''),
  amountPaise: paise.required(),
  cycle: Joi.string().valid('month', 'year', 'one_time').required(),
  active: Joi.boolean()
});

const couponInput = Joi.object({
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

const extension = Joi.object({ days: Joi.number().integer().min(1).max(365).required() });

const offlinePayment = Joi.object({
  amountPaise: Joi.number().integer().min(1).max(1e13).required(),
  method: Joi.string().valid('offline_bank', 'offline_cheque', 'offline_cash', 'upi').required(),
  reference: Joi.string().trim().max(200).allow('').default(''),
  receivedAt: Joi.date().iso()
});

const creditNote = Joi.object({
  amountPaise: Joi.number().integer().min(1).max(1e13).required(),
  reason: Joi.string().trim().min(3).max(500).required(),
  refundPaise: Joi.number().integer().min(0).max(1e13).default(0)
});

const cancel = Joi.object({ immediately: Joi.boolean().default(false) });
const students = Joi.object({ declaredStudents: Joi.number().integer().min(0).max(1000000).required() });
const voidInput = Joi.object({ reason: Joi.string().trim().max(300).allow('').default('') });
const listQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
  search: Joi.string().trim().max(100).allow('').default('')
});
const auditQuery = Joi.object({
  accountId: Joi.string().guid(),
  entityType: Joi.string().max(60),
  entityId: Joi.string().max(120),
  limit: Joi.number().integer().min(1).max(500).default(100)
});

module.exports = {
  tenantIdentity,
  selection,
  trialStart,
  adminTrial,
  profile,
  moduleInput,
  priceInput,
  bundleInput,
  addonInput,
  couponInput,
  extension,
  offlinePayment,
  creditNote,
  cancel,
  students,
  voidInput,
  listQuery,
  auditQuery
};
