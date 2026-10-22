/*
 * Daily workspace job, for schools that asked to close their workspace:
 *   - makes sure each one has a workspace archive (normally built the moment closure is requested);
 *   - closes the workspace (no more sign-in) once the 30-day export window ends;
 *   - emails the school 7 days before its data is deleted;
 *   - opens a purge request when the deletion date passes and emails support to approve it.
 * Deleting happens only when a platform admin approves (purgeService.executePurge).
 */
const config = require('./config');
const purge = require('./purgeService');
const { getModels } = require('./models');
const { requestArchive } = require('./archiveService');
const { isStorageConfigured } = require('./storage');
const { getPlatformModels } = require('../../tenancy/platformModels');
const { sendMail } = require('../../utils/mailer');
const mailTemplates = require('../../mail/templates');

const dayLabel = (date) => new Date(date).toLocaleDateString('en-IN', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata'
});

const adminsOf = (tenant) => [...new Set(
  [tenant.closure?.requestedBy?.email, tenant.adminEmail].filter((email) => email && email !== 'deleted@invalid')
)];

const ensureArchives = async (tenants, log) => {
  const { WorkspaceArchive } = getModels();
  let started = 0;
  if (!isStorageConfigured()) return started;
  // eslint-disable-next-line no-restricted-syntax
  for (const tenant of tenants.filter((t) => purge.isPendingClosure(t) && t.status === 'active')) {
    // eslint-disable-next-line no-await-in-loop
    const has = await WorkspaceArchive.exists({
      tenantId: tenant._id, status: { $in: ['building', 'ready'] }, createdAt: { $gte: tenant.closure.requestedAt }
    });
    if (has) continue; // eslint-disable-line no-continue
    try {
      // eslint-disable-next-line no-await-in-loop
      await requestArchive({
        tenantId: tenant._id,
        slug: tenant.slug,
        reason: 'closure',
        requestedBy: tenant.closure.requestedBy,
        background: false
      });
      started += 1;
    } catch (error) {
      log.error(`[workspace-lifecycle] tenantSlug=${tenant.slug} step=archive message=${error.message}`);
    }
  }
  return started;
};

const runLifecycle = async ({ now = new Date(), log = console } = {}) => {
  const { Tenant } = getPlatformModels();
  const { WorkspacePurge } = getModels();
  const tenants = await Tenant.find({ 'closure.requestedAt': { $ne: null } }).lean();
  const result = { tenantsWithClosure: tenants.length, now: now.toISOString() };

  result.archivesBuilt = await ensureArchives(tenants, log);

  const toClose = purge.selectToClose(tenants, now);
  await Promise.all(toClose.map((t) => Tenant.updateOne(
    { _id: t._id, status: { $ne: 'deleted' } },
    { $set: { status: 'closed', 'closure.closedAt': now } }
  )));
  result.closed = toClose.map((t) => t.slug);

  const notices = purge.selectDeletionNotices(tenants, now);
  result.deletionNotices = [];
  // eslint-disable-next-line no-restricted-syntax
  for (const tenant of notices) {
    try {
      // eslint-disable-next-line no-restricted-syntax
      for (const to of adminsOf(tenant)) {
        // eslint-disable-next-line no-await-in-loop
        await sendMail({
          to,
          ...mailTemplates.workspaceDeletionNotice({
            schoolName: tenant.name,
            name: to === tenant.closure.requestedBy?.email ? tenant.closure.requestedBy?.name : '',
            deleteAfter: dayLabel(tenant.closure.deleteAfter),
            supportEmail: config.supportEmail
          })
        });
      }
      // eslint-disable-next-line no-await-in-loop
      await Tenant.updateOne({ _id: tenant._id }, { $set: { 'closure.deletionNoticeSentAt': now } });
      result.deletionNotices.push(tenant.slug);
    } catch (error) {
      log.error(`[workspace-lifecycle] tenantSlug=${tenant.slug} step=notice message=${error.message}`);
    }
  }

  const opened = await purge.openPurgeRequests(purge.selectDue(tenants, now), now);
  result.purgeRequestsOpened = opened.map((p) => p.slug);

  const unannounced = await WorkspacePurge.find({ status: 'awaiting_approval', supportNotifiedAt: null }).lean();
  if (unannounced.length) {
    try {
      await sendMail({
        to: config.supportEmail,
        ...mailTemplates.workspacePurgeDue({
          workspaces: unannounced.map((p) => ({ name: p.name, slug: p.slug, dueAt: dayLabel(p.dueAt) })),
          adminUrl: process.env.ADMIN_URL ? `${process.env.ADMIN_URL.replace(/\/+$/, '')}/workspace-data` : ''
        })
      });
      await WorkspacePurge.updateMany(
        { _id: { $in: unannounced.map((p) => p._id) } },
        { $set: { supportNotifiedAt: new Date() } }
      );
      result.supportNotified = unannounced.length;
    } catch (error) {
      log.error(`[workspace-lifecycle] step=support-mail message=${error.message}`);
    }
  }
  return result;
};

module.exports = { runLifecycle };
