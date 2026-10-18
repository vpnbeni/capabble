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
const { tenantSummary } = require('./controllers/billingController');
const billingJob = require('./jobs/billingJob');
const { setStudentCounter } = require('./services/studentCount');

const schoolRouter = require('./routes/schoolRoutes');
const adminRouter = require('./routes/adminRoutes');
const webhookRouter = require('./routes/webhookRoutes');

const SYSTEM = { type: 'system', id: 'server' };

/** Start a trial for a new school; calling it again never restarts the trial. */
const onboardTrial = (input, actor = SYSTEM) => subscriptions.onboardTrial(actor, input);

/** Complimentary access for an existing school. */
const grandfather = (input, actor = SYSTEM) => subscriptions.grandfather(actor, input);

/** Run the hourly billing job in this process (one instance does the work at a time). */
function startScheduler() {
  if (isConfigured()) billingJob.start();
}

module.exports = {
  isConfigured,
  ping,
  getEntitlement,
  tenantSummary,
  onboardTrial,
  grandfather,
  setStudentCounter,
  startScheduler,
  stopScheduler: billingJob.stop,
  schoolRouter,
  adminRouter,
  webhookRouter
};
