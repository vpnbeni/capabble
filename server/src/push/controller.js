const asyncHandler = require('../middleware/asyncHandler');
const { HTTP_STATUS } = require('../utils/constants');
const { isPushToken } = require('./outbox');

/**
 * The Capabble app registers its push token after sign-in and removes it on sign-out.
 * Staff call /api/devices, families /api/portal/devices (same handlers). A login only
 * ever touches its own phones.
 */
const PLATFORMS = ['ios', 'android'];

const text = (value, max) => String(value || '').trim().slice(0, max);

// POST /devices — { token, platform, appVersion?, deviceName? }
exports.registerDevice = asyncHandler(async (req, res) => {
  const { Device } = req.models;
  const token = text(req.body?.token, 200);
  const platform = text(req.body?.platform, 10);
  if (!isPushToken(token)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false, message: 'Send the Expo push token from the app.'
    });
  }
  if (!PLATFORMS.includes(platform)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: 'Platform must be ios or android.' });
  }
  // The same phone may have been signed in to another login before: the token moves to this one.
  const device = await Device.findOneAndUpdate(
    { token },
    {
      $set: {
        user: req.user._id,
        platform,
        appVersion: text(req.body?.appVersion, 40),
        deviceName: text(req.body?.deviceName, 120),
        tokenVersion: req.user.tokenVersion || 0,
        lastSeenAt: new Date(),
        disabledAt: null,
        disabledReason: ''
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).select('_id platform').lean();
  return res.status(HTTP_STATUS.OK).json({ success: true, data: { id: device._id, platform: device.platform } });
});

// DELETE /devices/:token — this phone signed out; stop pushing to it.
exports.unregisterDevice = asyncHandler(async (req, res) => {
  const { Device } = req.models;
  const token = text(req.params.token, 200);
  const result = await Device.deleteOne({ token, user: req.user._id });
  return res.status(HTTP_STATUS.OK).json({ success: true, data: { removed: result?.deletedCount || 0 } });
});
