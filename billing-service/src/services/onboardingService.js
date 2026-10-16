const {
  BillingAccount,
  BillingPlan,
  BillingSubscription,
} = require('../models');
const {
  SUBSCRIPTION_STATES,
  COLLECTION_MODES,
} = require('../domain/constants');

const DEFAULT_MONTHLY_CODE = 'core_monthly';
const DEFAULT_YEARLY_CODE = 'core_yearly';

const parseIntEnv = (name, fallback) => {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

const addDays = (date, days) => {
  const copy = new Date(date.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
};

async function ensureDefaultPlans() {
  const currency = (process.env.BILLING_DEFAULT_CURRENCY || 'INR').toUpperCase();
  const trialDays = parseIntEnv('BILLING_TRIAL_DAYS', 14);

  const defaults = [
    {
      code: DEFAULT_MONTHLY_CODE,
      name: 'Core Monthly',
      description: 'Core monthly flat subscription for Capabble tenant',
      billingCycle: 'monthly',
      amountMinor: 99900,
      currency,
      trialDays,
      features: ['core_ops', 'platform_support'],
    },
    {
      code: DEFAULT_YEARLY_CODE,
      name: 'Core Yearly',
      description: 'Core yearly flat subscription for Capabble tenant',
      billingCycle: 'yearly',
      amountMinor: 999000,
      currency,
      trialDays,
      features: ['core_ops', 'platform_support'],
    },
  ];

  await Promise.all(defaults.map((plan) => BillingPlan.findOneAndUpdate(
    { code: plan.code },
    { $setOnInsert: plan },
    { upsert: true, new: true },
  )));
}

async function onboardTenantWithTrial({
  tenantId,
  tenantSlug,
  tenantName,
  billingEmail,
  planCode = DEFAULT_MONTHLY_CODE,
}) {
  const trialDays = parseIntEnv('BILLING_TRIAL_DAYS', 14);
  const now = new Date();

  const account = await BillingAccount.findOneAndUpdate(
    { tenantSlug },
    {
      $set: {
        tenantId: String(tenantId),
        tenantSlug,
        tenantName,
        billingEmail,
        status: 'active',
      },
      $setOnInsert: {
        legalName: tenantName,
      },
    },
    { upsert: true, new: true },
  );

  const plan = await BillingPlan.findOne({ code: planCode, isActive: true })
    || await BillingPlan.findOne({ code: DEFAULT_MONTHLY_CODE, isActive: true });

  if (!plan) {
    throw new Error('No active billing plan configured');
  }

  const subscription = await BillingSubscription.findOneAndUpdate(
    { tenantSlug },
    {
      $set: {
        accountId: account._id,
        planCode: plan.code,
        state: SUBSCRIPTION_STATES.TRIALING_CORE,
        trialStartAt: now,
        trialEndAt: addDays(now, trialDays),
        graceEndsAt: null,
        grandfatherEndsAt: null,
        collectionMode: COLLECTION_MODES.HYBRID,
      },
      $setOnInsert: {
        provider: 'razorpay',
      },
    },
    { upsert: true, new: true },
  );

  return {
    account,
    subscription,
  };
}

async function grandfatherTenant({
  tenantId,
  tenantSlug,
  tenantName,
  billingEmail,
  days,
}) {
  const now = new Date();
  const grandfatherDays = Number.isFinite(days)
    ? days
    : parseIntEnv('BILLING_GRANDFATHER_DAYS', 60);

  const account = await BillingAccount.findOneAndUpdate(
    { tenantSlug },
    {
      $set: {
        tenantId: String(tenantId),
        tenantSlug,
        tenantName,
        billingEmail,
        status: 'active',
      },
      $setOnInsert: {
        legalName: tenantName,
      },
    },
    { upsert: true, new: true },
  );

  const subscription = await BillingSubscription.findOneAndUpdate(
    { tenantSlug },
    {
      $set: {
        accountId: account._id,
        state: SUBSCRIPTION_STATES.GRANDFATHERED,
        grandfatherEndsAt: addDays(now, grandfatherDays),
        trialStartAt: null,
        trialEndAt: null,
      },
      $setOnInsert: {
        planCode: DEFAULT_MONTHLY_CODE,
        provider: 'razorpay',
        collectionMode: COLLECTION_MODES.HYBRID,
      },
    },
    { upsert: true, new: true },
  );

  return {
    account,
    subscription,
  };
}

module.exports = {
  DEFAULT_MONTHLY_CODE,
  DEFAULT_YEARLY_CODE,
  ensureDefaultPlans,
  onboardTenantWithTrial,
  grandfatherTenant,
};
