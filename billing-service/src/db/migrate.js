// Applies pending migrations over the direct (unpooled) connection.
require('dotenv').config();
const path = require('path');
const { Client } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { migrate } = require('drizzle-orm/node-postgres/migrator');
const { connectionOptions } = require('./ssl');

const MIGRATIONS_FOLDER = path.join(__dirname, '..', '..', 'drizzle');

async function run() {
  // Neon: the direct (unpooled) URL. Providers without a pooler only set DATABASE_URL.
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error('Set DATABASE_URL_UNPOOLED (direct Neon connection) or DATABASE_URL');

  const host = new URL(url).host;
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
  run().catch((error) => {
    console.error('[billing-migrate] failed', error.message);
    process.exit(1);
  });
}

module.exports = { MIGRATIONS_FOLDER, run };
