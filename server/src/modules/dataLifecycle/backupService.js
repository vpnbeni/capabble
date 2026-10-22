/*
 * Nightly backups: a gzip `mongodump --archive` of the central database and of every tenant
 * database, plus a `pg_dump` of billing. Each file is encrypted (AES-256-GCM, BACKUP_ENCRYPTION_KEY)
 * before it leaves the server, then uploaded to `backups/<IST day>/<run id>/`. A plain manifest.json
 * next to the files says what each one holds, so a restore works even when the central database
 * is the thing that was lost. Storage expires everything under backups/ after 30 days.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const tools = require('./tools');
const { encryptFile, sha256File, parseKey } = require('./crypto');
const { getStorage } = require('./storage');
const { getModels } = require('./models');
const { istDay } = require('./lease');
const { appVersion } = require('./version');
const { getPlatformModels } = require('../../tenancy/platformModels');
const { getCentralDbName } = require('../../config/platformDatabase');

const runIdFor = (now) => {
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000).toISOString();
  return `${ist.slice(0, 10)}T${ist.slice(11, 16).replace(':', '')}-${crypto.randomBytes(2).toString('hex')}`;
};

const fileNameFor = (target) => {
  if (target.kind === 'central') return 'central.archive.gz.enc';
  if (target.kind === 'billing') return 'billing.pgdump.enc';
  return `tenant-${target.label}.archive.gz.enc`;
};

/** Everything a run backs up: central, every tenant that still has a database, and billing. */
const listTargets = async () => {
  const tenants = await getPlatformModels().Tenant.find({ status: { $ne: 'deleted' } })
    .select('slug dbName').sort({ slug: 1 }).lean();
  return [
    { kind: 'central', label: 'central', dbName: getCentralDbName() },
    ...tenants.map((tenant) => ({ kind: 'tenant', label: tenant.slug, dbName: tenant.dbName })),
    ...(config.backupBilling ? [{ kind: 'billing', label: 'billing', dbName: 'billing' }] : [])
  ];
};

const dumpTarget = async (target, file) => {
  if (target.kind === 'billing') return tools.pgDump({ url: process.env.BILLING_DATABASE_URL, file });
  return tools.mongoDump({ dbName: target.dbName, file });
};

const statusOf = (files) => {
  const ok = files.filter((file) => file.ok).length;
  if (ok === files.length) return 'ok';
  return ok === 0 ? 'failed' : 'partial';
};

const runBackup = async ({ trigger = 'scheduled', now = new Date(), log = console } = {}) => {
  parseKey(config.encryptionKey); // fail fast without a usable key
  const storage = getStorage();
  const { BackupRun } = getModels();
  const runId = runIdFor(now);
  const base = `backups/${istDay(now)}/${runId}`;
  const run = await BackupRun.create({
    runId, trigger, storage: storage.name, prefix: config.prefix, startedAt: new Date()
  });

  const dir = await tools.makeTempDir('backup');
  const files = [];
  try {
    const targets = await listTargets();
    // One at a time keeps memory and cluster load low on a small instance.
    // eslint-disable-next-line no-restricted-syntax
    for (const target of targets) {
      const name = fileNameFor(target);
      const plain = path.join(dir, name.replace(/\.enc$/, ''));
      const sealed = path.join(dir, name);
      const entry = { ...target, key: `${base}/${name}`, bytes: 0, sha256: '', ok: false, error: '' };
      try {
        /* eslint-disable no-await-in-loop */
        await dumpTarget(target, plain);
        await encryptFile(plain, sealed, config.encryptionKey);
        entry.bytes = (await fs.promises.stat(sealed)).size;
        entry.sha256 = await sha256File(sealed);
        await storage.putFile(entry.key, sealed);
        entry.ok = true;
      } catch (error) {
        entry.error = error.message;
        log.error(`[backup] target=${target.kind}:${target.label} status=failed message=${error.message}`);
      } finally {
        await fs.promises.rm(plain, { force: true });
        await fs.promises.rm(sealed, { force: true });
        /* eslint-enable no-await-in-loop */
      }
      files.push(entry);
    }

    const manifest = {
      format: 'capabble-backup',
      formatVersion: 1,
      runId,
      createdAt: now.toISOString(),
      app: appVersion(),
      prefix: config.prefix,
      encryption: 'aes-256-gcm (BACKUP_ENCRYPTION_KEY)',
      files: files.map(({ kind, label, dbName, key, bytes, sha256, ok, error }) => ({
        kind, label, dbName, file: path.posix.basename(key), bytes, sha256, ok, error
      }))
    };
    const manifestFile = path.join(dir, 'manifest.json');
    await fs.promises.writeFile(manifestFile, JSON.stringify(manifest, null, 2));
    await storage.putFile(`${base}/manifest.json`, manifestFile, { contentType: 'application/json' });
    await storage.applyRetention(now);

    const status = statusOf(files);
    await BackupRun.updateOne({ _id: run._id }, { $set: { status, files, finishedAt: new Date() } });
    return { runId, status, base, files };
  } catch (error) {
    await BackupRun.updateOne(
      { _id: run._id },
      { $set: { status: 'failed', files, error: error.message, finishedAt: new Date() } }
    );
    error.runId = runId;
    throw error;
  } finally {
    await tools.removeDir(dir);
  }
};

/** Runs found in storage, newest first: [{ runId, day, base }]. */
const listStoredRuns = async () => {
  const items = await getStorage().list('backups');
  return items
    .filter((item) => item.key.endsWith('/manifest.json'))
    .map((item) => {
      const [, day, runId] = item.key.split('/');
      return { runId, day, base: `backups/${day}/${runId}`, lastModified: item.lastModified };
    })
    .sort((a, b) => b.runId.localeCompare(a.runId));
};

const readStoredManifest = async (base) => {
  const dir = await tools.makeTempDir('manifest');
  try {
    const file = path.join(dir, 'manifest.json');
    await getStorage().getFile(`${base}/manifest.json`, file);
    return JSON.parse(await fs.promises.readFile(file, 'utf8'));
  } finally {
    await tools.removeDir(dir);
  }
};

module.exports = { runBackup, listTargets, listStoredRuns, readStoredManifest, statusOf, runIdFor };
