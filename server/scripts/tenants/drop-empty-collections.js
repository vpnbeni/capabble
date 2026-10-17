/* eslint-disable no-console */
/**
 * Remove EMPTY collections from SCHOOL databases, to get back under the shared Atlas
 * collection limit. Dry run by default: it only reports. Add --apply to drop.
 *
 *   npm run db:drop-empty                         # dry run: what would be removed
 *   npm run db:drop-empty -- --db=sems_tenant_ib  # one school database only
 *   npm run db:drop-empty -- --apply              # drop (asks you to type the cluster host)
 *   npm run db:drop-empty -- --apply --yes        # drop without the prompt (scripts/CI)
 *
 * Safety rules:
 *  - only databases whose name starts with TENANT_DB_PREFIX (never central, stage or other DBs);
 *  - only collections that belong to a known school model, so the app recreates them,
 *    with their indexes, on first write (see src/tenancy/lazyCollections.js);
 *  - each collection is checked again for documents right before it is dropped;
 *  - empty collections that don't belong to a known model are listed and kept.
 *
 * Before --apply: make sure every API server runs the version with lazy collection
 * creation, otherwise collections come back on the next restart. After --apply,
 * restart the API servers so they rebuild indexes on first write.
 */
const path = require('path');
const readline = require('readline');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const { registerTenantModels } = require('../../src/tenancy/registerTenantModels');
const { disableAutoCreate } = require('../../src/tenancy/lazyCollections');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const skipPrompt = args.includes('--yes');
const onlyDb = (args.find((arg) => arg.startsWith('--db=')) || '').slice('--db='.length) || null;

const clusterHost = (uri) => {
  try {
    return new URL(uri).host;
  } catch (error) {
    return uri.replace(/\/\/[^@]*@/, '//***@');
  }
};

/** Collection names of every school model, worked out without touching any database. */
const knownSchoolCollections = () => {
  const shadow = mongoose.createConnection();
  disableAutoCreate(shadow);
  const models = registerTenantModels(shadow);
  return new Set(Object.values(models).map((Model) => Model.collection.collectionName));
};

const confirm = (host) => new Promise((resolve) => {
  if (skipPrompt) return resolve(true);
  if (!process.stdin.isTTY) {
    console.error('No terminal to confirm in. Re-run with --yes to drop without the prompt.');
    return resolve(false);
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return rl.question(`\nType the cluster host (${host}) to drop these collections: `, (answer) => {
    rl.close();
    resolve(answer.trim() === host);
  });
});

const isEmpty = async (db, name) => (await db.collection(name).findOne({}, { projection: { _id: 1 } })) === null;

const run = async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!uri) throw new Error('MONGODB_URI is not set.');
  const prefix = process.env.TENANT_DB_PREFIX || 'capabble_tenant_';
  const host = clusterHost(uri);
  const known = knownSchoolCollections();

  const connection = await mongoose.createConnection(uri, { autoCreate: false, autoIndex: false }).asPromise();
  const client = connection.getClient();
  const { databases } = await client.db('admin').admin().listDatabases({ nameOnly: true });
  const schoolDbs = databases
    .map((row) => row.name)
    .filter((name) => name.startsWith(prefix))
    .filter((name) => !onlyDb || name === onlyDb)
    .sort();

  console.log(`Cluster: ${host}`);
  console.log(`School databases (prefix "${prefix}"): ${schoolDbs.length}${onlyDb ? ` (only ${onlyDb})` : ''}`);
  console.log(apply ? 'Mode: APPLY (empty collections will be dropped)\n' : 'Mode: dry run (nothing is changed)\n');
  if (onlyDb && !schoolDbs.length) throw new Error(`"${onlyDb}" is not a school database on this cluster.`);

  const plan = [];
  for (const dbName of schoolDbs) {
    const db = client.db(dbName);
    // eslint-disable-next-line no-await-in-loop
    const collections = (await db.listCollections({}, { nameOnly: false }).toArray())
      .filter((row) => row.type === 'collection' && !row.name.startsWith('system.'))
      .map((row) => row.name);
    // eslint-disable-next-line no-await-in-loop
    const empties = (await Promise.all(collections.map(async (name) => ((await isEmpty(db, name)) ? name : null)))).filter(Boolean);
    plan.push({
      dbName,
      total: collections.length,
      drop: empties.filter((name) => known.has(name)).sort(),
      keep: empties.filter((name) => !known.has(name)).sort(),
    });
  }

  plan.forEach((row) => {
    console.log(`${row.dbName}: ${row.total} collections → ${row.total - row.drop.length} after (${row.drop.length} empty to remove)`);
    if (row.drop.length) console.log(`    remove: ${row.drop.join(', ')}`);
    if (row.keep.length) console.log(`    keep (empty, but not a known school model): ${row.keep.join(', ')}`);
  });
  const toDrop = plan.reduce((sum, row) => sum + row.drop.length, 0);
  console.log(`\nEmpty school collections to remove: ${toDrop}`);

  if (!apply) {
    console.log('Dry run only. Re-run with --apply to drop them.');
    await connection.close();
    return;
  }
  if (!toDrop) {
    console.log('Nothing to drop.');
    await connection.close();
    return;
  }
  if (!(await confirm(host))) {
    console.log('Not confirmed. Nothing was dropped.');
    await connection.close();
    return;
  }

  let dropped = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of plan) {
    const db = client.db(row.dbName);
    for (const name of row.drop) {
      try {
        // eslint-disable-next-line no-await-in-loop
        if (!(await isEmpty(db, name))) {
          skipped += 1;
          console.log(`  skipped ${row.dbName}.${name} (it has data now)`);
          // eslint-disable-next-line no-continue
          continue;
        }
        // eslint-disable-next-line no-await-in-loop
        await db.dropCollection(name);
        dropped += 1;
      } catch (error) {
        failed += 1;
        console.log(`  failed ${row.dbName}.${name}: ${error.message}`);
      }
    }
  }
  console.log(`\nDropped ${dropped}, skipped ${skipped} (got data), failed ${failed}.`);
  console.log('Restart the API servers so they rebuild indexes when these collections are next written to.');
  await connection.close();
};

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`\n${error.message}`);
    process.exit(1);
  });
