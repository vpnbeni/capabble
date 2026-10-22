/*
 * Admin portal → Workspace data: backups, workspace archives, purge approvals and re-imports.
 * Mounted under /api/admin/workspace-data behind protectPlatform.
 */
const crypto = require('crypto');
const asyncHandler = require('../../middleware/asyncHandler');
const config = require('./config');
const { getModels } = require('./models');
const { getStorage, isStorageConfigured, RETENTION_DAYS } = require('./storage');
const { runBackup } = require('./backupService');
const { runLifecycle } = require('./lifecycleJob');
const { requestArchive, latestArchives } = require('./archiveService');
const { planPurge, executePurge } = require('./purgeService');
const { planImport, applyImport } = require('./importService');
const { signedDownloadUrl } = require('./links');
const { getPlatformModels } = require('../../tenancy/platformModels');

const ID = /^[a-f0-9]{24}$/i;
const actorOf = (req) => ({
  id: String(req.platformUser?._id || ''),
  email: String(req.platformUser?.email || req.platformUser?.username || '').toLowerCase(),
  name: String(req.platformUser?.name || req.platformUser?.username || '')
});
const notFound = (res, what) => res.status(404).json({ success: false, message: `${what} not found.` });
const noStorage = (res) => res.status(409).json({ success: false, message: 'Backup storage is not configured.' });
const fail = (res, error) => res.status(error.statusCode || 500).json({ success: false, message: error.message });

// GET /workspace-data/overview
const overview = asyncHandler(async (req, res) => {
  const { BackupRun, WorkspacePurge, WorkspaceImport, JobLease } = getModels();
  const configured = isStorageConfigured();
  const [runs, purges, imports, leases] = await Promise.all([
    BackupRun.find({}).sort({ startedAt: -1 }).limit(14).lean(),
    WorkspacePurge.find({}).sort({ createdAt: -1 }).limit(50).lean(),
    WorkspaceImport.find({}).sort({ createdAt: -1 }).limit(20).lean(),
    JobLease.find({ _id: { $in: ['backup-nightly', 'workspace-lifecycle'] } }).lean()
  ]);
  let retention = [];
  let retentionError = '';
  if (configured) {
    try {
      retention = await getStorage().describeRetention();
    } catch (error) {
      retentionError = error.message;
    }
  }
  const closing = await getPlatformModels().Tenant
    .find({ 'closure.requestedAt': { $ne: null }, 'closure.canceledAt': null, status: { $ne: 'deleted' } })
    .select('slug name status closure').sort({ 'closure.deleteAfter': 1 }).lean();
  return res.json({
    success: true,
    data: {
      storage: {
        configured,
        driver: config.storageDriver,
        bucket: config.storageDriver === 's3' ? config.s3Bucket : config.localDir,
        region: config.storageDriver === 's3' ? config.s3Region : '',
        prefix: config.prefix,
        expectedRetention: RETENTION_DAYS,
        retention,
        retentionError
      },
      jobs: {
        backupsEnabled: config.backupsEnabled,
        lifecycleEnabled: config.lifecycleEnabled,
        encryptionKeySet: Boolean(config.encryptionKey),
        leases
      },
      runs,
      closing,
      purges,
      imports
    }
  });
});

// POST /workspace-data/backups/run   — a manual backup, in the background
const runBackupNow = asyncHandler(async (req, res) => {
  if (!isStorageConfigured()) return noStorage(res);
  setImmediate(() => runBackup({ trigger: 'manual' }).then(
    (r) => console.log('[backup] manual', JSON.stringify({ runId: r.runId, status: r.status })),
    (e) => console.error('[backup] manual failed', e.message)
  ));
  return res.status(202).json({ success: true, message: 'Backup started. Refresh in a minute.' });
});

// POST /workspace-data/lifecycle/run — the daily workspace job, now (real clock)
const runLifecycleNow = asyncHandler(async (req, res) => {
  const result = await runLifecycle({ now: new Date() });
  return res.json({ success: true, data: result });
});

// GET /workspace-data/archives?tenantId=
const listArchives = asyncHandler(async (req, res) => {
  const { tenantId } = req.query;
  if (!ID.test(String(tenantId || ''))) {
    return res.status(400).json({ success: false, message: 'tenantId is required.' });
  }
  const archives = await latestArchives(tenantId, 10);
  return res.json({
    success: true,
    data: archives.map((a) => ({
      ...a, downloadUrl: a.status === 'ready' ? signedDownloadUrl(a._id, { seconds: 3600 }).url : null
    }))
  });
});

// POST /workspace-data/archives  { tenantId }
const createArchive = asyncHandler(async (req, res) => {
  const tenant = ID.test(String(req.body?.tenantId || ''))
    ? await getPlatformModels().Tenant.findById(req.body.tenantId).lean()
    : null;
  if (!tenant || tenant.status === 'deleted') return notFound(res, 'Workspace');
  if (!isStorageConfigured()) return noStorage(res);
  const actor = actorOf(req);
  const { archive, started } = await requestArchive({
    tenantId: tenant._id,
    slug: tenant.slug,
    reason: 'on_demand',
    // The school admin gets the email, not the platform admin.
    requestedBy: { id: '', email: tenant.adminEmail, name: '' }
  });
  console.info(`[workspace-archive] tenantSlug=${tenant.slug} requestedBy=platform:${actor.email}`);
  return res.status(started ? 202 : 200).json({ success: true, data: archive });
});

// GET /workspace-data/purges/:id/plan — what approving would delete
const previewPurge = asyncHandler(async (req, res) => {
  const purge = ID.test(req.params.id) ? await getModels().WorkspacePurge.findById(req.params.id).lean() : null;
  if (!purge) return notFound(res, 'Purge');
  const tenant = await getPlatformModels().Tenant.findById(purge.tenantId).lean();
  if (!tenant || tenant.status === 'deleted') return notFound(res, 'Workspace');
  const { plan } = await planPurge(tenant);
  return res.json({ success: true, data: { purge, plan } });
});

// POST /workspace-data/purges/:id/approve  { confirmSlug }
const approvePurge = asyncHandler(async (req, res) => {
  const purge = ID.test(req.params.id) ? await getModels().WorkspacePurge.findById(req.params.id).lean() : null;
  if (!purge) return notFound(res, 'Purge');
  if (String(req.body?.confirmSlug || '').trim().toLowerCase() !== purge.slug) {
    return res.status(400).json({ success: false, message: `Type ${purge.slug} exactly to approve.` });
  }
  try {
    const done = await executePurge(purge._id, actorOf(req));
    return res.json({ success: true, message: `${purge.slug} was deleted.`, data: done });
  } catch (error) {
    return fail(res, error);
  }
});

// POST /workspace-data/purges/:id/dismiss
const dismissPurge = asyncHandler(async (req, res) => {
  const updated = ID.test(req.params.id) ? await getModels().WorkspacePurge.findOneAndUpdate(
    { _id: req.params.id, status: { $in: ['awaiting_approval', 'failed'] } },
    {
      $set: {
        status: 'dismissed', completedAt: new Date(), approvedBy: actorOf(req), error: 'Dismissed by a platform admin.'
      }
    },
    { new: true }
  ).lean() : null;
  if (!updated) return res.status(409).json({ success: false, message: 'This purge cannot be dismissed.' });
  return res.json({ success: true, data: updated });
});

// POST /workspace-data/imports/upload  (multipart: file, targetSlug?) — stores the archive and runs the dry run
const uploadImport = asyncHandler(async (req, res) => {
  const file = req.files?.file;
  if (!file) return res.status(400).json({ success: false, message: 'Choose an archive (.zip) to upload.' });
  if (!/\.zip$/i.test(file.name || '')) {
    return res.status(400).json({ success: false, message: 'The archive must be a .zip file.' });
  }
  if (!isStorageConfigured()) return noStorage(res);
  const key = `imports/${new Date().toISOString().slice(0, 10)}/${crypto.randomBytes(8).toString('hex')}.zip`;
  await getStorage().putFile(key, file.tempFilePath, { contentType: 'application/zip' });
  try {
    const record = await planImport({
      key, source: 'upload', targetSlug: req.body?.targetSlug, createdBy: actorOf(req)
    });
    return res.status(201).json({ success: true, data: record });
  } catch (error) {
    return res.status(400).json({ success: false, message: `Could not read the archive: ${error.message}` });
  }
});

// POST /workspace-data/imports/plan  { archiveId, targetSlug? } — dry run from an archive we still hold
const planFromArchive = asyncHandler(async (req, res) => {
  const archive = ID.test(String(req.body?.archiveId || ''))
    ? await getModels().WorkspaceArchive.findById(req.body.archiveId).lean() : null;
  if (!archive || archive.status !== 'ready') return notFound(res, 'Archive');
  const record = await planImport({
    key: archive.key, source: 'archive', targetSlug: req.body?.targetSlug, createdBy: actorOf(req)
  });
  return res.status(201).json({ success: true, data: record });
});

// GET /workspace-data/imports/:id
const getImport = asyncHandler(async (req, res) => {
  const record = ID.test(req.params.id) ? await getModels().WorkspaceImport.findById(req.params.id).lean() : null;
  if (!record) return notFound(res, 'Import');
  return res.json({ success: true, data: record });
});

// POST /workspace-data/imports/:id/apply  { confirmSlug }
const applyImportNow = asyncHandler(async (req, res) => {
  const record = ID.test(req.params.id) ? await getModels().WorkspaceImport.findById(req.params.id).lean() : null;
  if (!record) return notFound(res, 'Import');
  if (String(req.body?.confirmSlug || '').trim().toLowerCase() !== record.targetSlug) {
    return res.status(400).json({ success: false, message: `Type ${record.targetSlug} exactly to import.` });
  }
  try {
    const started = await applyImport(record._id, actorOf(req));
    return res.status(202).json({ success: true, message: 'Import started.', data: started });
  } catch (error) {
    return fail(res, error);
  }
});

module.exports = {
  overview,
  runBackupNow,
  runLifecycleNow,
  listArchives,
  createArchive,
  previewPurge,
  approvePurge,
  dismissPurge,
  uploadImport,
  planFromArchive,
  getImport,
  applyImportNow
};
