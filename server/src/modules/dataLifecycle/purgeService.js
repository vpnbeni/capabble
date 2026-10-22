/*
 * Deleting a closed workspace once its deletion date has passed.
 *
 * The daily job only finds what is due and opens a purge request (status awaiting_approval).
 * Nothing is deleted until a platform admin approves the request in the admin portal. A purge:
 *   1. deletes the school's Cloudinary files (not files that the central DB or another school
 *      also references, such as master guidelines copied into many schools);
 *   2. drops the tenant database;
 *   3. removes its user directory rows and onboarding tickets;
 *   4. deletes its stored workspace archives;
 *   5. marks the Tenant deleted and clears personal contact details from it.
 * Billing records stay in Postgres (kept 8 years under Indian tax law). Nightly backups that still
 * hold the school's data expire on their own within 30 days.
 * The purge record is the audit entry: who approved it, when, and what was removed.
 */
const { getModels, PURGE_OPEN_STATUSES } = require('./models');
const { collectFiles, deleteFiles } = require('./cloudinaryFiles');
const { deleteTenantArchives, countCollections, tenantDb } = require('./archiveService');
const { getPlatformConnection } = require('../../config/platformDatabase');
const { getPlatformModels } = require('../../tenancy/platformModels');
const { removeTenantFromCache } = require('../../tenancy/tenantConnectionManager');
const { removeTenantUserDirectoryBySlug } = require('../../tenancy/tenantUserDirectoryService');

const DAY_MS = 86400000;
const NOTICE_DAYS = 7;

const isPendingClosure = (tenant) => Boolean(tenant?.closure?.requestedAt && !tenant.closure.canceledAt);
const notDeleted = (tenant) => tenant.status !== 'deleted';
const at = (value) => (value ? new Date(value).getTime() : NaN);

/* Pure selection rules (unit-tested). `now` is a Date. */

/** Export window over: the workspace should stop working. */
const selectToClose = (tenants, now) => tenants.filter((t) => notDeleted(t) && t.status !== 'closed'
  && isPendingClosure(t) && at(t.closure.exportUntil) <= now.getTime());

/** Deletion date within a week and the school not yet told. */
const selectDeletionNotices = (tenants, now) => tenants.filter((t) => notDeleted(t) && isPendingClosure(t)
  && !t.closure.deletionNoticeSentAt
  && at(t.closure.deleteAfter) > now.getTime()
  && at(t.closure.deleteAfter) - now.getTime() <= NOTICE_DAYS * DAY_MS);

/** Deletion date passed, closure not cancelled, not deleted yet. */
const selectDue = (tenants, now) => tenants.filter((t) => notDeleted(t) && isPendingClosure(t)
  && at(t.closure.deleteAfter) <= now.getTime());

/** Opens a purge request for each due tenant that has none. Returns the new requests. */
const openPurgeRequests = async (dueTenants, now) => {
  const { WorkspacePurge } = getModels();
  const created = [];
  // eslint-disable-next-line no-restricted-syntax
  for (const tenant of dueTenants) {
    // eslint-disable-next-line no-await-in-loop
    const open = await WorkspacePurge.findOne({ tenantId: tenant._id, status: { $in: PURGE_OPEN_STATUSES } }).lean();
    if (open) continue; // eslint-disable-line no-continue
    try {
      // eslint-disable-next-line no-await-in-loop
      const purge = await WorkspacePurge.create({
        tenantId: tenant._id,
        slug: tenant.slug,
        name: tenant.name,
        dbName: tenant.dbName,
        dueAt: tenant.closure.deleteAfter,
        clockAt: now
      });
      created.push(purge.toObject());
    } catch (error) {
      if (error.code !== 11000) throw error; // another run opened it first
    }
  }
  return created;
};

/** Cloudinary files referenced by the central DB or any other school: never deleted with this one. */
const sharedFileKeys = async (tenant) => {
  const shared = new Set();
  const connection = getPlatformConnection();
  (await collectFiles(connection.db)).forEach((_, key) => shared.add(key));
  const others = await getPlatformModels().Tenant
    .find({ _id: { $ne: tenant._id }, status: { $ne: 'deleted' } }).select('dbName').lean();
  // eslint-disable-next-line no-restricted-syntax
  for (const other of others) {
    // eslint-disable-next-line no-await-in-loop
    (await collectFiles(tenantDb(other.dbName))).forEach((_, key) => shared.add(key));
  }
  return shared;
};

/** What a purge would remove, without removing anything. */
const planPurge = async (tenant) => {
  const db = tenantDb(tenant.dbName);
  const [collections, files, shared, directory, tickets, archives] = await Promise.all([
    countCollections(db),
    collectFiles(db),
    sharedFileKeys(tenant),
    getPlatformModels().TenantUserDirectory.countDocuments({ tenantSlug: tenant.slug }),
    getPlatformModels().TenantOnboardingTicket.countDocuments({ tenantSlug: tenant.slug }),
    getModels().WorkspaceArchive.countDocuments({ tenantId: tenant._id, status: { $ne: 'deleted' } })
  ]);
  const own = [...files.values()].filter((file) => !shared.has(file.key));
  return {
    plan: {
      dbName: tenant.dbName,
      collections: Object.keys(collections).length,
      documents: Object.values(collections).reduce((sum, n) => sum + n, 0),
      files: own.length,
      sharedFilesKept: files.size - own.length,
      directoryEntries: directory,
      onboardingTickets: tickets,
      archives
    },
    ownFiles: own
  };
};

const scrubbedTenant = (tenant, now) => ({
  status: 'deleted',
  deletedAt: now,
  adminEmail: 'deleted@invalid',
  ...(tenant.closure?.requestedBy ? { 'closure.requestedBy.email': '' } : {}),
  'closure.canceledBy': null
});

/**
 * Runs an approved purge. Only a request awaiting approval (or one that failed and is retried)
 * can start; a closure cancelled in the meantime dismisses the request instead.
 */
const executePurge = async (purgeId, approver, { log = console } = {}) => {
  const { WorkspacePurge } = getModels();
  const { Tenant, TenantOnboardingTicket } = getPlatformModels();
  const now = new Date();
  const purge = await WorkspacePurge.findOneAndUpdate(
    { _id: purgeId, status: { $in: ['awaiting_approval', 'failed'] } },
    { $set: { status: 'running', approvedBy: approver, approvedAt: now, startedAt: now, error: '' } },
    { new: true }
  ).lean();
  if (!purge) {
    const error = new Error('This purge is not waiting for approval.');
    error.statusCode = 409;
    throw error;
  }

  const tenant = await Tenant.findById(purge.tenantId).lean();
  if (!tenant || !isPendingClosure(tenant) || tenant.status === 'deleted'
    || at(tenant.closure.deleteAfter) > Math.max(now.getTime(), at(purge.clockAt))) {
    await WorkspacePurge.updateOne({ _id: purge._id }, {
      $set: { status: 'dismissed', completedAt: new Date(), error: 'The closure was cancelled or is no longer due.' }
    });
    const error = new Error('The closure was cancelled or is no longer due, so nothing was deleted.');
    error.statusCode = 409;
    throw error;
  }

  try {
    const { plan, ownFiles } = await planPurge(tenant);
    await WorkspacePurge.updateOne({ _id: purge._id }, { $set: { plan } });

    const files = await deleteFiles(ownFiles);
    await tenantDb(tenant.dbName).dropDatabase();
    removeTenantFromCache(tenant.dbName);
    await removeTenantUserDirectoryBySlug(tenant.slug);
    const tickets = await TenantOnboardingTicket.deleteMany({ tenantSlug: tenant.slug });
    const archives = await deleteTenantArchives(tenant._id);
    await Tenant.updateOne({ _id: tenant._id }, { $set: scrubbedTenant(tenant, new Date()) });

    const result = {
      droppedDatabase: tenant.dbName,
      collections: plan.collections,
      documents: plan.documents,
      filesDeleted: files.deleted,
      filesAlreadyGone: files.missing,
      sharedFilesKept: plan.sharedFilesKept,
      directoryEntries: plan.directoryEntries,
      onboardingTickets: tickets.deletedCount || 0,
      archivesDeleted: archives,
      billingKept: true
    };
    const done = await WorkspacePurge.findByIdAndUpdate(purge._id, {
      $set: { status: 'done', completedAt: new Date(), result }
    }, { new: true }).lean();
    log.info(
      `[workspace-purge] tenantSlug=${tenant.slug} status=done by=${approver?.email || ''} ${JSON.stringify(result)}`
    );
    return done;
  } catch (error) {
    await WorkspacePurge.updateOne({ _id: purge._id }, { $set: { status: 'failed', error: error.message } });
    log.error(`[workspace-purge] tenantSlug=${tenant.slug} status=failed message=${error.message}`);
    throw error;
  }
};

module.exports = {
  selectToClose,
  selectDeletionNotices,
  selectDue,
  openPurgeRequests,
  planPurge,
  executePurge,
  isPendingClosure,
  NOTICE_DAYS
};
