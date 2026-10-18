// Gives every active school a billing account with complimentary access, so they keep
// working while they choose modules. Schools that already have a live subscription are
// left as they are.
//
//   npm run billing:grandfather                 dry run: lists what would change
//   npm run billing:grandfather -- --apply      writes to the billing database
//   npm run billing:grandfather -- --apply --days 30
//
// Run this against an environment before turning on BILLING_ENFORCEMENT_ENABLED there:
// a school with no billing account is treated as read-only.
require('dotenv').config();

const { connectPlatformDB } = require('../../src/config/platformDatabase');
const { getPlatformModels } = require('../../src/tenancy/platformModels');
const { TENANT_STATUS } = require('../../src/models/platform/Tenant');
const billing = require('../../src/services/billingServiceClient');

const argValue = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

async function run() {
  if (!billing.isConfigured()) {
    throw new Error('BILLING_DATABASE_URL is not configured.');
  }
  const apply = process.argv.includes('--apply');
  const days = Number.parseInt(argValue('--days') || process.env.BILLING_GRANDFATHER_DAYS || '60', 10);

  await connectPlatformDB();
  const { Tenant } = getPlatformModels();
  const tenants = await Tenant.find({ status: TENANT_STATUS.ACTIVE }).select('slug name adminEmail').lean();
  console.log(`[billing-grandfather] ${tenants.length} active schools · ${days} days · ${apply ? 'APPLY' : 'dry run'}`);
  console.log(`[billing-grandfather] billing database: ${new URL(process.env.BILLING_DATABASE_URL).host}`);

  let changed = 0;
  let skipped = 0;
  let failed = 0;

  for (const tenant of tenants) {
    try {
      const entitlement = await billing.getTenantEntitlement(tenant.slug);
      const hasAccount = entitlement.reason !== 'billing_account_missing';
      if (hasAccount && entitlement.state !== 'canceled') {
        skipped += 1;
        console.log(`  skip  ${tenant.slug} (already ${entitlement.state})`);
        continue;
      }
      if (!apply) {
        changed += 1;
        console.log(`  would grandfather ${tenant.slug}`);
        continue;
      }
      await billing.grandfatherTenant({
        tenantId: tenant._id.toString(),
        tenantSlug: tenant.slug,
        tenantName: tenant.name,
        billingEmail: tenant.adminEmail || '',
        days,
      });
      changed += 1;
      console.log(`  ok    ${tenant.slug}`);
    } catch (error) {
      failed += 1;
      console.error(`  fail  ${tenant.slug}: ${error.message}`);
    }
  }

  console.log(`[billing-grandfather] ${apply ? 'grandfathered' : 'would grandfather'}=${changed} skipped=${skipped} failed=${failed}`);
  if (!apply && changed) console.log('[billing-grandfather] re-run with --apply to write');
  if (failed > 0) process.exitCode = 1;
}

run()
  .then(() => process.exit(process.exitCode || 0))
  .catch((error) => {
    console.error('[billing-grandfather] fatal', error.message);
    process.exit(1);
  });
