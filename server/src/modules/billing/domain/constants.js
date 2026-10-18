const SUBSCRIPTION_STATES = {
  TRIALING: 'trialing',
  ACTIVE: 'active',
  PAST_DUE_GRACE: 'past_due_grace',
  SUSPENDED_READ_ONLY: 'suspended_read_only',
  GRANDFATHERED: 'grandfathered',
  CANCELED: 'canceled'
};

// Older callers may still send or store the v1 trial state name.
const LEGACY_STATE_ALIASES = {
  trialing_core: SUBSCRIPTION_STATES.TRIALING
};

const ACCESS_MODES = {
  FULL: 'full',
  CORE_ONLY: 'core_only',
  READ_ONLY: 'read_only'
};

const COLLECTION_MODES = {
  AUTO_DEBIT: 'auto_debit',
  MANUAL_LINK: 'manual_link',
  HYBRID: 'hybrid_auto_manual'
};

const INTERVALS = {
  MONTH: 'month',
  YEAR: 'year'
};

const PROVIDERS = {
  RAZORPAY: 'razorpay',
  OFFLINE: 'offline'
};

const INVOICE_STATUSES = {
  DRAFT: 'draft',
  OPEN: 'open',
  PAID: 'paid',
  VOID: 'void',
  UNCOLLECTIBLE: 'uncollectible'
};

const PAYMENT_STATUSES = {
  INITIATED: 'initiated',
  CAPTURED: 'captured',
  FAILED: 'failed',
  REFUNDED: 'refunded'
};

const PAYMENT_METHODS = [
  'upi',
  'card',
  'netbanking',
  'wallet',
  'emi',
  'offline_bank',
  'offline_cheque',
  'offline_cash',
  'unknown'
];

const WEBHOOK_STATES = {
  RECEIVED: 'received',
  PROCESSED: 'processed',
  IGNORED: 'ignored',
  FAILED: 'failed'
};

const NUMBER_SERIES = {
  INVOICE: 'INV',
  CREDIT_NOTE: 'CN',
  RECEIPT: 'RCPT'
};

const ACTOR_TYPES = ['platform_admin', 'school_user', 'system', 'provider'];

// Module codes the core kernel covers. Core is always included and never billed.
const CORE_MODULE_CODE = 'core';

// Screens a core_only tenant can still use (kept for the server's core_only mode).
const CORE_ALLOWED_MODULES = ['dashboard', 'billing', 'auth'];

module.exports = {
  SUBSCRIPTION_STATES,
  LEGACY_STATE_ALIASES,
  ACCESS_MODES,
  COLLECTION_MODES,
  INTERVALS,
  PROVIDERS,
  INVOICE_STATUSES,
  PAYMENT_STATUSES,
  PAYMENT_METHODS,
  WEBHOOK_STATES,
  NUMBER_SERIES,
  ACTOR_TYPES,
  CORE_MODULE_CODE,
  CORE_ALLOWED_MODULES
};
