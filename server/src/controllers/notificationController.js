/**
 * The signed-in person's own notifications. Mounted twice with the same handlers:
 * /api/notifications for staff and /api/portal/notifications for parents and
 * students. Every query is pinned to req.user, so nobody can read another inbox.
 */
const mongoose = require('mongoose');
const asyncHandler = require('../middleware/asyncHandler');

const PAGE_SIZE = 20;
const FIELDS = 'kind module title body link tone entity readAt createdAt';

const inbox = (req) => ({ recipient: req.user._id });

// GET ?unread=1&module=cpitl&before=<ISO date>&limit=20
const listNotifications = asyncHandler(async (req, res) => {
  const { Notification } = req.models;
  const filter = inbox(req);
  if (req.query.unread === '1' || req.query.unread === 'true') filter.readAt = null;
  if (req.query.module) filter.module = String(req.query.module).slice(0, 20);
  const before = req.query.before ? new Date(req.query.before) : null;
  if (before && !Number.isNaN(before.getTime())) filter.createdAt = { $lt: before };
  const limit = Math.min(Math.max(Number(req.query.limit) || PAGE_SIZE, 1), 50);

  const [rows, unread] = await Promise.all([
    Notification.find(filter).select(FIELDS).sort({ createdAt: -1 }).limit(limit + 1).lean(),
    Notification.countDocuments({ ...inbox(req), readAt: null })
  ]);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  res.json({
    success: true,
    data: {
      items,
      unread,
      nextBefore: hasMore ? items[items.length - 1].createdAt : null
    }
  });
});

// GET /unread-count — polled by the bell, so it stays one indexed count.
const unreadCount = asyncHandler(async (req, res) => {
  const unread = await req.models.Notification.countDocuments({ ...inbox(req), readAt: null });
  res.json({ success: true, data: { unread } });
});

// POST /:id/read
const markRead = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: 'Notification not found.' });
  const result = await req.models.Notification.updateOne(
    { ...inbox(req), _id: req.params.id, readAt: null },
    { $set: { readAt: new Date() } }
  );
  if (!result.matchedCount && !await req.models.Notification.exists({ ...inbox(req), _id: req.params.id })) {
    return res.status(404).json({ success: false, message: 'Notification not found.' });
  }
  return res.json({ success: true });
});

// POST /read-all
const markAllRead = asyncHandler(async (req, res) => {
  const result = await req.models.Notification.updateMany({ ...inbox(req), readAt: null }, { $set: { readAt: new Date() } });
  res.json({ success: true, data: { updated: result.modifiedCount || 0 } });
});

module.exports = { listNotifications, unreadCount, markRead, markAllRead };
