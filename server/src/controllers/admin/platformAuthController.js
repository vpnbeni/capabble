const asyncHandler = require('../../middleware/asyncHandler');
const {
  createPlatformTokenResponse,
  clearPlatformTokenCookie,
} = require('../../utils/jwt');

const loginPlatformAdmin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Username and password are required',
    });
  }

  const PlatformAdmin = req.platformModels.PlatformAdmin;
  const admin = await PlatformAdmin.findOne({ email: email.toLowerCase() }).select('+password');

  if (!admin) {
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials',
    });
  }

  const isValidPassword = await admin.matchPassword(password);
  if (!isValidPassword) {
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials',
    });
  }

  if (!admin.isActive) {
    return res.status(401).json({
      success: false,
      message: 'Platform admin account is deactivated',
    });
  }

  admin.lastLogin = new Date();
  await admin.save({ validateBeforeSave: false });

  return createPlatformTokenResponse(admin, 200, res);
});

const getPlatformMe = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: req.platformUser,
  });
});

const logoutPlatformAdmin = asyncHandler(async (req, res) => {
  clearPlatformTokenCookie(res);

  res.status(200).json({
    success: true,
    message: 'Platform logout successful',
  });
});

module.exports = {
  loginPlatformAdmin,
  getPlatformMe,
  logoutPlatformAdmin,
};
