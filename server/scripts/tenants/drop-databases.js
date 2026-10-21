/* eslint-disable no-console */
/**
 * Drop whole databases you no longer need (old test data, sample data, abandoned schools).
 * Dry run by default: shows each database's collections and document counts. --apply drops.
 *
 *   npm run db:drop-databases -- --db=sample_mflix --db=test              # dry run
 *   npm run db:drop-databases -- --db=sample_mflix --db=test --apply      # drop (asks for the cluster host)
 *
 * Refuses to drop:
 *  - admin, local and config;
 *  - any central database (its name contains "central");
 *  - any database a tenant record still points to, in ANY central database on the cluster
 *    (production and stage). Delete that school from the admin portal instead.
 */
const path = require('path');
const readline = require('readline');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const skipPrompt = args.includes('--yes');
const targets = [...new Set(args.filter((arg) => arg.startsWith('--db=')).map((arg) => arg.slice(5).trim()).filter(Boolean))];

const PROTECTED = new Set(['admin', 'local', 'config']);

const clusterHost = (uri) => {
  try {
    return new URL(uri).host;
  } catch (error) {
    return uri.replace(/\/\/[^@]*@/, '//***@');
  }
};

const confirm = (host) => new Promise((resolve) => {
  if (skipPrompt) return resolve(true);
  if (!process.stdin.isTTY) {
    console.error('No terminal to confirm in. Re-run with --yes to drop without the prompt.');
    return resolve(false);
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return rl.question(`\nType the cluster host (${host}) to drop these databases: `, (answer) => {
    rl.close();
    resolve(answer.trim() === host);
  });
});

const run = async () => {
  if (!targets.length) throw new Error('Name the databases to drop with --db=<name> (repeat for several).');
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!uri) throw new Error('MONGODB_URI is not set.');
  const host = clusterHost(uri);

  const connection = await mongoose.createConnection(uri, { autoCreate: false, autoIndex: false }).asPromise();
  const client = connection.getClient();
  const { databases } = await client.db('admin').admin().listDatabases({ nameOnly: true });
  const existing = new Set(databases.map((row) => row.name));

  // Which databases do tenant records still point to? Check every central database.
  const inUse = new Map();
  const centrals = [...existing].filter((name) => /central/i.test(name));
  for (const central of centrals) {
    // eslint-disable-next-line no-await-in-loop
    const tenants = await client.db(central).collection('tenants').find({}, { projection: { slug: 1, dbName: 1 } }).toArray();
    tenants.forEach((tenant) => { if (tenant.dbName) inUse.set(tenant.dbName, `${central} → ${tenant.slug}`); });
  }

  console.log(`Cluster: ${host}`);
  console.log(apply ? 'Mode: APPLY (databases will be dropped)\n' : 'Mode: dry run (nothing is changed)\n');

  const plan = [];
  for (const name of targets) {
    if (!existing.has(name)) { console.log(`${name}: not found, skipped`); continue; } // eslint-disable-line no-continue
    if (PROTECTED.has(name)) { console.log(`${name}: system database, refused`); continue; } // eslint-disable-line no-continue
    if (/central/i.test(name)) { console.log(`${name}: central database, refused`); continue; } // eslint-disable-line no-continue
    if (inUse.has(name)) {
      console.log(`${name}: still used by tenant ${inUse.get(name)}, refused. Delete the school from the admin portal instead.`);
      continue; // eslint-disable-line no-continue
    }
    const db = client.db(name);
    // eslint-disable-next-line no-await-in-loop
    const collections = (await db.listCollections({}, { nameOnly: true }).toArray()).map((row) => row.name);
    // eslint-disable-next-line no-await-in-loop
    const counts = await Promise.all(collections.map(async (c) => ({ c, n: await db.collection(c).estimatedDocumentCount() })));
    const withData = counts.filter((row) => row.n > 0);
    console.log(`${name}: ${collections.length} collections, ${withData.reduce((sum, row) => sum + row.n, 0)} documents`);
    if (withData.length) console.log(`    has data: ${withData.map((row) => `${row.c} (${row.n})`).join(', ')}`);
    plan.push({ name, collections: collections.length });
  }

  const freed = plan.reduce((sum, row) => sum + row.collections, 0);
  console.log(`\nDatabases to drop: ${plan.length}, freeing ${freed} collections`);

  if (!apply || !plan.length) {
    if (!apply) console.log('Dry run only. Re-run with --apply to drop them.');
    await connection.close();
    return;
  }
  if (!(await confirm(host))) {
    console.log('Not confirmed. Nothing was dropped.');
    await connection.close();
    return;
  }
  for (const row of plan) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await client.db(row.name).dropDatabase();
      console.log(`  dropped ${row.name}`);
    } catch (error) {
      console.log(`  failed ${row.name}: ${error.message}`);
    }
  }
  await connection.close();
};

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`\n${error.message}`);
    process.exit(1);
  });
