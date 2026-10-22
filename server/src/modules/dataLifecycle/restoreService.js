/*
 * Restores one database from a stored backup run into a database name you choose.
 *
 * Safety: the target must not be a live database (the central DB, any tenant's DB, or the
 * billing DB) and must be empty, unless the caller passes allowLive (the CLI's
 * --overwrite-live). Only then does mongorestore drop existing collections.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const config = require('./config');
const tools = require('./tools');
const { decryptFile, sha256File } = require('./crypto');
const { getStorage } = require('./storage');
const { listStoredRuns, readStoredManifest } = require('./backupService');

/**
 * Decides whether a restore may write to the target. Pure, so it is unit-tested.
 * @returns {{ ok: boolean, drop: boolean, reason?: string }}
 */
const checkRestoreTarget = ({ target, liveNames = [], targetHasData = false, allowLive = false }) => {
  if (!target) return { ok: false, drop: false, reason: 'Give a target database (--to).' };
  const live = liveNames.includes(target);
  if (live && !allowLive) {
    return { ok: false, drop: false, reason: `${target} is a live database. Pass --overwrite-live to replace it.` };
  }
  if (targetHasData && !allowLive) {
    return { ok: false, drop: false, reason: `${target} already has data. Restore into an empty database name.` };
  }
  return { ok: true, drop: Boolean(allowLive && (live || targetHasData)) };
};

const sameMongoCluster = (a, b) => {
  const host = (uri) => {
    try {
      return new URL(String(uri).replace(/^mongodb(\+srv)?:/, 'http:')).host.toLowerCase();
    } catch {
      return String(uri);
    }
  };
  return host(a) === host(b);
};

const samePostgres = (a, b) => {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.hostname === y.hostname && (x.port || '5432') === (y.port || '5432') && x.pathname === y.pathname;
  } catch {
    return false;
  }
};

/** Live database names on the app's own cluster: central plus every tenant DB. */
const liveMongoNames = async () => {
  // eslint-disable-next-line global-require
  const { getPlatformModels } = require('../../tenancy/platformModels');
  // eslint-disable-next-line global-require
  const { getCentralDbName } = require('../../config/platformDatabase');
  try {
    const tenants = await getPlatformModels().Tenant.find({}).select('dbName').lean();
    return [getCentralDbName(), ...tenants.map((tenant) => tenant.dbName)];
  } catch {
    // Central database not connected (it may be what is being recovered).
    return [getCentralDbName()];
  }
};

const resolveRun = async (runArg) => {
  const runs = await listStoredRuns();
  if (!runs.length) throw new Error('No backups found in storage.');
  const run = !runArg || runArg === 'latest' ? runs[0] : runs.find((r) => r.runId === runArg);
  if (!run) throw new Error(`No backup run ${runArg}. Use --list to see them.`);
  return { ...run, manifest: await readStoredManifest(run.base) };
};

const pickFile = (manifest, which) => {
  const [kind, label] = which.split(':');
  const entry = manifest.files.find((file) => file.kind === kind && (kind !== 'tenant' || file.label === label));
  if (!entry) throw new Error(`Backup ${manifest.runId} has no ${which}.`);
  if (!entry.ok) throw new Error(`Backup ${manifest.runId} failed for ${which}: ${entry.error}`);
  return entry;
};

/** Downloads, checks and decrypts one backup file into dir. Returns the plain file path. */
const fetchPlain = async (run, entry, dir) => {
  const sealed = path.join(dir, entry.file);
  const plain = path.join(dir, entry.file.replace(/\.enc$/, ''));
  await getStorage().getFile(`${run.base}/${entry.file}`, sealed);
  const sum = await sha256File(sealed);
  if (entry.sha256 && sum !== entry.sha256) throw new Error(`Checksum mismatch for ${entry.file}.`);
  await decryptFile(sealed, plain, config.encryptionKey);
  await fs.promises.rm(sealed, { force: true });
  return plain;
};

const mongoHasData = async (uri, dbName) => {
  const connection = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 15000 }).asPromise();
  try {
    const collections = await connection.useDb(dbName, { useCache: false }).db.listCollections().toArray();
    return collections.length > 0;
  } finally {
    await connection.close();
  }
};

const restoreMongo = async ({ runArg, which, target, uri = tools.mongoUri(), allowLive = false, log = console }) => {
  const run = await resolveRun(runArg);
  const entry = pickFile(run.manifest, which);
  const liveNames = sameMongoCluster(uri, tools.mongoUri()) ? await liveMongoNames() : [];
  const decision = checkRestoreTarget({
    target, liveNames, targetHasData: await mongoHasData(uri, target), allowLive
  });
  if (!decision.ok) throw new Error(decision.reason);

  const replacing = decision.drop ? ' (replacing)' : '';
  log.info(`[restore] run=${run.runId} source=${which} (${entry.dbName}) -> ${target}${replacing}`);
  const dir = await tools.makeTempDir('restore');
  try {
    const plain = await fetchPlain(run, entry, dir);
    await tools.mongoRestore({ file: plain, fromDb: entry.dbName, toDb: target, drop: decision.drop, uri });
  } finally {
    await tools.removeDir(dir);
  }
  return { runId: run.runId, source: which, sourceDb: entry.dbName, target, replaced: decision.drop };
};

const postgresHasData = async (url) => {
  // eslint-disable-next-line global-require
  const { Client } = require('pg');
  // eslint-disable-next-line global-require
  const { connectionOptions } = require('../billing/db/ssl');
  const client = new Client(connectionOptions(url));
  await client.connect();
  try {
    const { rows } = await client.query(
      'SELECT count(*)::int AS n FROM information_schema.tables '
        + 'WHERE table_schema NOT IN (\'pg_catalog\', \'information_schema\')'
    );
    return rows[0].n > 0;
  } finally {
    await client.end();
  }
};

const restoreBilling = async ({ runArg, targetUrl, allowLive = false, log = console }) => {
  const run = await resolveRun(runArg);
  const entry = pickFile(run.manifest, 'billing');
  const liveUrl = process.env.BILLING_DATABASE_URL || '';
  const decision = checkRestoreTarget({
    target: targetUrl ? new URL(targetUrl).pathname.slice(1) || targetUrl : '',
    liveNames: liveUrl && targetUrl && samePostgres(liveUrl, targetUrl) ? [new URL(targetUrl).pathname.slice(1)] : [],
    targetHasData: targetUrl ? await postgresHasData(targetUrl) : false,
    allowLive
  });
  if (!decision.ok) throw new Error(decision.reason);

  log.info(`[restore] run=${run.runId} source=billing -> ${new URL(targetUrl).host}${new URL(targetUrl).pathname}`);
  const dir = await tools.makeTempDir('restore');
  try {
    const plain = await fetchPlain(run, entry, dir);
    await tools.pgRestore({ url: targetUrl, file: plain, clean: decision.drop });
  } finally {
    await tools.removeDir(dir);
  }
  return { runId: run.runId, source: 'billing', replaced: decision.drop };
};

module.exports = { checkRestoreTarget, restoreMongo, restoreBilling, resolveRun, sameMongoCluster, samePostgres };
