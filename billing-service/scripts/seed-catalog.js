// Seeds the module catalog (codes match client/src/constants/moduleRegistry.ts).
//   node scripts/seed-catalog.js                  modules only
//   node scripts/seed-catalog.js --sample-prices  also sample prices (development branches only)
require('dotenv').config();
const { getDb, closeDb } = require('../src/db/client');
const { seedCatalog } = require('../src/services/seedService');

const run = async () => {
  const withPrices = process.argv.includes('--sample-prices');
  const host = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).host : '(unset)';
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
