// Emails every school that is on a trial it never opted in to (put on one before opt-in
// trials: state trialing, no trial_consent_at) and asks it to choose the modules it will
// keep. The school keeps its trial; the link goes to Billing. Each school is emailed once,
// however often this runs.
//
//   npm run billing:invite-legacy-trials               dry run: lists who would be emailed
//   npm run billing:invite-legacy-trials -- --apply    sends the emails
require('dotenv').config();

const billing = require('../../src/modules/billing');
const { closeDb } = require('../../src/modules/billing/db/client');

const LABELS = {
  would_send: 'would email',
  sent: 'sent',
  already_sent: 'skip  (already emailed)',
  trial_over: 'skip  (trial already ended)',
  no_email: 'skip  (no billing email)',
  duplicate: 'skip  (already emailed)',
  skipped: 'fail  (mail is not set up)',
  failed: 'failed'
};

async function run() {
  if (!billing.isConfigured()) {
    throw new Error('BILLING_DATABASE_URL is not configured.');
  }
  const apply = process.argv.includes('--apply');
  const host = new URL(process.env.BILLING_DATABASE_URL).host;
  const link = process.env.BILLING_APP_URL || '(default) https://school.capabble.cloud/#/billing';
  console.log(`[billing-legacy-trials] ${apply ? 'APPLY' : 'dry run'} · billing database: ${host}`);
  console.log(`[billing-legacy-trials] link: ${link}`);

  const results = await billing.inviteLegacyTrials({ apply });
  const counts = {};
  results.forEach((row) => {
    counts[row.status] = (counts[row.status] || 0) + 1;
    const label = LABELS[row.status] || row.status;
    console.log(`  ${label.padEnd(26)} ${row.tenantSlug} · ${row.to || '-'} · trial ends ${row.trialEndsOn || '-'}`);
  });

  const summary = Object.entries(counts).map(([status, n]) => `${status}=${n}`).join(' ') || 'none';
  console.log(`[billing-legacy-trials] ${results.length} schools on a trial without opt-in · ${summary}`);
  if (!apply && counts.would_send) console.log('[billing-legacy-trials] re-run with --apply to send');
  if (counts.failed || counts.skipped) process.exitCode = 1;
}

run()
  .catch((error) => {
    console.error('[billing-legacy-trials] fatal', error.cause?.message || error.message);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
