/**
 * Plan and billing emails also land in the school administrators' bell. Called by
 * billing's sendOnce (every billing email goes through it), so nothing else changes
 * there. Billing accounts live in Postgres and know only the tenant slug, so the
 * slug is resolved to the tenant database through the platform Tenant record.
 */
const { getPlatformModels } = require('../tenancy/platformModels');
const { send, modelsFor } = require('./send');
const { administrators } = require('./recipients');

const TONES = {
  trial_ending: 'warning',
  grace_ending: 'warning',
  grandfather_ending: 'warning',
  due_soon: 'warning',
  overdue: 'danger',
  suspended: 'danger',
  trial_charge_failed: 'danger',
  payment_received: 'success',
  trial_converted: 'success'
};

const notifyBillingAdmins = async ({ tenantSlug, kind, subjectId, dueOn, title }) => {
  if (!tenantSlug || !title) return 0;
  const tenant = await getPlatformModels().Tenant.findOne({ slug: tenantSlug }).select('slug dbName').lean();
  if (!tenant?.dbName) return 0;
  const ref = { dbName: tenant.dbName, slug: tenant.slug, id: String(tenant._id) };
  const admins = await administrators(modelsFor(ref));
  return send(ref, admins, 'billing.notice', {
    key: `${kind}:${subjectId || ''}:${dueOn || ''}`,
    title,
    tone: TONES[kind] || 'info'
  });
};

const notifyBillingAdminsSafely = (facts) => notifyBillingAdmins(facts).catch((error) => {
  console.error(`[notifications] billing ${facts?.kind} not posted: ${error.message}`);
  return 0;
});

module.exports = { notifyBillingAdmins, notifyBillingAdminsSafely };
