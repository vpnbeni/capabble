/* eslint-disable no-console */
/**
 * Backups from the command line (the server also runs them nightly when BACKUP_ENABLED=true).
 *
 *   npm run backup:setup        # check storage + key, install the 30-day expiry rules (S3)
 *   npm run backup:run          # back up every database now
 *   npm run backup:list         # backup runs in storage, newest first
 *
 * Uses MONGODB_URI, CENTRAL_DB_NAME, BILLING_DATABASE_URL and the BACKUP_* variables from
 * server/.env (variables already set in the shell win). See server/docs/backups.md.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { connectPlatformDB, getPlatformConnection, getCentralDbName } = require('../../src/config/platformDatabase');
const config = require('../../src/modules/dataLifecycle/config');
const { getStorage } = require('../../src/modules/dataLifecycle/storage');
const { runBackup, listStoredRuns, readStoredManifest } = require('../../src/modules/dataLifecycle/backupService');
const { parseKey } = require('../../src/modules/dataLifecycle/crypto');

const command = process.argv[2];

const setup = async () => {
  parseKey(config.encryptionKey);
  console.log('Encryption key: ok');
  const storage = getStorage();
  const where = storage.name === 's3' ? `${config.s3Bucket} (${config.s3Region})` : config.localDir;
  console.log(`Storage: ${storage.name} ${where}`);
  console.log(`Prefix: ${config.prefix}/`);
  const probe = path.join(os.tmpdir(), `capabble-probe-${process.pid}`);
  fs.writeFileSync(probe, 'ok');
  await storage.putFile('backups/_probe.txt', probe);
  await storage.remove('backups/_probe.txt');
  fs.rmSync(probe, { force: true });
  console.log('Write + delete: ok');
  if (storage.installRetention) {
    const rules = await storage.installRetention();
    rules.forEach((rule) => console.log(`Expiry rule: ${rule.Filter.Prefix} after ${rule.Expiration.Days} days`));
  } else {
    console.log('Local storage: expiry is applied after every backup run.');
  }
  (await storage.describeRetention()).forEach((rule) => console.log(`  active: ${rule.prefix} ${rule.days} days`));
};

const list = async () => {
  const runs = await listStoredRuns();
  if (!runs.length) console.log('No backups in storage.');
  // eslint-disable-next-line no-restricted-syntax
  for (const run of runs.slice(0, 40)) {
    // eslint-disable-next-line no-await-in-loop
    const manifest = await readStoredManifest(run.base);
    const failed = manifest.files.filter((f) => !f.ok).length;
    const bytes = manifest.files.reduce((sum, f) => sum + f.bytes, 0);
    const size = `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    console.log(`${run.runId}  ${manifest.files.length} files  ${size}${failed ? `  ${failed} FAILED` : ''}`);
  }
};

const run = async () => {
  if (!['setup', 'run', 'list'].includes(command)) {
    console.log('Usage: node scripts/backups/backup.js setup|run|list');
    process.exitCode = 1;
    return;
  }
  if (command === 'setup') {
    await setup();
    return;
  }
  await connectPlatformDB();
  console.log(`Central database: ${getCentralDbName()}`);
  if (command === 'list') {
    await list();
    return;
  }
  const result = await runBackup({ trigger: 'manual' });
  result.files.forEach((f) => console.log(
    `${f.ok ? 'ok    ' : 'FAILED'} ${f.kind}:${f.label} ${f.ok ? `${(f.bytes / 1024).toFixed(0)} KB` : f.error}`
  ));
  console.log(`Run ${result.runId}: ${result.status} -> ${config.prefix}/${result.base}/`);
  if (result.status !== 'ok') process.exitCode = 1;
};

run()
  .catch((error) => {
    console.error(`[backup] ${error.message}`);
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
