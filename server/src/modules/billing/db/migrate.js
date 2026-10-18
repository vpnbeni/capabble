// Applies pending migrations over the direct (unpooled) connection.
// Run with `npm run billing:db:migrate` from server/.
const path = require('path');
const { Client } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { migrate } = require('drizzle-orm/node-postgres/migrator');
const { connectionOptions } = require('./ssl');

const MIGRATIONS_FOLDER = path.join(__dirname, '..', 'migrations');

async function run() {
  // Neon: the direct (unpooled) URL. Providers without a pooler only set BILLING_DATABASE_URL.
  const url = process.env.BILLING_DATABASE_URL_UNPOOLED || process.env.BILLING_DATABASE_URL;
  if (!url) throw new Error('Set BILLING_DATABASE_URL_UNPOOLED (direct Neon connection) or BILLING_DATABASE_URL');

  const { host } = new URL(url);
  console.log(`[billing-migrate] applying migrations to ${host}`);

  const client = new Client({ ...connectionOptions(url), connectionTimeoutMillis: 20000 });
  await client.connect();
  try {
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
    console.log('[billing-migrate] done');
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  require('dotenv').config();
  run().catch((error) => {
    console.error('[billing-migrate] failed', error.message);
    process.exit(1);
  });
}

module.exports = { MIGRATIONS_FOLDER, run };
