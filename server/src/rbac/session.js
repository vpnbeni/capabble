/**
 * Tenant login sessions.
 *
 * - Access token: short-lived JWT in an httpOnly cookie (`cb_at`). It carries the
 *   audience (staff | portal) and the user's tokenVersion so password changes,
 *   role changes and deactivation cut access immediately.
 * - Refresh token: httpOnly cookie (`cb_rt`) scoped to /api/auth. Only a hash of
 *   its id is stored. Every refresh rotates it; presenting an already-rotated
 *   token (outside a short grace window for parallel tabs) revokes the family.
 *
 * Tokens never reach JavaScript in the browser.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { isPortalUser } = require('./permissions');

const ACCESS_COOKIE = 'cb_at';
const REFRESH_COOKIE = 'cb_rt';
const REFRESH_COOKIE_PATH = '/api/auth';

const ACCESS_TTL = process.env.ACCESS_TOKEN_TTL || '15m';
const REMEMBER_REFRESH_DAYS = Number.parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '', 10) || 30;
const SESSION_REFRESH_HOURS = 12;
const MAX_SESSIONS_PER_USER = 10;
const ROTATION_GRACE_MS = 20 * 1000;

const AUDIENCE = Object.freeze({ STAFF: 'staff', PORTAL: 'portal' });

const getAccessSecret = () => process.env.JWT_SECRET;
const getRefreshSecret = () => process.env.JWT_REFRESH_SECRET;

const hashValue = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const randomId = () => crypto.randomBytes(24).toString('base64url');

const isProduction = () => process.env.NODE_ENV === 'production';

const baseCookieOptions = () => ({
  httpOnly: true,
  secure: isProduction(),
  sameSite: 'strict'
});

const audienceFor = (user) => (isPortalUser(user) ? AUDIENCE.PORTAL : AUDIENCE.STAFF);

const signAccessToken = (user, tenantSlug) => jwt.sign(
  {
    id: user._id.toString(),
    tenantSlug,
    scope: 'tenant',
    aud: audienceFor(user),
    tv: user.tokenVersion || 0
  },
  getAccessSecret(),
  { expiresIn: ACCESS_TTL }
);

const accessCookieMaxAgeMs = () => {
  const decoded = jwt.decode(jwt.sign({}, 'x', { expiresIn: ACCESS_TTL }));
  return Math.max(60, decoded.exp - decoded.iat) * 1000;
};

const setAccessCookie = (res, token) => {
  res.cookie(ACCESS_COOKIE, token, { ...baseCookieOptions(), path: '/', maxAge: accessCookieMaxAgeMs() });
};

const setRefreshCookie = (res, token, { rememberMe, expiresAt }) => {
  res.cookie(REFRESH_COOKIE, token, {
    ...baseCookieOptions(),
    path: REFRESH_COOKIE_PATH,
    // Without "stay signed in" the cookie dies with the browser session.
    ...(rememberMe ? { expires: expiresAt } : {})
  });
};

const clearSessionCookies = (res) => {
  res.clearCookie(ACCESS_COOKIE, { ...baseCookieOptions(), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...baseCookieOptions(), path: REFRESH_COOKIE_PATH });
  // Cookies from the previous auth scheme.
  res.clearCookie('token', { path: '/' });
  res.clearCookie('refreshToken', { path: '/' });
};

const pruneSessions = (sessions = [], now = Date.now()) => sessions
  .filter((entry) => entry && entry.tokenHash && new Date(entry.expiresAt).getTime() > now)
  // Drop rotated tokens once their grace window and reuse-detection value are spent.
  .filter((entry) => !entry.revokedAt || now - new Date(entry.revokedAt).getTime() < 24 * 60 * 60 * 1000);

const newRefreshEntry = ({ req, familyId, rememberMe }) => {
  const jti = randomId();
  const expiresAt = new Date(
    Date.now() + (rememberMe ? REMEMBER_REFRESH_DAYS * 24 : SESSION_REFRESH_HOURS) * 60 * 60 * 1000
  );
  return {
    jti,
    entry: {
      familyId,
      tokenHash: hashValue(jti),
      createdAt: new Date(),
      expiresAt,
      revokedAt: null,
      rememberMe: Boolean(rememberMe),
      userAgent: String(req?.headers?.['user-agent'] || '').slice(0, 300),
      ip: String(req?.ip || '').slice(0, 64)
    }
  };
};

const signRefreshToken = ({ user, tenantSlug, familyId, jti, expiresAt }) => jwt.sign(
  { id: user._id.toString(), tenantSlug, scope: 'tenant', fid: familyId, jti },
  getRefreshSecret(),
  { expiresIn: Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000)) }
);

/**
 * Start a new login session for `user` and set both cookies.
 * The user document must have been loaded with `+refreshTokens`.
 * @returns {string} the access token (useful for API clients and tests)
 */
const issueSession = async ({ req, res, user, tenantSlug, rememberMe = true }) => {
  const familyId = randomId();
  const { jti, entry } = newRefreshEntry({ req, familyId, rememberMe });

  const sessions = pruneSessions(user.refreshTokens);
  sessions.push(entry);
  user.refreshTokens = sessions.slice(-MAX_SESSIONS_PER_USER);
  await user.save({ validateBeforeSave: false });

  const accessToken = signAccessToken(user, tenantSlug);
  setAccessCookie(res, accessToken);
  setRefreshCookie(res, signRefreshToken({ user, tenantSlug, familyId, jti, expiresAt: entry.expiresAt }), {
    rememberMe,
    expiresAt: entry.expiresAt
  });
  return accessToken;
};

const verifyRefreshCookie = (token) => {
  const decoded = jwt.verify(token, getRefreshSecret());
  if (decoded.scope !== 'tenant' || !decoded.fid || !decoded.jti) {
    throw new Error('Invalid refresh token');
  }
  return decoded;
};

/**
 * Rotate a refresh token.
 * @returns {{ status: 'rotated' | 'grace' | 'reuse' | 'invalid', accessToken?: string }}
 */
const rotateSession = async ({ req, res, user, decoded, tenantSlug }) => {
  const now = Date.now();
  const sessions = Array.isArray(user.refreshTokens) ? user.refreshTokens : [];
  const presentedHash = hashValue(decoded.jti);
  const current = sessions.find((entry) => entry.tokenHash === presentedHash);

  if (!current || new Date(current.expiresAt).getTime() <= now) {
    return { status: 'invalid' };
  }

  if (current.revokedAt) {
    const sinceRevoked = now - new Date(current.revokedAt).getTime();
    if (sinceRevoked <= ROTATION_GRACE_MS) {
      // Another tab refreshed a moment ago and the browser already holds the
      // new refresh cookie; just hand out an access token.
      const accessToken = signAccessToken(user, tenantSlug);
      setAccessCookie(res, accessToken);
      return { status: 'grace', accessToken };
    }

    // A rotated token came back: assume theft and end the whole family.
    user.refreshTokens = sessions.filter((entry) => entry.familyId !== current.familyId);
    await user.save({ validateBeforeSave: false });
    return { status: 'reuse' };
  }

  current.revokedAt = new Date(now);
  const { jti, entry } = newRefreshEntry({ req, familyId: current.familyId, rememberMe: current.rememberMe });
  // Keep the family's original lifetime so rotation cannot extend a session forever.
  entry.expiresAt = current.expiresAt;
  user.refreshTokens = pruneSessions([...sessions, entry], now).slice(-MAX_SESSIONS_PER_USER * 2);
  await user.save({ validateBeforeSave: false });

  const accessToken = signAccessToken(user, tenantSlug);
  setAccessCookie(res, accessToken);
  const nextRefreshToken = signRefreshToken({
    user, tenantSlug, familyId: entry.familyId, jti, expiresAt: entry.expiresAt
  });
  setRefreshCookie(res, nextRefreshToken, {
    rememberMe: entry.rememberMe,
    expiresAt: entry.expiresAt
  });
  return { status: 'rotated', accessToken };
};

/** End the session the request's refresh cookie belongs to. */
const endSession = async ({ user, refreshToken }) => {
  if (!user || !refreshToken) return;
  try {
    const decoded = verifyRefreshCookie(refreshToken);
    if (decoded.id !== user._id.toString()) return;
    user.refreshTokens = (user.refreshTokens || []).filter((entry) => entry.familyId !== decoded.fid);
    await user.save({ validateBeforeSave: false });
  } catch (error) {
    // Expired or malformed refresh cookie: nothing to revoke.
  }
};

/** Cut every session and outstanding access token for a user. Caller saves. */
const revokeAllSessions = (user) => {
  user.refreshTokens = [];
  user.tokenVersion = (user.tokenVersion || 0) + 1;
};

module.exports = {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  AUDIENCE,
  hashValue,
  randomId,
  audienceFor,
  signAccessToken,
  issueSession,
  rotateSession,
  endSession,
  verifyRefreshCookie,
  revokeAllSessions,
  clearSessionCookies
};
