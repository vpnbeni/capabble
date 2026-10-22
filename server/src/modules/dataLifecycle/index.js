/*
 * Data lifecycle: nightly encrypted backups, workspace archives (download + re-import) and the
 * approved purge of closed workspaces. Ops runbook: server/docs/backups.md.
 */
const express = require('express');
const admin = require('./adminController');
const account = require('./accountArchiveController');
const scheduler = require('./scheduler');
const { requestArchive } = require('./archiveService');
const { isStorageConfigured } = require('./storage');

/** /api/admin/workspace-data — mounted after protectPlatform. */
const adminRouter = express.Router();
adminRouter.get('/overview', admin.overview);
adminRouter.post('/backups/run', admin.runBackupNow);
adminRouter.post('/lifecycle/run', admin.runLifecycleNow);
adminRouter.get('/archives', admin.listArchives);
adminRouter.post('/archives', admin.createArchive);
adminRouter.get('/purges/:id/plan', admin.previewPurge);
adminRouter.post('/purges/:id/approve', admin.approvePurge);
adminRouter.post('/purges/:id/dismiss', admin.dismissPurge);
adminRouter.post('/imports/upload', admin.uploadImport);
adminRouter.post('/imports/plan', admin.planFromArchive);
adminRouter.get('/imports/:id', admin.getImport);
adminRouter.post('/imports/:id/apply', admin.applyImportNow);

/** /api/workspace-archives — signed download links; no sign-in, mounted outside tenant routing. */
const publicRouter = express.Router();
publicRouter.get('/:id/download', account.downloadArchive);

/** Called right after a school requests closure: start its archive (no-op without storage). */
const archiveOnClosure = (tenant, user) => {
  if (!isStorageConfigured()) return;
  requestArchive({
    tenantId: tenant._id,
    slug: tenant.slug,
    reason: 'closure',
    requestedBy: {
      id: String(user?._id || ''), email: String(user?.email || '').toLowerCase(), name: String(user?.name || '')
    }
  }).catch((error) => console.error(
    `[workspace-archive] tenantSlug=${tenant.slug} status=failed message=${error.message}`
  ));
};

module.exports = {
  adminRouter,
  publicRouter,
  accountArchive: { get: account.getArchives, create: account.createArchive },
  archiveOnClosure,
  startScheduler: scheduler.start,
  stopScheduler: scheduler.stop
};
