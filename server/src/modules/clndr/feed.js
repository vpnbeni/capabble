/**
 * Private calendar feeds: each person can subscribe to their own calendar from
 * Google Calendar, Apple Calendar or Outlook.
 *
 *   https://<api>/api/ical/<school>/<token>.ics
 *
 * The token is random and only its SHA-256 is stored on the login, so the link
 * works like a password: resetting it makes a new one and the old link stops.
 * A deactivated login's feed stops too. The feed holds the same items the
 * person sees in the app (their own parts only), from two weeks back to about
 * three months ahead. Subscribed calendars refresh slowly (Google: up to a day),
 * so the app stays the live source.
 */
const crypto = require('crypto');
const express = require('express');
const { getPlatformModels } = require('../../tenancy/platformModels');
const { TENANT_STATUS } = require('../../models/platform/Tenant');
const { getTenantConnectionAndModels } = require('../../tenancy/tenantConnectionManager');
const { getActiveModelKeys } = require('../../constants/moduleModelKeys');
const { normalizeTenantFeatureToggles } = require('../../constants/tenantFeatures');
const { resolvePermissionSet, USER_KINDS } = require('../../rbac/permissions');
const { openSections } = require('../../rbac/portalSections');
const schoolDate = require('../../utils/schoolDate');
const { buildFeed } = require('../../utils/ics');
const { calendarFor, timeZoneFor } = require('./service');

const hash = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const apiUrl = () => String(process.env.API_URL || `http://localhost:${process.env.PORT || 5000}/api`)
  .replace(/\/+$/, '');

const feedUrl = (slug, token) => `${apiUrl()}/ical/${encodeURIComponent(slug)}/${token}.ics`;
const webcalUrl = (url) => url.replace(/^https?:\/\//, 'webcal://');

/** Make (or replace) the signed-in person's feed token; returns the new links. */
const resetToken = async (req) => {
  const token = crypto.randomBytes(24).toString('base64url');
  await req.models.User.updateOne({ _id: req.user._id }, { $set: { calendarFeedTokenHash: hash(token) } });
  const url = feedUrl(req.tenant.slug, token);
  return { url, webcal: webcalUrl(url) };
};

const hasToken = async (req) => {
  const user = await req.models.User.findById(req.user._id).select('+calendarFeedTokenHash').lean();
  return Boolean(user?.calendarFeedTokenHash);
};

const turnOff = (req) => req.models.User.updateOne({ _id: req.user._id }, { $unset: { calendarFeedTokenHash: 1 } });

// GET status / POST reset / DELETE turn off — mounted under /calendar/feed and /portal/calendar/feed.
const feedHandlers = {
  status: async (req, res, next) => {
    try {
      res.json({ success: true, data: { active: await hasToken(req) } });
    } catch (error) {
      next(error);
    }
  },
  reset: async (req, res, next) => {
    try {
      res.json({ success: true, data: { active: true, ...(await resetToken(req)) } });
    } catch (error) {
      next(error);
    }
  },
  off: async (req, res, next) => {
    try {
      await turnOff(req);
      res.json({ success: true, data: { active: false } });
    } catch (error) {
      next(error);
    }
  }
};

const describe = (item) => {
  const parts = (item.parts || []).filter((part) => part.instructions)
    .map((part) => `${part.child ? `For ${part.child.name}` : part.label || 'For you'}: ${part.instructions}`);
  return [item.detail, ...parts].filter(Boolean).join('\n\n');
};

/** Build one person's feed text. */
const feedFor = async ({ tenant, user, now = new Date() }) => {
  const toggles = normalizeTenantFeatureToggles(tenant.featureToggles);
  const { models } = getTenantConnectionAndModels(tenant.dbName, getActiveModelKeys(toggles));
  const portal = user.kind === USER_KINDS.PARENT || user.kind === USER_KINDS.STUDENT;
  const req = {
    user,
    models,
    tenant: { ...tenant, featureToggles: toggles },
    rbac: portal ? null : await resolvePermissionSet(user, models.Role)
  };
  if (portal && !openSections(req, user.kind).includes('calendar')) return null;
  const timeZone = await timeZoneFor(models);
  const today = schoolDate.dateKey(now, timeZone);
  const from = schoolDate.addDays(today, -14);
  const data = await calendarFor(req, { from, to: schoolDate.addDays(today, 85), portal });
  const profile = models.SchoolProfile ? await models.SchoolProfile.findOne({}).select('schoolName').lean() : null;
  const items = data.items.map((item) => ({
    uid: `${item.id.replace(/[^a-zA-Z0-9:._-]/g, '')}@${tenant.slug}.capabble.cloud`,
    title: item.child ? `${item.title} (${item.child.name.split(' ')[0]})` : item.title,
    startDate: item.startDate,
    endDate: item.endDate,
    allDay: item.allDay,
    startTime: item.startTime,
    endTime: item.endTime,
    venue: item.venue,
    description: describe(item),
    cancelled: item.status === 'cancelled',
    tentative: Boolean(item.tentative)
  }));
  const name = profile?.schoolName ? `${profile.schoolName} calendar` : 'School calendar';
  return buildFeed(items, { name, timeZone, now });
};

const router = express.Router();
router.get('/:slug/:file', async (req, res) => {
  const token = String(req.params.file || '').replace(/\.ics$/, '');
  const notFound = () => res.status(404).type('text/plain')
    .send('Calendar not found. Make a new link from the calendar in Capabble.');
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return notFound();
  try {
    const tenant = await getPlatformModels().Tenant.findOne({ slug: req.params.slug, status: TENANT_STATUS.ACTIVE })
      .select('slug dbName featureToggles name').lean();
    if (!tenant) return notFound();
    const { User } = getTenantConnectionAndModels(tenant.dbName, ['User']).models;
    const user = await User.findOne({ calendarFeedTokenHash: hash(token), isActive: { $ne: false } })
      .select('name email username kind roles role teacher linkedStudents assignedSections isActive').lean();
    if (!user) return notFound();
    const text = await feedFor({ tenant, user });
    if (!text) return notFound();
    res.set('Cache-Control', 'private, max-age=900');
    return res.type('text/calendar; charset=utf-8').send(text);
  } catch (error) {
    console.error(`[clndr] feed failed: ${error.message}`);
    return res.status(503).type('text/plain').send('The calendar is not available right now.');
  }
});

module.exports = {
  router, feedHandlers, feedFor, hash, feedUrl
};
