/*
 * Re-importing a workspace from its archive (admin portal → Workspace data → Re-import).
 *
 * planImport is the dry run: it opens the archive, checks its format, version and checksums,
 * decides whether to create a tenant or reuse one, and returns a summary. Nothing is written
 * except the WorkspaceImport record. applyImport then, in the background:
 *   1. creates the tenant (suspended until the end) or reuses a deleted/empty one;
 *   2. restores the database into the tenant's database name;
 *   3. uploads the files again (files that still exist on Cloudinary are kept) and rewrites URLs;
 *   4. rebuilds the central user directory from the restored users;
 *   5. runs the tenant data migrations (TENANT_MIGRATIONS), then opens the workspace.
 */
const fs = require('fs');
const path = require('path');
const unzipper = require('unzipper');
const { pipeline } = require('stream/promises');
const tools = require('./tools');
const { sha256File } = require('./crypto');
const { getStorage } = require('./storage');
const { getModels } = require('./models');
const { validateManifest, upgradeManifest, FORMAT_VERSION } = require('./archiveFormat');
const { fileExists, uploadAs, rewriteUrls } = require('./cloudinaryFiles');
const { tenantDb } = require('./archiveService');
const { getPlatformModels } = require('../../tenancy/platformModels');
const { removeTenantFromCache, getTenantConnectionAndModels } = require('../../tenancy/tenantConnectionManager');
const { syncTenantUserDirectoryEntry } = require('../../tenancy/tenantUserDirectoryService');
const { isValidSlug } = require('../../tenancy/resolveTenantFromRequest');

const SERVER_ROOT = path.resolve(__dirname, '../../..');

/**
 * Idempotent per-tenant migrations, run after every import so an archive from an older app version
 * matches today's data. Add new tenant migrations here (they must accept --apply --tenant=<slug>).
 */
const TENANT_MIGRATIONS = [
  { name: 'rbac', script: 'scripts/migrations/migrate-rbac.js' }
];

const tenantDbNameFor = (slug) => `${process.env.TENANT_DB_PREFIX || 'capabble_tenant_'}${slug.replace(/-/g, '_')}`;

const safeEntryPath = (entryPath) => {
  const normal = path.posix.normalize(entryPath);
  return !normal.startsWith('/') && !normal.startsWith('../') && normal !== '..' && !normal.includes('\0');
};

const openZip = async (file) => {
  const directory = await unzipper.Open.file(file);
  const entries = new Map(directory.files.filter((e) => e.type === 'File').map((e) => [e.path, e]));
  const unsafe = [...entries.keys()].filter((p) => !safeEntryPath(p));
  if (unsafe.length) throw new Error(`The archive has unsafe paths: ${unsafe.slice(0, 3).join(', ')}`);
  const readJson = async (name) => {
    const entry = entries.get(name);
    if (!entry) return null;
    try {
      return JSON.parse((await entry.buffer()).toString('utf8'));
    } catch {
      return undefined;
    }
  };
  const extract = async (name, target) => {
    const entry = entries.get(name);
    if (!entry) throw new Error(`The archive has no ${name}.`);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await pipeline(entry.stream(), fs.createWriteStream(target));
    return target;
  };
  return { entries, readJson, extract };
};

const fetchArchive = async (key, dir) => {
  const file = path.join(dir, 'archive.zip');
  await getStorage().getFile(key, file);
  return file;
};

const isEmptyDb = async (dbName) => {
  const collections = await tenantDb(dbName).listCollections({}, { nameOnly: true }).toArray();
  return collections.filter(({ name }) => !name.startsWith('system.')).length === 0;
};

/** Decides create vs reuse for a slug. Pure apart from the lookups passed in. */
const decideTarget = ({ slug, existing, dbEmpty }) => {
  if (!isValidSlug(slug)) return { error: `"${slug}" is not a valid workspace code.` };
  if (!existing) return { action: 'create', dbName: tenantDbNameFor(slug) };
  if (!dbEmpty) {
    return { error: `Workspace ${slug} already has data (${existing.status}). Pick another workspace code.` };
  }
  return { action: 'reuse', dbName: existing.dbName, currentStatus: existing.status, tenantId: existing._id };
};

const planImport = async ({ key, source = 'upload', targetSlug, createdBy }) => {
  const { WorkspaceImport } = getModels();
  const dir = await tools.makeTempDir('import-plan');
  try {
    const zip = await openZip(await fetchArchive(key, dir));
    const raw = await zip.readJson('manifest.json');
    const check = validateManifest(raw);
    const errors = [...check.errors];
    const warnings = [...check.warnings];
    let manifest = raw;
    let filesList = [];
    let target = null;

    if (check.ok) {
      manifest = upgradeManifest(raw);
      if (raw.formatVersion < FORMAT_VERSION) {
        warnings.push(`Archive format ${raw.formatVersion} was upgraded to ${FORMAT_VERSION}.`);
      }
      const dumpFile = await zip.extract(manifest.database.file, path.join(dir, 'database.archive.gz'));
      const expected = manifest.checksums?.[manifest.database.file];
      if (expected && expected !== await sha256File(dumpFile)) {
        errors.push('The database file is damaged (checksum mismatch).');
      }
      filesList = (await zip.readJson(manifest.files?.manifest || 'files/manifest.json')) || [];
      const missingInZip = filesList.filter((f) => f.path && !zip.entries.has(f.path)).length;
      if (missingInZip) warnings.push(`${missingInZip} file(s) listed in the archive are missing from it.`);
      if (manifest.files?.cloudName && process.env.CLOUDINARY_CLOUD_NAME
        && manifest.files.cloudName !== process.env.CLOUDINARY_CLOUD_NAME) {
        warnings.push('The files came from a different Cloudinary account; they will be uploaded to this one.');
      }

      const slug = String(targetSlug || manifest.tenant.slug).trim().toLowerCase();
      const existing = await getPlatformModels().Tenant.findOne({ slug }).lean();
      const dbName = existing ? existing.dbName : tenantDbNameFor(slug);
      const byDb = existing ? null : await getPlatformModels().Tenant.findOne({ dbName }).lean();
      if (byDb) errors.push(`Database ${dbName} belongs to workspace ${byDb.slug}.`);
      target = { slug, ...decideTarget({ slug, existing, dbEmpty: await isEmptyDb(dbName) }) };
      if (target.error) errors.push(target.error);
      if (target.action === 'reuse') {
        warnings.push(`Workspace ${slug} exists (${target.currentStatus}) with an empty database; it will be reused.`);
      }
      warnings.push('Billing is not part of the archive. Check the school\'s billing account after import.');
    }

    const plan = {
      ok: errors.length === 0,
      errors,
      warnings,
      archive: check.ok ? {
        createdAt: manifest.createdAt,
        formatVersion: raw.formatVersion,
        app: manifest.app,
        tenant: { slug: manifest.tenant.slug, name: manifest.tenant.name, createdAt: manifest.tenant.createdAt }
      } : null,
      target,
      database: check.ok ? {
        sourceName: manifest.database.name,
        collections: Object.keys(manifest.database.collections || {}).length,
        documents: manifest.database.documents
      } : null,
      files: {
        count: filesList.length,
        inArchive: filesList.filter((f) => f.path && zip.entries.has(f.path)).length,
        linksOnly: filesList.filter((f) => !f.path).length,
        mode: manifest?.files?.mode || 'none'
      },
      migrations: TENANT_MIGRATIONS.map((m) => m.name)
    };
    const record = await WorkspaceImport.create({
      key, source, targetSlug: target?.slug || '', plan, createdBy, status: 'planned'
    });
    return record.toObject();
  } finally {
    await tools.removeDir(dir);
  }
};

const runMigration = (migration, slug) => tools.run(
  process.execPath,
  [path.join(SERVER_ROOT, migration.script), '--apply', `--tenant=${slug}`]
);

const restoreFiles = async ({ zip, filesList, dir, step }) => {
  const mapping = new Map();
  const counts = { kept: 0, uploaded: 0, missing: 0 };
  const sameCloud = (item) => {
    const cloud = (item.url || '').split('/')[3];
    return cloud === process.env.CLOUDINARY_CLOUD_NAME;
  };
  // eslint-disable-next-line no-restricted-syntax
  for (const item of filesList) {
    /* eslint-disable no-await-in-loop */
    try {
      if (sameCloud(item) && await fileExists(item)) {
        counts.kept += 1;
      } else if (item.path && zip.entries.has(item.path)) {
        const local = await zip.extract(item.path, path.join(dir, 'files', String(counts.uploaded)));
        const url = await uploadAs(local, item);
        (item.urls || [item.url]).forEach((old) => mapping.set(old, url));
        await fs.promises.rm(local, { force: true });
        counts.uploaded += 1;
      } else {
        counts.missing += 1;
      }
    } catch (error) {
      counts.missing += 1;
      step(`file ${item.publicId}: ${error.message}`, false);
    }
    /* eslint-enable no-await-in-loop */
  }
  return { mapping, counts };
};

const rebuildDirectory = async (tenant) => {
  const { models } = getTenantConnectionAndModels(tenant.dbName, ['User']);
  const users = await models.User.find({ email: { $nin: [null, ''] } }).select('_id email role isActive').lean();
  // eslint-disable-next-line no-restricted-syntax
  for (const user of users) {
    // eslint-disable-next-line no-await-in-loop
    await syncTenantUserDirectoryEntry({
      tenantSlug: tenant.slug,
      tenantDbName: tenant.dbName,
      tenantUserId: user._id,
      email: user.email,
      role: user.role,
      isActive: user.isActive
    });
  }
  return users.length;
};

const doImport = async (record, log) => {
  const { WorkspaceImport } = getModels();
  const { Tenant } = getPlatformModels();
  const steps = [];
  const step = async (text, ok = true) => {
    steps.push({ at: new Date(), text, ok });
    await WorkspaceImport.updateOne({ _id: record._id }, { $set: { steps } });
  };
  const dir = await tools.makeTempDir('import');
  try {
    const zip = await openZip(await fetchArchive(record.key, dir));
    const manifest = upgradeManifest(await zip.readJson('manifest.json'));
    const filesList = (await zip.readJson(manifest.files?.manifest || 'files/manifest.json')) || [];
    const { target } = record.plan;

    // Re-check: the target may have filled up since the dry run.
    if (!(await isEmptyDb(target.dbName))) throw new Error(`Database ${target.dbName} is no longer empty.`);
    const tenantFields = {
      name: manifest.tenant.name,
      adminEmail: manifest.tenant.adminEmail || 'admin@invalid',
      featureToggles: manifest.tenant.featureToggles,
      metadata: {
        schoolCode: manifest.tenant.institution?.schoolCode || '',
        affiliationNo: manifest.tenant.institution?.affiliationNo || '',
        udiseCode: manifest.tenant.institution?.udiseCode || ''
      }
    };
    let tenant;
    if (target.action === 'create') {
      tenant = (await Tenant.create({
        slug: target.slug, dbName: target.dbName, status: 'suspended', ...tenantFields
      })).toObject();
      await step(`Created workspace ${tenant.slug} (suspended until the import finishes).`);
    } else {
      tenant = await Tenant.findByIdAndUpdate(target.tenantId, {
        $set: { status: 'suspended', closure: null, deletedAt: null, ...tenantFields }
      }, { new: true }).lean();
      await step(`Reusing workspace ${tenant.slug}.`);
    }
    await WorkspaceImport.updateOne({ _id: record._id }, { $set: { tenantId: tenant._id } });

    const dump = await zip.extract(manifest.database.file, path.join(dir, 'database.archive.gz'));
    await tools.mongoRestore({ file: dump, fromDb: manifest.database.name, toDb: tenant.dbName });
    removeTenantFromCache(tenant.dbName);
    await step(`Restored the database into ${tenant.dbName}.`);

    const { mapping, counts } = await restoreFiles({ zip, filesList, dir, step });
    const rewritten = await rewriteUrls(tenantDb(tenant.dbName), mapping);
    await step(`Files: ${counts.kept} still on Cloudinary, ${counts.uploaded} uploaded again, `
      + `${counts.missing} missing; ${rewritten} record(s) updated.`);

    const directory = await rebuildDirectory(tenant);
    await step(`User directory: ${directory} sign-in(s) linked.`);

    // eslint-disable-next-line no-restricted-syntax
    for (const migration of TENANT_MIGRATIONS) {
      // eslint-disable-next-line no-await-in-loop
      await runMigration(migration, tenant.slug);
      // eslint-disable-next-line no-await-in-loop
      await step(`Migration ${migration.name}: done.`);
    }
    removeTenantFromCache(tenant.dbName);

    await Tenant.updateOne({ _id: tenant._id }, { $set: { status: 'active', restoredAt: new Date() } });
    await step('Workspace is open again. Staff must sign in again; their passwords are unchanged.');
    await WorkspaceImport.updateOne({ _id: record._id }, { $set: { status: 'done', finishedAt: new Date() } });
    log.info(`[workspace-import] tenantSlug=${tenant.slug} status=done`);
  } catch (error) {
    await step(error.message, false);
    await WorkspaceImport.updateOne({ _id: record._id }, {
      $set: { status: 'failed', error: error.message, finishedAt: new Date() }
    });
    log.error(`[workspace-import] import=${record._id} status=failed message=${error.message}`);
  } finally {
    await tools.removeDir(dir);
  }
};

/** Starts an import planned earlier. Returns at once; poll the record for progress. */
const applyImport = async (importId, actor, { log = console, wait = false } = {}) => {
  const { WorkspaceImport } = getModels();
  const record = await WorkspaceImport.findOneAndUpdate(
    { _id: importId, status: 'planned', 'plan.ok': true },
    { $set: { status: 'running', startedAt: new Date(), createdBy: actor } },
    { new: true }
  ).lean();
  if (!record) {
    const error = new Error('This import is not ready to run (already run, or the dry run found problems).');
    error.statusCode = 409;
    throw error;
  }
  const work = doImport(record, log);
  if (wait) await work;
  return record;
};

module.exports = { planImport, applyImport, decideTarget, safeEntryPath, TENANT_MIGRATIONS };
