// Applies pending migrations over the direct (unpooled) connection.
require('dotenv').config();
const path = require('path');
const { Client } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { migrate } = require('drizzle-orm/node-postgres/migrator');

const MIGRATIONS_FOLDER = path.join(__dirname, '..', '..', 'drizzle');

async function run() {
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) throw new Error('DATABASE_URL_UNPOOLED is not set (use the direct Neon connection string)');

  const host = new URL(url).host;
  console.log(`[billing-migrate] applying migrations to ${host}`);

  const client = new Client({ connectionString: url, connectionTimeoutMillis: 20000 });
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
