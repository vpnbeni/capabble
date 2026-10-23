/**
 * Calendar date sources from other modules.
 *
 * A module adds dated items to the calendar by exporting `calendar` from its
 * module object (modules/<key>/index.js):
 *
 *   calendar: [{
 *     key: 'exmcl.datesheets',
 *     layer: 'exams',                       // a key of LAYERS in ./constants
 *     features: ['exmcl_datesheets'],       // any one on, or the source is skipped
 *     audiences: ['staff', 'parent', 'student'],
 *     list: async (ctx) => [item(...)]      // ctx: see collect()
 *   }]
 *
 * Items are read-only on the calendar and link back to the module, which owns
 * them and sends any notifications about them. A failing or slow source is
 * skipped and reported, never breaking the calendar.
 */
const schoolDate = require('../../utils/schoolDate');

const SOURCE_TIMEOUT_MS = 4000;

/** A calendar item. Dates are school days; times are school-local HH:MM. */
const item = ({
  id, source, layer, title, startDate, endDate, startTime, endTime,
  link = '', detail = '', venue = '', child = null, tone, tentative = false
}) => ({
  id,
  source,
  layer,
  title: String(title || '').slice(0, 200),
  startDate,
  endDate: endDate && endDate >= startDate ? endDate : startDate,
  allDay: !startTime,
  startTime: startTime || null,
  endTime: startTime ? endTime || null : null,
  venue,
  detail: String(detail || '').slice(0, 500),
  link,
  child,
  tone: tone || null,
  tentative,
  readOnly: true
});

/** Date bounds for a Date-typed field covering [from, to] school days. */
const dateFieldRange = (from, to, timeZone) => ({
  $gte: schoolDate.startOfDay(from, timeZone),
  $lt: schoolDate.startOfDay(schoolDate.addDays(to, 1), timeZone)
});

const providers = () => {
  // Required lazily: modules/index requires this module's own index.
  // eslint-disable-next-line global-require
  const { modules } = require('../index');
  return modules.flatMap((mod) => (mod.calendar || []).map((source) => ({ module: mod.key, ...source })));
};

const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
  promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
});

/**
 * Items from every source this viewer may see in [from, to].
 * ctx: { models, viewer, user, rbac, from, to, timeZone, featureOn(key), portal, layers? }
 * Returns { items, failed: [sourceKey] }.
 */
const collect = async (ctx) => {
  const wanted = ctx.layers && ctx.layers.length ? new Set(ctx.layers) : null;
  const sources = providers().filter((source) => (
    (!wanted || wanted.has(source.layer))
    && (source.audiences || ['staff']).includes(ctx.viewer.kind)
    && (!source.features?.length || source.features.some((key) => ctx.featureOn(key)))
  ));
  const failed = [];
  const results = await Promise.all(sources.map(async (source) => {
    try {
      const items = await withTimeout(Promise.resolve(source.list(ctx)), SOURCE_TIMEOUT_MS);
      return (items || []).map((entry) => ({
        ...entry, layer: entry.layer || source.layer, source: entry.source || source.key
      }));
    } catch (error) {
      console.warn(`[clndr] source ${source.key} failed: ${error.message}`);
      failed.push(source.key);
      return [];
    }
  }));
  return { items: results.flat().filter((entry) => entry.startDate <= ctx.to && entry.endDate >= ctx.from), failed };
};

module.exports = { item, collect, providers, dateFieldRange };
