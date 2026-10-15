const { normalizeTenantFeatureToggles } = require('../../constants/tenantFeatures');
const { runSearch, parseSearchParams } = require('./service');
const { buildSectionFilter } = require('../../rbac/scope');

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

    const can = (key) => Boolean(req.rbac?.has(key));
    // Finance staff search every student; a teacher limited to their sections
    // only finds students in those sections.
    const studentScope = can('cpitl.finance.view') ? null : await buildSectionFilter(req, 'stdnt.students.read');

    const data = await runSearch({
      ...params,
      models: req.models || {},
      toggles: normalizeTenantFeatureToggles(req.tenant?.featureToggles),
      can,
      scopes: { student: studentScope }
    });

    res.set('Cache-Control', 'private, max-age=15');
    return res.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

module.exports = { globalSearch };
