// In-memory Postgres (PGlite) with the real migrations applied, for tests.
const { PGlite } = require('@electric-sql/pglite');
const { btree_gist: btreeGist } = require('@electric-sql/pglite/contrib/btree_gist');
const { drizzle } = require('drizzle-orm/pglite');
const { migrate } = require('drizzle-orm/pglite/migrator');
const { MIGRATIONS_FOLDER } = require('../../src/db/migrate');
const client = require('../../src/db/client');
const schema = require('../../src/db/schema');

async function createTestDb() {
  const pg = new PGlite({ extensions: { btree_gist: btreeGist } });
  const db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  client.setDb(db);
  return {
    db,
    pg,
    close: async () => {
      client.setDb(null);
      await pg.close();
    },
  };
}

module.exports = { createTestDb };

// Drizzle wraps driver errors; match on the underlying Postgres message.
async function expectDbError(promise, pattern) {
  let caught = null;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  if (!caught) throw new Error(`expected a database error matching ${pattern}`);
  const text = [caught.message, caught.cause?.message, caught.cause?.constraint].filter(Boolean).join(' | ');
  if (!pattern.test(text)) throw new Error(`database error did not match ${pattern}: ${text}`);
}

module.exports.expectDbError = expectDbError;
