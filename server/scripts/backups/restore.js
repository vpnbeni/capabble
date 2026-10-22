/* eslint-disable no-console */
/**
 * Restore one database from a backup run into a database name you choose.
 *
 *   npm run backup:restore -- --list
 *   npm run backup:restore -- --run=latest --db=tenant:my-school --to=restore_my_school
 *   npm run backup:restore -- --run=2026-10-22T0200-3f9a --db=central --to=restore_central
 *   npm run backup:restore -- --run=latest --db=billing --to-url=postgres://…/restore_billing
 *
 * --run=<id|latest>   which backup run (see --list)
 * --db=central | tenant:<slug> | billing
 * --to=<database>     target MongoDB database (must not exist or be empty)
 * --uri=<mongodb uri> restore into another cluster (default MONGODB_URI)
 * --to-url=<url>      target Postgres database for billing (must be empty)
 * --overwrite-live    allow restoring over a live or non-empty database (drops what is there).
 *                     Only for disaster recovery; read server/docs/backups.md first.
 *
 * Needs BACKUP_ENCRYPTION_KEY and the BACKUP_* storage variables.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { connectPlatformDB, getPlatformConnection } = require('../../src/config/platformDatabase');
const { restoreMongo, restoreBilling } = require('../../src/modules/dataLifecycle/restoreService');
const { listStoredRuns, readStoredManifest } = require('../../src/modules/dataLifecycle/backupService');

const args = process.argv.slice(2);
const value = (name) => {
  const found = args.find((arg) => arg.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3).trim() : '';
};
const flag = (name) => args.includes(`--${name}`);

const run = async () => {
  if (flag('list')) {
    const runs = await listStoredRuns();
    // eslint-disable-next-line no-restricted-syntax
    for (const stored of runs.slice(0, 40)) {
      // eslint-disable-next-line no-await-in-loop
      const manifest = await readStoredManifest(stored.base);
      console.log(stored.runId);
      manifest.files.forEach((f) => {
        const name = f.kind === 'tenant' ? `tenant:${f.label}` : f.kind;
        console.log(`  ${f.ok ? '' : 'FAILED '}${name}  (${f.dbName})`);
      });
    }
    return;
  }

  const which = value('db');
  if (!which) throw new Error('Pass --db=central, --db=tenant:<slug> or --db=billing (or --list).');
  const allowLive = flag('overwrite-live');

  if (which === 'billing') {
    const result = await restoreBilling({ runArg: value('run') || 'latest', targetUrl: value('to-url'), allowLive });
    console.log(`Restored billing from ${result.runId}${result.replaced ? ' (replaced existing data)' : ''}.`);
    return;
  }

  // Connect to the app's own cluster so the live-database check knows every tenant database.
  // A central database that is itself lost is fine: the check then only refuses non-empty targets.
  await connectPlatformDB().catch((error) => console.warn(`Central database not reachable (${error.message}).`));
  const result = await restoreMongo({
    runArg: value('run') || 'latest',
    which,
    target: value('to'),
    uri: value('uri') || undefined,
    allowLive
  });
  console.log(`Restored ${result.source} (${result.sourceDb}) from ${result.runId} into ${result.target}`
    + `${result.replaced ? ' (replaced existing data)' : ''}.`);
};

run()
  .catch((error) => {
    console.error(`[restore] ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await getPlatformConnection().close();
    } catch {
      // not connected
    }
    process.exit(process.exitCode || 0);
  });
