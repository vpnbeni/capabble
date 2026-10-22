/*
 * Closing a school's workspace (Settings → Account → Close workspace).
 *
 * A request is only recorded on the central Tenant record. The workspace stays fully usable
 * for EXPORT_DAYS so the school can download its data; a later platform job closes it and
 * deletes the data within a further DELETE_DAYS. Nothing is switched off or deleted here.
 */
const asyncHandler = require('../middleware/asyncHandler');
const { getPlatformModels } = require('../tenancy/platformModels');
const { sendMail } = require('../utils/mailer');
const mailTemplates = require('../mail/templates');
const { archiveOnClosure } = require('../modules/dataLifecycle');
const { isStorageConfigured } = require('../modules/dataLifecycle/storage');

const EXPORT_DAYS = 30;
const DELETE_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const SUPPORT_EMAIL = () => process.env.SUPPORT_EMAIL || 'support@capabble.cloud';

const forbidden = (res) => res.status(403).json({
  success: false,
  message: 'Only an administrator can close the workspace.',
  errorCode: 'permission_denied'
});

/** Router guard: administrators only (the built-in Administrator role). */
const requireAdministrator = (req, res, next) => (req.rbac?.isAdmin ? next() : forbidden(res));

const isPending = (closure) => Boolean(closure?.requestedAt && !closure?.canceledAt);

const actorOf = (user) => ({
  userId: user?._id || null,
  email: String(user?.email || '').toLowerCase(),
  name: String(user?.name || '')
});

const formatDay = (date) => new Date(date).toLocaleDateString('en-IN', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata'
});

const formatTime = (date) => `${new Date(date).toLocaleString('en-IN', {
  timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short'
})} IST`;

const toResponse = (tenant) => {
  const closure = tenant?.closure || null;
  let status = 'none';
  if (closure?.requestedAt) status = closure.canceledAt ? 'canceled' : 'pending';
  return {
    slug: tenant?.slug || '',
    name: tenant?.name || '',
    closure: closure
      ? {
        status,
        requestedAt: closure.requestedAt || null,
        requestedBy: closure.requestedBy
          ? { name: closure.requestedBy.name || '', email: closure.requestedBy.email || '' }
          : null,
        exportUntil: closure.exportUntil || null,
        deleteAfter: closure.deleteAfter || null,
        canceledAt: closure.canceledAt || null
      }
      : { status }
  };
};

const loadTenant = (req) => getPlatformModels().Tenant.findById(req.tenant.id).lean();

/** Emails go out after the response; a mail failure never fails the request. */
const sendClosureEmails = (tenant, user) => {
  const { closure } = tenant;
  const exportUntil = formatDay(closure.exportUntil);
  const deleteAfter = formatDay(closure.deleteAfter);
  const appUrl = String(process.env.CLIENT_URL || 'https://school.capabble.cloud').replace(/\/+$/, '');
  const messages = [
    {
      to: SUPPORT_EMAIL(),
      replyTo: user?.email || undefined,
      ...mailTemplates.workspaceClosureAlert({
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        requestedBy: user?.name,
        requestedByEmail: user?.email,
        exportUntil,
        deleteAfter,
        time: formatTime(closure.requestedAt)
      })
    }
  ];
  if (user?.email) {
    messages.unshift({
      to: user.email,
      ...mailTemplates.workspaceClosureRequested({
        schoolName: tenant.name,
        name: user.name,
        exportUntil,
        deleteAfter,
        url: `${appUrl}/#/account-settings`,
        archive: isStorageConfigured()
      })
    });
  }

  setImmediate(() => {
    messages.forEach((message) => {
      Promise.resolve()
        .then(() => sendMail(message))
        .then(() => console.info(`[account-closure:mail] status=sent tenantSlug=${tenant.slug} to=${message.to}`))
        .catch((err) => console.error(
          `[account-closure:mail] status=failed tenantSlug=${tenant.slug} message=${err.message}`
        ));
    });
  });
};

// GET /account/closure
const getClosure = asyncHandler(async (req, res) => {
  const tenant = await loadTenant(req);
  if (!tenant) return res.status(404).json({ success: false, message: 'Workspace not found.' });
  return res.status(200).json({ success: true, data: toResponse(tenant) });
});

// POST /account/closure  { confirmation: '<workspace code>' }
const requestClosure = asyncHandler(async (req, res) => {
  const slug = String(req.tenant?.slug || '').toLowerCase();
  if (!slug || req.body.confirmation !== slug) {
    return res.status(400).json({
      success: false,
      message: `Type ${slug} exactly to confirm.`,
      details: [{ field: 'confirmation', message: `Type ${slug} exactly to confirm.` }]
    });
  }

  const { Tenant } = getPlatformModels();
  const now = new Date();
  const closure = {
    requestedAt: now,
    requestedBy: actorOf(req.user),
    exportUntil: new Date(now.getTime() + EXPORT_DAYS * DAY_MS),
    deleteAfter: new Date(now.getTime() + (EXPORT_DAYS + DELETE_DAYS) * DAY_MS),
    canceledAt: null,
    canceledBy: null
  };

  // Only one pending request: the filter matches when there is none (or the last was cancelled),
  // so a second click or a race leaves the first request and its dates untouched.
  const updated = await Tenant.findOneAndUpdate(
    {
      _id: req.tenant.id,
      $or: [{ closure: null }, { 'closure.requestedAt': null }, { 'closure.canceledAt': { $ne: null } }]
    },
    { $set: { closure } },
    { new: true }
  ).lean();

  if (!updated) {
    const existing = await loadTenant(req);
    if (!existing) return res.status(404).json({ success: false, message: 'Workspace not found.' });
    return res.status(200).json({
      success: true,
      message: 'Closure was already requested.',
      data: toResponse(existing)
    });
  }

  console.info(`[account-closure] status=requested tenantSlug=${updated.slug} by=${closure.requestedBy.email}`);
  sendClosureEmails(updated, req.user);
  archiveOnClosure(updated, req.user);

  return res.status(201).json({
    success: true,
    message: 'Closure requested.',
    data: toResponse(updated)
  });
});

// DELETE /account/closure
const cancelClosure = asyncHandler(async (req, res) => {
  const { Tenant } = getPlatformModels();
  const now = new Date();

  const updated = await Tenant.findOneAndUpdate(
    {
      _id: req.tenant.id,
      'closure.requestedAt': { $ne: null },
      'closure.canceledAt': null,
      'closure.exportUntil': { $gt: now }
    },
    { $set: { 'closure.canceledAt': now, 'closure.canceledBy': actorOf(req.user) } },
    { new: true }
  ).lean();

  if (updated) {
    console.info(`[account-closure] status=canceled tenantSlug=${updated.slug} by=${req.user?.email || ''}`);
    return res.status(200).json({ success: true, message: 'Closure cancelled.', data: toResponse(updated) });
  }

  const existing = await loadTenant(req);
  if (!existing) return res.status(404).json({ success: false, message: 'Workspace not found.' });
  if (!isPending(existing.closure)) {
    return res.status(409).json({
      success: false,
      message: 'There is no closure request to cancel.',
      data: toResponse(existing)
    });
  }
  return res.status(409).json({
    success: false,
    message: `The time to cancel ended on ${formatDay(existing.closure.exportUntil)}. `
      + `Write to ${SUPPORT_EMAIL()} for help.`,
    data: toResponse(existing)
  });
});

module.exports = {
  EXPORT_DAYS,
  DELETE_DAYS,
  requireAdministrator,
  getClosure,
  requestClosure,
  cancelClosure
};
