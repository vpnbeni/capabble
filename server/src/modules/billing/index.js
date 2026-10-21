/**
 * Billing module (Capabble's own subscriptions, GST invoices and Razorpay payments).
 *
 * It keeps its data in a separate Postgres database (BILLING_DATABASE_URL) and is the only
 * code that reads or writes it. The rest of the server uses the functions exported here
 * and mounts the routers; nothing else imports from inside this folder.
 */
const { isConfigured, ping } = require('./db/client');
const { getEntitlement } = require('./services/entitlementService');
const subscriptions = require('./services/subscriptionService');
const accounts = require('./services/accountService');
const trialNotices = require('./services/trialNotices');
const { transaction } = require('./db/client');
const { tenantSummary } = require('./controllers/billingController');
const billingJob = require('./jobs/billingJob');
const { setStudentCounter } = require('./services/studentCount');

const schoolRouter = require('./routes/schoolRoutes');
const adminRouter = require('./routes/adminRoutes');
const webhookRouter = require('./routes/webhookRoutes');

const SYSTEM = { type: 'system', id: 'server' };

/**
 * A new school gets a billing account and an invite to choose its plan. It has no
 * subscription (and no trial) until it opts in. Safe to call again: the invite goes once.
 */
async function registerSchool(input, actor = SYSTEM) {
  const account = await transaction((tx) => accounts.ensureAccount(tx, actor, input));
  await trialNotices.trialInvite(account.id);
  return account;
}

/** Start a trial without a plan (platform admin override). Never restarts a trial. */
const onboardTrial = (input, actor = SYSTEM) => subscriptions.onboardTrial(actor, input);

/** Complimentary access for an existing school. */
const grandfather = (input, actor = SYSTEM) => subscriptions.grandfather(actor, input);

/** Ask schools on a pre-opt-in trial to choose a plan (npm run billing:invite-legacy-trials). */
const inviteLegacyTrials = (options) => trialNotices.inviteLegacyTrials(options);

/** Run the hourly billing job in this process (one instance does the work at a time). */
function startScheduler() {
  if (isConfigured()) billingJob.start();
}

module.exports = {
  isConfigured,
  ping,
  getEntitlement,
  tenantSummary,
  registerSchool,
  onboardTrial,
  grandfather,
  inviteLegacyTrials,
  setStudentCounter,
  startScheduler,
  stopScheduler: billingJob.stop,
  schoolRouter,
  adminRouter,
  webhookRouter
};
