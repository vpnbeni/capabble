/*
 * Settings → Account → Workspace archive (school administrators) and the signed download link
 * used in emails. An archive can be made while a closure is pending and the export window is open.
 */
const asyncHandler = require('../../middleware/asyncHandler');
const { getPlatformModels } = require('../../tenancy/platformModels');
const { getModels } = require('./models');
const { getStorage, isStorageConfigured } = require('./storage');
const { requestArchive, latestArchives } = require('./archiveService');
const { signedDownloadUrl, verifyDownload } = require('./links');

const canRequest = (tenant, now = new Date()) => Boolean(tenant?.closure?.requestedAt
  && !tenant.closure.canceledAt
  && new Date(tenant.closure.exportUntil) > now
  && tenant.status === 'active');

const toItem = (archive) => ({
  id: String(archive._id),
  status: archive.status,
  reason: archive.reason,
  createdAt: archive.createdAt,
  readyAt: archive.readyAt,
  bytes: archive.bytes,
  filesMode: archive.filesMode,
  fileCount: archive.fileCount,
  documentCount: archive.documentCount,
  // A fresh one-hour link each time the page loads.
  downloadUrl: archive.status === 'ready' ? signedDownloadUrl(archive._id, { seconds: 3600 }).url : null
});

const actorOf = (user) => ({
  id: String(user?._id || ''), email: String(user?.email || '').toLowerCase(), name: String(user?.name || '')
});

// GET /account/archive
const getArchives = asyncHandler(async (req, res) => {
  const tenant = await getPlatformModels().Tenant.findById(req.tenant.id).lean();
  const available = isStorageConfigured();
  const archives = available ? await latestArchives(req.tenant.id) : [];
  return res.status(200).json({
    success: true,
    data: { available, canRequest: available && canRequest(tenant), archives: archives.map(toItem) }
  });
});

// POST /account/archive
const createArchive = asyncHandler(async (req, res) => {
  if (!isStorageConfigured()) {
    return res.status(503).json({
      success: false, message: 'Archives are not available yet. Write to support@capabble.cloud.'
    });
  }
  const tenant = await getPlatformModels().Tenant.findById(req.tenant.id).lean();
  if (!canRequest(tenant)) {
    return res.status(409).json({
      success: false,
      message: 'You can make an archive while your workspace is closing, until the export date.'
    });
  }
  const { archive, started } = await requestArchive({
    tenantId: tenant._id, slug: tenant.slug, reason: 'on_demand', requestedBy: actorOf(req.user)
  });
  return res.status(started ? 202 : 200).json({
    success: true,
    message: started
      ? 'We are making your archive. We will email you when it is ready.'
      : 'Your archive is already being made.',
    data: toItem(archive)
  });
});

// GET /api/workspace-archives/:id/download?exp=&sig=   (no sign-in; the signature is the key)
const downloadArchive = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { exp, sig } = req.query;
  if (!/^[a-f0-9]{24}$/i.test(id) || !verifyDownload(id, exp, sig)) {
    return res.status(403).type('text/plain')
      .send('This download link is invalid or has expired. Make a new one in Settings → Account.');
  }
  const archive = await getModels().WorkspaceArchive.findById(id).lean();
  if (!archive || archive.status !== 'ready' || !archive.key) {
    return res.status(404).type('text/plain').send('This archive is no longer available.');
  }
  const storage = getStorage();
  const url = await storage.downloadUrl(archive.key, { seconds: 300, filename: archive.filename });
  if (url) return res.redirect(302, url);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${archive.filename}"`);
  if (archive.bytes) res.setHeader('Content-Length', String(archive.bytes));
  const stream = await storage.readStream(archive.key);
  stream.on('error', () => res.destroy());
  return stream.pipe(res);
});

module.exports = { getArchives, createArchive, downloadArchive, canRequest };
