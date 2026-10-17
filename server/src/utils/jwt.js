const jwt = require('jsonwebtoken');

const getTenantAccessSecret = () => process.env.JWT_SECRET;
const getTenantRefreshSecret = () => process.env.JWT_REFRESH_SECRET;
const getPlatformAccessSecret = () => process.env.PLATFORM_JWT_SECRET || process.env.JWT_SECRET;

const ensureTenantPayload = (payload = {}) => {
  const normalized = {
    ...payload,
    scope: 'tenant',
  };

  if (!normalized.tenantSlug) {
    throw new Error('tenantSlug is required for tenant token generation');
  }

  return normalized;
};

const ensurePlatformPayload = (payload = {}) => ({
  ...payload,
  scope: 'platform',
});

const generateTenantToken = (payload, secret = getTenantAccessSecret(), expiresIn = process.env.JWT_EXPIRE) => {
  return jwt.sign(ensureTenantPayload(payload), secret, { expiresIn });
};

const generateToken = generateTenantToken;

const generatePlatformToken = (payload, secret = getPlatformAccessSecret(), expiresIn = process.env.PLATFORM_JWT_EXPIRE || '1d') => {
  return jwt.sign(ensurePlatformPayload(payload), secret, { expiresIn });
};

const generateRefreshToken = (payload) => {
  return jwt.sign(
    ensureTenantPayload(payload),
    getTenantRefreshSecret(),
    { expiresIn: process.env.JWT_REFRESH_EXPIRE }
  );
};

const verifyToken = (token, secret = getTenantAccessSecret()) => {
  return jwt.verify(token, secret);
};

const verifyTenantToken = (token) => {
  const decoded = verifyToken(token, getTenantAccessSecret());

  if (decoded.scope !== 'tenant') {
    throw new Error('Invalid token scope for tenant access');
  }

  return decoded;
};

const verifyPlatformToken = (token) => {
  const decoded = jwt.verify(token, getPlatformAccessSecret());

  if (decoded.scope !== 'platform') {
    throw new Error('Invalid token scope for platform access');
  }

  return decoded;
};

const verifyRefreshToken = (token) => {
  const decoded = jwt.verify(token, getTenantRefreshSecret());

  if (decoded.scope !== 'tenant') {
    throw new Error('Invalid token scope for refresh token');
  }

  return decoded;
};

const decodeToken = (token) => {
  return jwt.decode(token);
};

/**
 * Tenant access token from the Authorization header (API clients, tests) or
 * the httpOnly `cb_at` cookie set at login (the web app).
 */
const getTokenFromRequest = (req, { withSource = false } = {}) => {
  let token = null;
  let source = null;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1] || null;
    source = 'header';
  } else if (req.cookies && req.cookies.cb_at) {
    token = req.cookies.cb_at;
    source = 'cookie';
  }

  return withSource ? { token, source } : token;
};

const createTokenResponse = (user, statusCode, res, tenantSlug, extraData = null) => {
  const resolvedTenantSlug = tenantSlug || user.tenantSlug;

  if (!resolvedTenantSlug) {
    throw new Error('tenantSlug is required to issue tenant auth tokens');
  }

  const tokenPayload = { id: user._id.toString(), tenantSlug: resolvedTenantSlug };
  const token = generateTenantToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  const options = {
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  };

  const userResponse = {
    _id: user._id,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    ...(extraData?.featureToggles ? { featureToggles: extraData.featureToggles } : {}),
  };

  res
    .status(statusCode)
    .cookie('token', token, options)
    .cookie('refreshToken', refreshToken, {
      ...options,
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })
    .json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        refreshToken,
        user: userResponse,
        ...(extraData && typeof extraData === 'object' ? extraData : {}),
      },
    });
};

const createPlatformTokenResponse = (platformAdmin, statusCode, res) => {
  const token = generatePlatformToken({ id: platformAdmin._id.toString() });

  const options = {
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  };

  res
    .status(statusCode)
    .cookie('platformToken', token, options)
    .json({
      success: true,
      message: 'Platform login successful',
      data: {
        token,
        admin: {
          _id: platformAdmin._id,
          email: platformAdmin.email,
          name: platformAdmin.name,
          isActive: platformAdmin.isActive,
          createdAt: platformAdmin.createdAt,
        },
      },
    });
};

const clearTokenCookies = (res) => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });

  res.cookie('refreshToken', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });
};

const clearPlatformTokenCookie = (res) => {
  res.cookie('platformToken', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });
};

module.exports = {
  generateToken,
  generateTenantToken,
  generatePlatformToken,
  generateRefreshToken,
  verifyToken,
  verifyTenantToken,
  verifyPlatformToken,
  verifyRefreshToken,
  decodeToken,
  getTokenFromRequest,
  createTokenResponse,
  createPlatformTokenResponse,
  clearTokenCookies,
  clearPlatformTokenCookie,
};
