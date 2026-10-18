// Billing data model (Postgres schema `billing`). Money is always integer paise.
const { sql } = require('drizzle-orm');
const {
  pgSchema,
  text,
  integer,
  bigint,
  bigserial,
  boolean,
  timestamp,
  date,
  jsonb,
  uuid,
  char,
  primaryKey,
  uniqueIndex,
  index,
  check
} = require('drizzle-orm/pg-core');

const billing = pgSchema('billing');

const paise = (name) => bigint(name, { mode: 'number' });
const ts = (name) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => ts('created_at').notNull().defaultNow();
const updatedAt = () => ts('updated_at').notNull().defaultNow();

const subscriptionState = billing.enum('subscription_state', [
  'trialing',
  'active',
  'past_due_grace',
  'suspended_read_only',
  'grandfathered',
  'canceled'
]);
const billingInterval = billing.enum('billing_interval', ['month', 'year']);
const collectionMode = billing.enum('collection_mode', ['auto_debit', 'manual_link', 'hybrid_auto_manual']);
const invoiceStatus = billing.enum('invoice_status', ['draft', 'open', 'paid', 'void', 'uncollectible']);
const paymentStatus = billing.enum('payment_status', ['initiated', 'captured', 'failed', 'refunded']);
const webhookStatus = billing.enum('webhook_status', ['received', 'processed', 'ignored', 'failed']);
const addonCycle = billing.enum('addon_cycle', ['month', 'year', 'one_time']);
const couponDuration = billing.enum('coupon_duration', ['once', 'forever', 'repeating']);
const actorType = billing.enum('actor_type', ['platform_admin', 'school_user', 'system', 'provider']);

/* ---------------------------------------------------------------- catalog */

const modules = billing.table('modules', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  isCore: boolean('is_core').notNull().default(false),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(100),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  check('modules_code_format', sql`${t.code} ~ '^[a-z][a-z0-9_]{1,31}$'`)
]);

// A price row is immutable once used. Changing a price closes the open row and adds a new one.
const modulePrices = billing.table('module_prices', {
  id: uuid('id').primaryKey().defaultRandom(),
  moduleCode: text('module_code').notNull().references(() => modules.code),
  interval: billingInterval('interval').notNull(),
  basePaise: paise('base_paise').notNull(),
  includedStudents: integer('included_students').notNull().default(500),
  perStudentPaise: paise('per_student_paise').notNull().default(0),
  effectiveFrom: ts('effective_from').notNull().defaultNow(),
  effectiveTo: ts('effective_to'),
  createdAt: createdAt()
}, (t) => [
  uniqueIndex('module_prices_module_interval_from_uq').on(t.moduleCode, t.interval, t.effectiveFrom),
  check('module_prices_base_nonneg', sql`${t.basePaise} >= 0`),
  check('module_prices_per_student_nonneg', sql`${t.perStudentPaise} >= 0`),
  check('module_prices_included_nonneg', sql`${t.includedStudents} >= 0`),
  check('module_prices_range', sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} > ${t.effectiveFrom}`)
]);

const bundles = billing.table('bundles', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  discountBps: integer('discount_bps').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  check('bundles_discount_range', sql`${t.discountBps} BETWEEN 0 AND 10000`)
]);

const bundleModules = billing.table('bundle_modules', {
  bundleCode: text('bundle_code').notNull().references(() => bundles.code, { onDelete: 'cascade' }),
  moduleCode: text('module_code').notNull().references(() => modules.code)
}, (t) => [primaryKey({ columns: [t.bundleCode, t.moduleCode] })]);

const addons = billing.table('addons', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  amountPaise: paise('amount_paise').notNull(),
  cycle: addonCycle('cycle').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [check('addons_amount_nonneg', sql`${t.amountPaise} >= 0`)]);

const coupons = billing.table('coupons', {
  code: text('code').primaryKey(),
  description: text('description').notNull().default(''),
  percentBps: integer('percent_bps'),
  fixedPaise: paise('fixed_paise'),
  duration: couponDuration('duration').notNull().default('once'),
  durationCycles: integer('duration_cycles'),
  maxRedemptions: integer('max_redemptions'),
  redeemedCount: integer('redeemed_count').notNull().default(0),
  moduleCodes: text('module_codes').array(),
  expiresAt: ts('expires_at'),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  check('coupons_code_upper', sql`${t.code} = upper(${t.code}) AND ${t.code} ~ '^[A-Z0-9_-]{3,32}$'`),
  check('coupons_one_discount', sql`(${t.percentBps} IS NULL) <> (${t.fixedPaise} IS NULL)`),
  check('coupons_percent_range', sql`${t.percentBps} IS NULL OR ${t.percentBps} BETWEEN 1 AND 10000`),
  check('coupons_fixed_positive', sql`${t.fixedPaise} IS NULL OR ${t.fixedPaise} > 0`),
  check('coupons_repeating_cycles', sql`${t.duration} <> 'repeating' OR ${t.durationCycles} > 0`),
  check('coupons_redemptions', sql`${t.maxRedemptions} IS NULL OR ${t.redeemedCount} <= ${t.maxRedemptions}`)
]);

/* ------------------------------------------------- customers & subscriptions */

const accounts = billing.table('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: text('tenant_id').notNull(),
  tenantSlug: text('tenant_slug').notNull(),
  tenantName: text('tenant_name').notNull(),
  billingEmail: text('billing_email').notNull(),
  legalName: text('legal_name').notNull().default(''),
  gstin: text('gstin'),
  addressLine1: text('address_line1').notNull().default(''),
  addressLine2: text('address_line2').notNull().default(''),
  city: text('city').notNull().default(''),
  postalCode: text('postal_code').notNull().default(''),
  stateCode: char('state_code', { length: 2 }),
  country: char('country', { length: 2 }).notNull().default('IN'),
  providerCustomerId: text('provider_customer_id'),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  uniqueIndex('accounts_tenant_id_uq').on(t.tenantId),
  uniqueIndex('accounts_tenant_slug_uq').on(t.tenantSlug),
  check('accounts_slug_lower', sql`${t.tenantSlug} = lower(${t.tenantSlug})`),
  check('accounts_gstin_format', sql`${t.gstin} IS NULL OR ${t.gstin} ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'`),
  check('accounts_state_code', sql`${t.stateCode} IS NULL OR ${t.stateCode} ~ '^[0-9]{2}$'`)
]);

const subscriptions = billing.table('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  state: subscriptionState('state').notNull(),
  interval: billingInterval('interval').notNull().default('year'),
  bundleCode: text('bundle_code').references(() => bundles.code),
  couponCode: text('coupon_code').references(() => coupons.code),
  couponCyclesUsed: integer('coupon_cycles_used').notNull().default(0),
  declaredStudents: integer('declared_students').notNull().default(0),
  billedStudents: integer('billed_students').notNull().default(0),
  collectionMode: collectionMode('collection_mode').notNull().default('manual_link'),
  provider: text('provider').notNull().default('razorpay'),
  providerSubscriptionId: text('provider_subscription_id'),
  trialEndsAt: ts('trial_ends_at'),
  currentPeriodStart: ts('current_period_start'),
  currentPeriodEnd: ts('current_period_end'),
  graceEndsAt: ts('grace_ends_at'),
  grandfatherEndsAt: ts('grandfather_ends_at'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  canceledAt: ts('canceled_at'),
  version: integer('version').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  uniqueIndex('subscriptions_one_live_per_account_uq').on(t.accountId).where(sql`${t.state} <> 'canceled'`),
  uniqueIndex('subscriptions_provider_sub_uq').on(t.providerSubscriptionId),
  index('subscriptions_state_idx').on(t.state),
  check('subscriptions_students_nonneg', sql`${t.declaredStudents} >= 0 AND ${t.billedStudents} >= 0`),
  check('subscriptions_period', sql`${t.currentPeriodEnd} IS NULL OR ${t.currentPeriodStart} IS NULL OR ${t.currentPeriodEnd} > ${t.currentPeriodStart}`)
]);

const subscriptionItems = billing.table('subscription_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriptionId: uuid('subscription_id').notNull().references(() => subscriptions.id, { onDelete: 'cascade' }),
  moduleCode: text('module_code').notNull().references(() => modules.code),
  priceId: uuid('price_id').references(() => modulePrices.id),
  startedAt: ts('started_at').notNull().defaultNow(),
  endedAt: ts('ended_at'),
  // Set when a removal is scheduled for the end of the paid period.
  endsAtPeriodEnd: boolean('ends_at_period_end').notNull().default(false)
}, (t) => [
  uniqueIndex('subscription_items_live_uq').on(t.subscriptionId, t.moduleCode).where(sql`${t.endedAt} IS NULL`)
]);

const subscriptionAddons = billing.table('subscription_addons', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriptionId: uuid('subscription_id').notNull().references(() => subscriptions.id, { onDelete: 'cascade' }),
  addonCode: text('addon_code').notNull().references(() => addons.code),
  quantity: integer('quantity').notNull().default(1),
  startedAt: ts('started_at').notNull().defaultNow(),
  endedAt: ts('ended_at'),
  endsAtPeriodEnd: boolean('ends_at_period_end').notNull().default(false),
  // One-time add-ons are billed once, then marked here.
  billedAt: ts('billed_at')
}, (t) => [
  uniqueIndex('subscription_addons_live_uq').on(t.subscriptionId, t.addonCode).where(sql`${t.endedAt} IS NULL`),
  check('subscription_addons_qty', sql`${t.quantity} > 0`)
]);

const couponRedemptions = billing.table('coupon_redemptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  couponCode: text('coupon_code').notNull().references(() => coupons.code),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  subscriptionId: uuid('subscription_id').notNull().references(() => subscriptions.id),
  redeemedAt: ts('redeemed_at').notNull().defaultNow()
}, (t) => [uniqueIndex('coupon_redemptions_once_per_account_uq').on(t.couponCode, t.accountId)]);

/* --------------------------------------------------------- money documents */

const numberSequences = billing.table('number_sequences', {
  series: text('series').notNull(),
  financialYear: text('financial_year').notNull(),
  nextValue: integer('next_value').notNull().default(1)
}, (t) => [
  primaryKey({ columns: [t.series, t.financialYear] }),
  check('number_sequences_fy_format', sql`${t.financialYear} ~ '^[0-9]{4}-[0-9]{2}$'`)
]);

const invoices = billing.table('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  number: text('number'),
  financialYear: text('financial_year'),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  subscriptionId: uuid('subscription_id').references(() => subscriptions.id),
  reason: text('reason').notNull(), // subscription_create | renewal | change | manual
  status: invoiceStatus('status').notNull().default('open'),
  currency: char('currency', { length: 3 }).notNull().default('INR'),
  periodStart: ts('period_start'),
  periodEnd: ts('period_end'),
  issuedAt: ts('issued_at'),
  dueAt: ts('due_at'),
  paidAt: ts('paid_at'),
  voidedAt: ts('voided_at'),
  studentsBilled: integer('students_billed').notNull().default(0),
  bundleCode: text('bundle_code'),
  couponCode: text('coupon_code'),
  // Supplier and buyer are snapshotted so a later profile edit never changes an issued invoice.
  supplier: jsonb('supplier').notNull(),
  buyer: jsonb('buyer').notNull(),
  placeOfSupply: char('place_of_supply', { length: 2 }),
  subtotalPaise: paise('subtotal_paise').notNull(),
  discountPaise: paise('discount_paise').notNull().default(0),
  taxablePaise: paise('taxable_paise').notNull(),
  cgstPaise: paise('cgst_paise').notNull().default(0),
  sgstPaise: paise('sgst_paise').notNull().default(0),
  igstPaise: paise('igst_paise').notNull().default(0),
  totalPaise: paise('total_paise').notNull(),
  amountPaidPaise: paise('amount_paid_paise').notNull().default(0),
  amountCreditedPaise: paise('amount_credited_paise').notNull().default(0),
  paymentLinkId: text('payment_link_id'),
  paymentLinkUrl: text('payment_link_url'),
  notes: text('notes').notNull().default(''),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  uniqueIndex('invoices_number_uq').on(t.number),
  uniqueIndex('invoices_payment_link_uq').on(t.paymentLinkId),
  index('invoices_account_idx').on(t.accountId, t.createdAt),
  index('invoices_status_due_idx').on(t.status, t.dueAt),
  // One renewal invoice per subscription period.
  uniqueIndex('invoices_one_renewal_per_period_uq').on(t.subscriptionId, t.periodStart)
    .where(sql`${t.reason} = 'renewal' AND ${t.status} <> 'void'`),
  check('invoices_number_when_issued', sql`${t.status} = 'draft' OR ${t.number} IS NOT NULL`),
  check('invoices_amounts_nonneg', sql`${t.subtotalPaise} >= 0 AND ${t.discountPaise} >= 0 AND ${t.taxablePaise} >= 0 AND ${t.cgstPaise} >= 0 AND ${t.sgstPaise} >= 0 AND ${t.igstPaise} >= 0 AND ${t.totalPaise} >= 0`),
  check('invoices_taxable', sql`${t.taxablePaise} = ${t.subtotalPaise} - ${t.discountPaise}`),
  check('invoices_total', sql`${t.totalPaise} = ${t.taxablePaise} + ${t.cgstPaise} + ${t.sgstPaise} + ${t.igstPaise}`),
  check('invoices_igst_xor_split', sql`${t.igstPaise} = 0 OR (${t.cgstPaise} = 0 AND ${t.sgstPaise} = 0)`),
  check('invoices_settled_within_total', sql`${t.amountPaidPaise} >= 0 AND ${t.amountCreditedPaise} >= 0 AND ${t.amountCreditedPaise} <= ${t.totalPaise}`)
]);

const invoiceLines = billing.table('invoice_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  kind: text('kind').notNull(), // module | overage | addon | proration
  moduleCode: text('module_code'),
  addonCode: text('addon_code'),
  description: text('description').notNull(),
  hsnSac: text('hsn_sac').notNull(),
  quantity: integer('quantity').notNull().default(1),
  unitPaise: paise('unit_paise').notNull(),
  amountPaise: paise('amount_paise').notNull(),
  discountPaise: paise('discount_paise').notNull().default(0),
  taxablePaise: paise('taxable_paise').notNull(),
  taxRateBps: integer('tax_rate_bps').notNull(),
  cgstPaise: paise('cgst_paise').notNull().default(0),
  sgstPaise: paise('sgst_paise').notNull().default(0),
  igstPaise: paise('igst_paise').notNull().default(0)
}, (t) => [
  uniqueIndex('invoice_lines_position_uq').on(t.invoiceId, t.position),
  check('invoice_lines_taxable', sql`${t.taxablePaise} = ${t.amountPaise} - ${t.discountPaise} AND ${t.taxablePaise} >= 0`),
  check('invoice_lines_nonneg', sql`${t.amountPaise} >= 0 AND ${t.discountPaise} >= 0 AND ${t.unitPaise} >= 0 AND ${t.quantity} > 0`)
]);

const payments = billing.table('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  invoiceId: uuid('invoice_id').references(() => invoices.id),
  provider: text('provider').notNull(), // razorpay | offline
  providerPaymentId: text('provider_payment_id'),
  providerOrderId: text('provider_order_id'),
  method: text('method').notNull().default('unknown'),
  status: paymentStatus('status').notNull(),
  amountPaise: paise('amount_paise').notNull(),
  refundedPaise: paise('refunded_paise').notNull().default(0),
  reference: text('reference').notNull().default(''),
  failureReason: text('failure_reason').notNull().default(''),
  receiptNumber: text('receipt_number'),
  capturedAt: ts('captured_at'),
  recordedBy: text('recorded_by'),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  uniqueIndex('payments_provider_payment_uq').on(t.provider, t.providerPaymentId),
  uniqueIndex('payments_receipt_uq').on(t.receiptNumber),
  index('payments_invoice_idx').on(t.invoiceId),
  index('payments_account_idx').on(t.accountId, t.createdAt),
  check('payments_amount_positive', sql`${t.amountPaise} > 0`),
  check('payments_refund_within', sql`${t.refundedPaise} >= 0 AND ${t.refundedPaise} <= ${t.amountPaise}`),
  check('payments_receipt_when_captured', sql`${t.status} NOT IN ('captured','refunded') OR ${t.receiptNumber} IS NOT NULL`)
]);

const creditNotes = billing.table('credit_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  number: text('number').notNull(),
  financialYear: text('financial_year').notNull(),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  paymentId: uuid('payment_id').references(() => payments.id),
  reason: text('reason').notNull(),
  issuedAt: ts('issued_at').notNull().defaultNow(),
  taxablePaise: paise('taxable_paise').notNull(),
  cgstPaise: paise('cgst_paise').notNull().default(0),
  sgstPaise: paise('sgst_paise').notNull().default(0),
  igstPaise: paise('igst_paise').notNull().default(0),
  totalPaise: paise('total_paise').notNull(),
  refundPaise: paise('refund_paise').notNull().default(0),
  providerRefundId: text('provider_refund_id'),
  refundStatus: text('refund_status').notNull().default('none'), // none | pending | processed | failed
  createdBy: text('created_by'),
  createdAt: createdAt()
}, (t) => [
  uniqueIndex('credit_notes_number_uq').on(t.number),
  uniqueIndex('credit_notes_refund_uq').on(t.providerRefundId),
  check('credit_notes_total', sql`${t.totalPaise} = ${t.taxablePaise} + ${t.cgstPaise} + ${t.sgstPaise} + ${t.igstPaise} AND ${t.totalPaise} > 0`),
  check('credit_notes_refund_within', sql`${t.refundPaise} >= 0 AND ${t.refundPaise} <= ${t.totalPaise}`)
]);

/* --------------------------------------------------------------- operations */

const webhookEvents = billing.table('webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: text('provider').notNull(),
  eventId: text('event_id').notNull(),
  eventType: text('event_type').notNull(),
  payload: jsonb('payload').notNull(),
  status: webhookStatus('status').notNull().default('received'),
  attempts: integer('attempts').notNull().default(0),
  error: text('error').notNull().default(''),
  receivedAt: ts('received_at').notNull().defaultNow(),
  processedAt: ts('processed_at')
}, (t) => [uniqueIndex('webhook_events_provider_event_uq').on(t.provider, t.eventId)]);

const auditLog = billing.table('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  occurredAt: ts('occurred_at').notNull().defaultNow(),
  actorType: actorType('actor_type').notNull(),
  actorId: text('actor_id').notNull().default(''),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  accountId: uuid('account_id'),
  action: text('action').notNull(),
  before: jsonb('before'),
  after: jsonb('after'),
  requestId: text('request_id').notNull().default('')
}, (t) => [
  index('audit_log_entity_idx').on(t.entityType, t.entityId, t.occurredAt),
  index('audit_log_account_idx').on(t.accountId, t.occurredAt)
]);

const notifications = billing.table('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  kind: text('kind').notNull(),
  // Invoice or subscription the reminder is about.
  subjectId: uuid('subject_id').notNull(),
  dueOn: date('due_on', { mode: 'string' }).notNull(),
  recipient: text('recipient').notNull(),
  status: text('status').notNull().default('sent'), // sent | failed | skipped
  error: text('error').notNull().default(''),
  sentAt: ts('sent_at').notNull().defaultNow()
}, (t) => [uniqueIndex('notifications_once_uq').on(t.accountId, t.kind, t.subjectId, t.dueOn)]);

// A lease instead of an advisory lock: it works through Neon's transaction-mode pooler.
const jobLeases = billing.table('job_leases', {
  name: text('name').primaryKey(),
  holder: text('holder').notNull().default(''),
  lockedUntil: ts('locked_until').notNull().defaultNow(),
  lastRunAt: ts('last_run_at'),
  lastResult: jsonb('last_result')
});

module.exports = {
  billing,
  jobLeases,
  subscriptionState,
  billingInterval,
  collectionMode,
  invoiceStatus,
  paymentStatus,
  webhookStatus,
  addonCycle,
  couponDuration,
  actorType,
  modules,
  modulePrices,
  bundles,
  bundleModules,
  addons,
  coupons,
  accounts,
  subscriptions,
  subscriptionItems,
  subscriptionAddons,
  couponRedemptions,
  numberSequences,
  invoices,
  invoiceLines,
  payments,
  creditNotes,
  webhookEvents,
  auditLog,
  notifications
};
