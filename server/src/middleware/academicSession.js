const { setRequestContext, getRequestContext } = require('../tenancy/requestContext');

/**
 * Express middleware that reads the `x-academic-session` header (e.g. "2025-2026")
 * and stores it on `req.academicSession` and in the AsyncLocalStorage request context.
 *
 * Session routes themselves (`/api/sessions/*`) are exempt — they work without a
 * selected session so that the user can list/create sessions first.
 *
 * Auth routes (`/api/auth/*`) are also exempt so that login/register work normally.
 */
const LEGACY_SESSION_TTL_MS = 60 * 1000;
const legacySessionCache = new Map();

/**
 * The tenant's first academic session. Records saved before sessions existed
 * have no session and belong to this one only (see academicSessionPlugin).
 * Cached briefly per tenant database; null when the tenant has no sessions yet.
 */
const findLegacySession = async (req) => {
  const AcademicSession = req.models?.AcademicSession;
  const cacheKey = req.tenant?.dbName;
  if (!AcademicSession || !cacheKey) return null;

  const cached = legacySessionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.label;

  const first = await AcademicSession.findOne({}).sort({ startYear: 1 }).select('label').lean();
  const label = first?.label || null;
  legacySessionCache.set(cacheKey, { label, expiresAt: Date.now() + LEGACY_SESSION_TTL_MS });
  return label;
};

const academicSessionMiddleware = async (req, res, next) => {
  const sessionLabel = req.headers['x-academic-session'];

  if (sessionLabel) {
    if (!/^\d{4}-\d{4}$/.test(sessionLabel)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid x-academic-session header. Expected YYYY-YYYY format.',
      });
    }

    req.academicSession = sessionLabel;

    let legacyAcademicSession = null;
    try {
      legacyAcademicSession = await findLegacySession(req);
    } catch (error) {
      return next(error);
    }

    // Also persist in AsyncLocalStorage so context-model proxies and
    // utilities can access it without passing `req` around.
    setRequestContext({ academicSession: sessionLabel, legacyAcademicSession });
  }

  return next();
};

/**
 * Helper to retrieve the current academic session from AsyncLocalStorage
 * (useful in models/utilities that don't have access to `req`).
 */
const getCurrentAcademicSession = () => {
  const ctx = getRequestContext();
  return ctx?.academicSession || null;
};

module.exports = {
  academicSessionMiddleware,
  getCurrentAcademicSession,
};
