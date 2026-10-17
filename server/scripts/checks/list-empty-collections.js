/* eslint-disable no-console */
/**
 * READ-ONLY report: how many collections each database on the cluster uses, and which are empty.
 *
 * Shared MongoDB Atlas tiers allow 500 collections per cluster (all databases together).
 * This lists every database, its collection count, and its empty collections, so you can
 * decide what to remove. It never writes, drops or changes anything.
 *
 *   npm run db:collections                 # summary per database + empty collection names
 *   npm run db:collections -- --json       # machine-readable output
 *   npm run db:collections -- --db=sems_tenant_ib   # one database only
 *
 * Uses MONGODB_URI from server/.env (or the environment). Check the cluster it prints first.
 */
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const SYSTEM_DATABASES = new Set(['admin', 'local', 'config']);
const SHARED_TIER_LIMIT = 500;

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const onlyDb = (args.find((arg) => arg.startsWith('--db=')) || '').slice('--db='.length) || null;

const clusterLabel = (uri) => {
  try {
    return new URL(uri).host;
  } catch (error) {
    return uri.replace(/\/\/[^@]*@/, '//***@');
  }
};

const kindOf = (dbName) => {
  const tenantPrefix = process.env.TENANT_DB_PREFIX || 'capabble_tenant_';
  const central = process.env.CENTRAL_DB_NAME || 'capabble_central';
  if (dbName === central) return 'central';
  if (dbName.startsWith(tenantPrefix)) return 'school';
  return 'other';
};

const run = async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!uri) throw new Error('MONGODB_URI is not set.');

  const connection = await mongoose.createConnection(uri, { autoCreate: false, autoIndex: false }).asPromise();
  const client = connection.getClient();

  const { databases } = await client.db('admin').admin().listDatabases({ nameOnly: true });
  const names = databases
    .map((row) => row.name)
    .filter((name) => !SYSTEM_DATABASES.has(name))
    .filter((name) => !onlyDb || name === onlyDb)
    .sort();

  const report = [];
  for (const dbName of names) {
    const db = client.db(dbName);
    // eslint-disable-next-line no-await-in-loop
    const collections = (await db.listCollections({}, { nameOnly: false }).toArray())
      .filter((row) => row.type !== 'view' && !row.name.startsWith('system.'));
    // eslint-disable-next-line no-await-in-loop
    const counts = await Promise.all(collections.map(async (row) => ({
      name: row.name,
      documents: await db.collection(row.name).estimatedDocumentCount(),
    })));
    report.push({
      database: dbName,
      kind: kindOf(dbName),
      collections: counts.length,
      empty: counts.filter((row) => row.documents === 0).map((row) => row.name).sort(),
    });
  }

  const totalCollections = report.reduce((sum, row) => sum + row.collections, 0);
  const totalEmpty = report.reduce((sum, row) => sum + row.empty.length, 0);

  if (asJson) {
    console.log(JSON.stringify({ cluster: clusterLabel(uri), totalCollections, totalEmpty, databases: report }, null, 2));
    await connection.close();
    return;
  }

  console.log(`Cluster: ${clusterLabel(uri)}  (read-only, nothing is changed)\n`);
  report.forEach((row) => {
    console.log(`${row.database}  [${row.kind}]  ${row.collections} collections, ${row.empty.length} empty`);
    if (row.empty.length) console.log(`    empty: ${row.empty.join(', ')}`);
  });
  console.log('');
  console.log(`Databases: ${report.length}`);
  console.log(`Collections: ${totalCollections}${onlyDb ? '' : ` (shared Atlas tiers allow ${SHARED_TIER_LIMIT})`}`);
  console.log(`Empty collections: ${totalEmpty}`);
  console.log(`If every empty one were removed: ${totalCollections - totalEmpty} collections`);
  await connection.close();
};

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`\n${error.message}`);
    process.exit(1);
  });
