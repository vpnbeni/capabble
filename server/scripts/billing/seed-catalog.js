// Seeds the module catalog (codes match client/src/constants/moduleRegistry.ts).
//   npm run billing:db:seed                  modules only
//   npm run billing:db:seed -- --sample-prices  also sample prices (development branches only)
require('dotenv').config();
const { getDb, closeDb } = require('../../src/modules/billing/db/client');
const { seedCatalog } = require('../../src/modules/billing/services/seedService');

const run = async () => {
  const withPrices = process.argv.includes('--sample-prices');
  const host = process.env.BILLING_DATABASE_URL ? new URL(process.env.BILLING_DATABASE_URL).host : '(unset)';
  console.log(`[seed] ${host}${withPrices ? ' with sample prices' : ''}`);
  const result = await seedCatalog(getDb(), { withPrices });
  console.log('[seed] done', result);
};

run()
  .catch((error) => {
    console.error('[seed] failed', error.message);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
