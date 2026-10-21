/* eslint-disable no-console, no-await-in-loop, no-restricted-syntax, max-len */
/**
 * TESTING ONLY. Wipe every trace of a tenant so the same slug and email can sign up again.
 * Not used by the app. Refuses a central database whose name doesn't say stage/dev/test/local
 * (production and stage share a cluster) unless you pass --allow-central=<name>.
 *
 *   npm run tenant:purge -- --slug=my-school                 # dry run: shows what would go
 *   npm run tenant:purge -- --email=me@example.com           # find tenants by admin/user/billing email
 *   npm run tenant:purge -- --slug=my-school --apply         # delete (asks you to type the slug)
 *
 * Removes:
 *  - the tenant database;
 *  - central records: tenant, onboarding tickets, user directory rows, rollout entries, and any
 *    other central document whose tenantSlug / tenantDbName / tenantId points at the tenant;
 *  - with --email: user directory rows and demo requests for that email;
 *  - billing (Postgres): account, subscriptions, items, add-ons, coupon redemptions (coupon
 *    counters are given back), invoices, lines, payments, credit notes, notifications, audit log.
 *
 * Billing guards (append-only audit log, locked invoice lines) are switched off inside the
 * delete transaction only, so they are back on whether it commits or rolls back.
 * Cloudinary files are left alone.
 */
const path = require('path');
const readline = require('readline');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const skipPrompt = args.includes('--yes');
const argValues = (name) => args
  .filter((arg) => arg.startsWith(`--${name}=`))
  .map((arg) => arg.slice(name.length + 3).trim().toLowerCase())
  .filter(Boolean);
const slugArgs = argValues('slug');
const emailArgs = argValues('email');

const clusterHost = (uri) => {
  try {
    return new URL(uri).host;
  } catch (error) {
    return String(uri).replace(/\/\/[^@]*@/, '//***@');
  }
};

// Central databases this tool may touch without --allow-central.
const TEST_CENTRAL = /(stage|staging|dev|test|local)/i;

const defaultDbName = (slug) => `${process.env.TENANT_DB_PREFIX || 'capabble_tenant_'}${slug.replace(/-/g, '_')}`;

const confirm = (expected) => new Promise((resolve) => {
  if (skipPrompt) {
    resolve(true);
    return;
  }
  if (!process.stdin.isTTY) {
    console.error('No terminal to confirm in. Re-run with --yes to delete without the prompt.');
    resolve(false);
    return;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(`\nType "${expected}" to delete everything listed above: `, (answer) => {
    rl.close();
    resolve(answer.trim().toLowerCase() === expected);
  });
});

/* ------------------------------------------------------------------ billing */

const openBilling = () => {
  if (!process.env.BILLING_DATABASE_URL) return null;
  // eslint-disable-next-line global-require
  const { Pool } = require('pg');
  // eslint-disable-next-line global-require
  const { connectionOptions } = require('../../src/modules/billing/db/ssl');
  return new Pool({ ...connectionOptions(process.env.BILLING_DATABASE_URL), max: 1 });
};

const ids = (rows) => rows.map((row) => row.id);

// Everything billing holds for these accounts, gathered in one place so dry run and apply agree.
const collectBilling = async (db, { slugs, tenantIds, emails }) => {
  const { rows: accounts } = await db.query(
    `SELECT id, tenant_slug, billing_email FROM billing.accounts
      WHERE tenant_slug = ANY($1) OR tenant_id = ANY($2) OR lower(billing_email) = ANY($3)`,
    [slugs, [...tenantIds, ...slugs], emails]
  );
  const accountIds = ids(accounts);
  const select = async (sql) => (await db.query(sql, [accountIds])).rows;
  const subscriptions = await select('SELECT id FROM billing.subscriptions WHERE account_id = ANY($1)');
  const invoices = await select('SELECT id FROM billing.invoices WHERE account_id = ANY($1)');
  const payments = await select('SELECT id FROM billing.payments WHERE account_id = ANY($1)');
  const creditNotes = await select('SELECT id FROM billing.credit_notes WHERE account_id = ANY($1)');
  const redemptions = await select(
    'SELECT coupon_code, count(*)::int AS n FROM billing.coupon_redemptions WHERE account_id = ANY($1) GROUP BY coupon_code'
  );
  const notifications = await select('SELECT count(*)::int AS n FROM billing.notifications WHERE account_id = ANY($1)');

  const entityIds = [
    ...accountIds, ...ids(subscriptions), ...ids(invoices), ...ids(payments), ...ids(creditNotes),
    ...tenantIds, ...slugs
  ].map(String);
  const { rows: [audit] } = await db.query(
    'SELECT count(*)::int AS n FROM billing.audit_log WHERE account_id = ANY($1) OR entity_id = ANY($2)',
    [accountIds, entityIds]
  );

  return {
    accounts,
    accountIds,
    entityIds,
    redemptions,
    counts: {
      accounts: accounts.length,
      subscriptions: subscriptions.length,
      invoices: invoices.length,
      payments: payments.length,
      credit_notes: creditNotes.length,
      coupon_redemptions: redemptions.reduce((sum, row) => sum + row.n, 0),
      notifications: notifications[0].n,
      audit_log: audit.n
    }
  };
};

const deleteBilling = async (db, plan) => {
  const { accountIds, entityIds, redemptions } = plan;
  await db.query('BEGIN');
  try {
    await db.query('ALTER TABLE billing.audit_log DISABLE TRIGGER audit_log_no_update_delete');
    await db.query('ALTER TABLE billing.invoice_lines DISABLE TRIGGER invoice_lines_lock_issued');

    for (const { coupon_code: code, n } of redemptions) {
      await db.query(
        'UPDATE billing.coupons SET redeemed_count = GREATEST(redeemed_count - $2, 0) WHERE code = $1',
        [code, n]
      );
    }
    await db.query('DELETE FROM billing.audit_log WHERE account_id = ANY($1) OR entity_id = ANY($2)', [accountIds, entityIds]);
    await db.query('DELETE FROM billing.notifications WHERE account_id = ANY($1)', [accountIds]);
    await db.query('DELETE FROM billing.credit_notes WHERE account_id = ANY($1)', [accountIds]);
    await db.query('DELETE FROM billing.payments WHERE account_id = ANY($1)', [accountIds]);
    await db.query('DELETE FROM billing.coupon_redemptions WHERE account_id = ANY($1)', [accountIds]);
    // invoice_lines, subscription_items and subscription_addons go by ON DELETE CASCADE.
    await db.query('DELETE FROM billing.invoices WHERE account_id = ANY($1)', [accountIds]);
    await db.query('DELETE FROM billing.subscriptions WHERE account_id = ANY($1)', [accountIds]);
    await db.query('DELETE FROM billing.accounts WHERE id = ANY($1)', [accountIds]);

    await db.query('ALTER TABLE billing.invoice_lines ENABLE TRIGGER invoice_lines_lock_issued');
    await db.query('ALTER TABLE billing.audit_log ENABLE TRIGGER audit_log_no_update_delete');
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
};

/* -------------------------------------------------------------------- mongo */

// With --email these central collections also lose rows matched by email alone.
const BY_EMAIL = new Set(['tenantuserdirectories', 'demorequests']);

// Central documents that point at one of these tenants, per collection.
const centralFilter = ({ slugs, dbNames, tenantIds, tenantObjectIds }) => ({
  $or: [
    { tenantSlug: { $in: slugs } },
    { tenantDbName: { $in: dbNames } },
    { tenantId: { $in: [...tenantIds, ...tenantObjectIds] } }
  ]
});

const run = async () => {
  if (!slugArgs.length && !emailArgs.length) throw new Error('Name the tenant with --slug=<slug> or --email=<email> (repeat for several).');

  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;
  const centralName = process.env.CENTRAL_DB_NAME;
  if (!uri) throw new Error('MONGODB_URI is not set.');
  if (!centralName) throw new Error('CENTRAL_DB_NAME is not set.');
  // Production and stage share a cluster, so the central database name is the real guard.
  if (!TEST_CENTRAL.test(centralName) && !argValues('allow-central').includes(centralName.toLowerCase())) {
    throw new Error(`Refusing: central database "${centralName}" does not look like stage/dev/test. `
      + `If it really is a test database, add --allow-central=${centralName}.`);
  }

  const connection = await mongoose.createConnection(uri, { autoCreate: false, autoIndex: false }).asPromise();
  const client = connection.getClient();
  const central = client.db(centralName);
  const billing = openBilling();

  try {
    // Work out which tenants we mean: the slugs given, plus any tied to the emails given.
    const slugs = new Set(slugArgs);
    if (emailArgs.length) {
      const byAdmin = await central.collection('tenants').find({ adminEmail: { $in: emailArgs } }, { projection: { slug: 1 } }).toArray();
      const byUser = await central.collection('tenantuserdirectories').find({ email: { $in: emailArgs } }, { projection: { tenantSlug: 1 } }).toArray();
      byAdmin.forEach((row) => slugs.add(row.slug));
      byUser.forEach((row) => slugs.add(row.tenantSlug));
      if (billing) {
        const { rows } = await billing.query('SELECT tenant_slug FROM billing.accounts WHERE lower(billing_email) = ANY($1)', [emailArgs]);
        rows.forEach((row) => slugs.add(row.tenant_slug));
      }
    }

    const tenants = await central.collection('tenants').find({ slug: { $in: [...slugs] } }).toArray();
    const target = {
      slugs: [...slugs],
      dbNames: [...new Set([...slugs].map(defaultDbName).concat(tenants.map((t) => t.dbName).filter(Boolean)))],
      tenantIds: tenants.map((t) => String(t._id)),
      tenantObjectIds: tenants.map((t) => t._id)
    };

    console.log(`Mongo cluster: ${clusterHost(uri)}  (central: ${centralName})`);
    console.log(`Billing:       ${billing ? clusterHost(process.env.BILLING_DATABASE_URL) : 'BILLING_DATABASE_URL not set, skipped'}`);
    console.log(apply ? 'Mode: APPLY (data will be deleted)\n' : 'Mode: dry run (nothing is changed)\n');

    if (!target.slugs.length) {
      console.log('No tenant matches. Nothing to do.');
      return;
    }
    console.log(`Tenants: ${target.slugs.join(', ')}${tenants.length < target.slugs.length ? '  (some have no tenant record left; leftovers are still cleaned)' : ''}`);

    // Tenant databases.
    const { databases } = await client.db('admin').admin().listDatabases({ nameOnly: true });
    const existing = new Set(databases.map((row) => row.name));
    const dropDbs = target.dbNames.filter((name) => existing.has(name) && !/central/i.test(name) && !['admin', 'local', 'config'].includes(name));
    console.log('\nTenant databases');
    if (!dropDbs.length) console.log('  none found');
    for (const name of dropDbs) {
      const collections = await client.db(name).listCollections({}, { nameOnly: true }).toArray();
      console.log(`  ${name} (${collections.length} collections)`);
    }

    // Central documents.
    const filter = centralFilter(target);
    const centralPlan = [];
    const collections = await central.listCollections({ type: 'collection' }, { nameOnly: true }).toArray();
    for (const { name } of collections) {
      let query = filter;
      if (name === 'tenants') query = { slug: { $in: target.slugs } };
      else if (BY_EMAIL.has(name) && emailArgs.length) query = { $or: [filter, { email: { $in: emailArgs } }] };
      const count = await central.collection(name).countDocuments(query);
      if (count) centralPlan.push({ name, query, count });
    }
    const rolloutQuery = { 'tenantStatuses.tenantSlug': { $in: target.slugs } };
    const rollouts = await central.collection('datarollouts').countDocuments(rolloutQuery);
    console.log(`\nCentral (${centralName})`);
    if (!centralPlan.length && !rollouts) console.log('  nothing found');
    centralPlan.forEach(({ name, count }) => console.log(`  ${name}: ${count}`));
    if (rollouts) console.log(`  datarollouts: tenant entries in ${rollouts} rollout(s)`);

    // Billing.
    let billingPlan = null;
    if (billing) {
      billingPlan = await collectBilling(billing, { slugs: target.slugs, tenantIds: target.tenantIds, emails: emailArgs });
      console.log('\nBilling (Postgres)');
      const rows = Object.entries(billingPlan.counts).filter(([, n]) => n);
      if (!rows.length) console.log('  nothing found');
      rows.forEach(([table, n]) => console.log(`  ${table}: ${n}`));
    }

    if (!apply) {
      console.log('\nDry run only. Add --apply to delete.');
      return;
    }
    if (!(await confirm(target.slugs.join(',')))) {
      console.log('Not confirmed. Nothing deleted.');
      return;
    }

    if (billingPlan && billingPlan.accountIds.length) {
      await deleteBilling(billing, billingPlan);
      console.log('Billing data deleted.');
    }
    for (const name of dropDbs) {
      await client.db(name).dropDatabase();
      console.log(`Dropped ${name}.`);
    }
    for (const { name, query } of centralPlan) {
      const { deletedCount } = await central.collection(name).deleteMany(query);
      console.log(`Deleted ${deletedCount} from ${name}.`);
    }
    if (rollouts) {
      await central.collection('datarollouts').updateMany(rolloutQuery, { $pull: { tenantStatuses: { tenantSlug: { $in: target.slugs } } } });
      console.log('Removed rollout entries.');
    }
    console.log('\nDone. Restart the dev server so it forgets any cached tenant connection.');
  } finally {
    await connection.close();
    if (billing) await billing.end();
  }
};

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
