const { normalizeTenantFeatureToggles } = require('../../constants/tenantFeatures');
const { runSearch, parseSearchParams } = require('./service');

/**
 * GET /api/search?q=&types=student,staff&limit=5
 * Fans out to every record provider the tenant can access and returns grouped hits.
 */
const globalSearch = async (req, res, next) => {
  try {
    const params = parseSearchParams(req.query);
    if (!params.q) {
      return res.json({ success: true, data: { q: '', groups: [], tookMs: 0 } });
    }

    const data = await runSearch({
      ...params,
      models: req.models || {},
      toggles: normalizeTenantFeatureToggles(req.tenant?.featureToggles),
      role: req.user?.role
    });

    res.set('Cache-Control', 'private, max-age=15');
    return res.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

module.exports = { globalSearch };
