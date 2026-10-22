/*
 * Builds a school's downloadable workspace archive (see archiveFormat.js for the layout), stores it
 * under `archives/<slug>/<archive id>.zip` and emails the admin a signed link.
 *
 * Built when a closure is requested and whenever an administrator asks during the export window.
 * Runs in the background; the WorkspaceArchive record says where it is.
 */
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const config = require('./config');
const tools = require('./tools');
const { sha256File } = require('./crypto');
const { getStorage } = require('./storage');
const { getModels } = require('./models');
const { appVersion } = require('./version');
const { buildManifest, archiveReadme } = require('./archiveFormat');
const { collectFiles, downloadTo } = require('./cloudinaryFiles');
const { signedDownloadUrl } = require('./links');
const { getPlatformConnection } = require('../../config/platformDatabase');
const { getPlatformModels } = require('../../tenancy/platformModels');
const { sendMail } = require('../../utils/mailer');
const mailTemplates = require('../../mail/templates');

const dayLabel = (date) => new Date(date).toLocaleDateString('en-IN', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata'
});

const tenantDb = (dbName) => getPlatformConnection().useDb(dbName, { useCache: true }).db;

const countCollections = async (db) => {
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  const counts = {};
  await Promise.all(collections
    .filter(({ name }) => !name.startsWith('system.'))
    .map(async ({ name }) => { counts[name] = await db.collection(name).countDocuments(); }));
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
};

const zipFolder = (dir, target) => new Promise((resolve, reject) => {
  const out = fs.createWriteStream(target);
  const zip = archiver('zip', { zlib: { level: 6 } });
  out.on('close', resolve);
  zip.on('error', reject);
  zip.pipe(out);
  zip.directory(dir, false);
  zip.finalize();
});

/** Downloads the school's files into dir/files, up to the size cap. */
const gatherFiles = async (db, dir, log) => {
  const found = [...(await collectFiles(db)).values()];
  const capBytes = config.archiveMaxFilesMb * 1024 * 1024;
  let bytes = 0;
  let included = 0;
  const list = [];
  // eslint-disable-next-line no-restricted-syntax
  for (const file of found) {
    const name = file.format && file.resourceType !== 'raw' ? `${file.publicId}.${file.format}` : file.publicId;
    const relative = path.posix.join('files', file.resourceType, file.type, name);
    const item = {
      publicId: file.publicId,
      resourceType: file.resourceType,
      type: file.type,
      format: file.format,
      url: file.url,
      urls: [...file.urls],
      collections: [...file.collections],
      path: null
    };
    if (bytes < capBytes) {
      const target = path.join(dir, ...relative.split('/'));
      try {
        // eslint-disable-next-line no-await-in-loop
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        // eslint-disable-next-line no-await-in-loop
        const size = await downloadTo(file.url, target);
        bytes += size;
        included += 1;
        item.path = relative;
        item.bytes = size;
      } catch (error) {
        item.error = error.message;
        log.warn(`[workspace-archive] file=${file.url} status=skipped message=${error.message}`);
      }
    }
    list.push(item);
  }
  let mode = 'included';
  if (!list.length) mode = 'none';
  else if (included === 0) mode = 'links';
  else if (included < list.length) mode = 'partial';
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || '';
  return { list, summary: { mode, count: list.length, included, bytes, cloudName } };
};

const notifyReady = async (tenant, archive) => {
  const to = archive.requestedBy?.email || tenant.adminEmail;
  if (!to) return;
  const link = signedDownloadUrl(archive._id);
  const exportUntil = tenant.closure?.requestedAt && !tenant.closure?.canceledAt ? tenant.closure.exportUntil : null;
  await sendMail({
    to,
    ...mailTemplates.workspaceArchiveReady({
      schoolName: tenant.name,
      name: archive.requestedBy?.name,
      url: link.url,
      linkExpiresOn: dayLabel(link.expiresAt),
      exportUntil: exportUntil ? dayLabel(exportUntil) : null,
      settingsUrl: `${config.appUrl}/#/account-settings`
    })
  });
};

/** Builds one archive for a tenant record. Returns the finished WorkspaceArchive (lean). */
const buildArchive = async (archiveId, { log = console, notify = true } = {}) => {
  const { WorkspaceArchive } = getModels();
  const archive = await WorkspaceArchive.findById(archiveId).lean();
  const tenant = await getPlatformModels().Tenant.findById(archive.tenantId).lean();
  const dir = await tools.makeTempDir('archive');
  const content = path.join(dir, 'content');
  try {
    if (!tenant || tenant.status === 'deleted') throw new Error('The workspace no longer exists.');
    await fs.promises.mkdir(content, { recursive: true });
    const db = tenantDb(tenant.dbName);

    const dump = path.join(content, 'database.archive.gz');
    await tools.mongoDump({ dbName: tenant.dbName, file: dump });
    const collections = await countCollections(db);
    const files = await gatherFiles(db, content, log);
    await fs.promises.mkdir(path.join(content, 'files'), { recursive: true });
    await fs.promises.writeFile(path.join(content, 'files', 'manifest.json'), JSON.stringify(files.list, null, 2));

    const manifest = buildManifest({
      tenant,
      app: appVersion(),
      database: { name: tenant.dbName, collections },
      files: files.summary,
      checksums: {
        'database.archive.gz': await sha256File(dump),
        'files/manifest.json': await sha256File(path.join(content, 'files', 'manifest.json'))
      }
    });
    await fs.promises.writeFile(path.join(content, 'manifest.json'), JSON.stringify(manifest, null, 2));
    await fs.promises.writeFile(path.join(content, 'README.txt'), archiveReadme(manifest));

    const zipFile = path.join(dir, 'archive.zip');
    await zipFolder(content, zipFile);
    const key = `archives/${tenant.slug}/${archive._id}.zip`;
    await getStorage().putFile(key, zipFile, { contentType: 'application/zip' });

    const ready = await WorkspaceArchive.findByIdAndUpdate(archive._id, {
      $set: {
        status: 'ready',
        key,
        filename: `capabble-${tenant.slug}-${new Date().toISOString().slice(0, 10)}.zip`,
        bytes: (await fs.promises.stat(zipFile)).size,
        sha256: await sha256File(zipFile),
        filesMode: files.summary.mode,
        fileCount: files.summary.count,
        documentCount: manifest.database.documents,
        readyAt: new Date(),
        error: ''
      }
    }, { new: true }).lean();
    log.info(`[workspace-archive] tenantSlug=${tenant.slug} archive=${archive._id} status=ready bytes=${ready.bytes}`);
    if (notify) {
      await notifyReady(tenant, ready).catch((error) => log.error(
        `[workspace-archive:mail] tenantSlug=${tenant.slug} status=failed message=${error.message}`
      ));
    }
    return ready;
  } catch (error) {
    await WorkspaceArchive.updateOne({ _id: archive._id }, { $set: { status: 'failed', error: error.message } });
    log.error(
      `[workspace-archive] tenantSlug=${tenant?.slug} archive=${archive._id} status=failed message=${error.message}`
    );
    throw error;
  } finally {
    await tools.removeDir(dir);
  }
};

/**
 * Records an archive request and builds it in the background. Returns the record at once;
 * an archive already being built for the tenant is returned instead of starting a second one.
 */
const requestArchive = async ({ tenantId, slug, reason = 'on_demand', requestedBy = null, background = true }) => {
  const { WorkspaceArchive } = getModels();
  const building = await WorkspaceArchive.findOne({ tenantId, status: 'building' }).lean();
  if (building) return { archive: building, started: false };
  const archive = await WorkspaceArchive.create({ tenantId, slug, reason, requestedBy });
  if (!background) return { archive: await buildArchive(archive._id), started: true };
  setImmediate(() => buildArchive(archive._id).catch(() => {}));
  return { archive: archive.toObject(), started: true };
};

const latestArchives = (tenantId, limit = 5) => getModels().WorkspaceArchive
  .find({ tenantId, status: { $ne: 'deleted' } }).sort({ createdAt: -1 }).limit(limit).lean();

/** Removes every stored archive of a tenant (used by the purge). */
const deleteTenantArchives = async (tenantId) => {
  const { WorkspaceArchive } = getModels();
  const archives = await WorkspaceArchive.find({ tenantId, status: { $ne: 'deleted' } }).lean();
  const stored = archives.filter((a) => a.key);
  if (stored.length) {
    const storage = getStorage();
    await Promise.all(stored.map((a) => storage.remove(a.key)));
  }
  await WorkspaceArchive.updateMany(
    { tenantId, status: { $ne: 'deleted' } },
    { $set: { status: 'deleted', deletedAt: new Date() } }
  );
  return archives.length;
};

module.exports = { buildArchive, requestArchive, latestArchives, deleteTenantArchives, countCollections, tenantDb };
