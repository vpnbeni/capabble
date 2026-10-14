const { escapeRegex } = require('../../utils/escapeRegex');
const { PROVIDERS } = require('./providers');

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 64;
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;
// Over-fetch so ranking can float exact/prefix hits above arbitrary substring hits.
const FETCH_MULTIPLIER = 4;
const QUERY_TIMEOUT_MS = 800;

const parseSearchParams = (query = {}) => {
  const rawQ = typeof query.q === 'string' ? query.q.trim().replace(/\s+/g, ' ') : '';
  const q = rawQ.length >= MIN_QUERY_LENGTH ? rawQ.slice(0, MAX_QUERY_LENGTH) : '';
  const parsedLimit = Number.parseInt(query.limit, 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), MAX_LIMIT) : DEFAULT_LIMIT;
  const types = typeof query.types === 'string' && query.types.trim()
    ? new Set(query.types.split(',').map((type) => type.trim()).filter(Boolean))
    : null;
  return { q, limit, types };
};

/** Build `{ $and: [base, { $or: [...] }] }` — nested so it never clashes with academicSessionPlugin's `$or`. */
const buildFilter = (provider, q) => {
  const escaped = escapeRegex(q);
  const { prefixUpper = [], prefix = [], contains = [] } = provider.fields;
  const clauses = [
    ...prefixUpper.map((field) => ({ [field]: { $regex: `^${escapeRegex(q.toUpperCase())}` } })),
    ...prefix.map((field) => ({ [field]: { $regex: `^${escaped}`, $options: 'i' } })),
    ...contains.map((field) => ({ [field]: { $regex: escaped, $options: 'i' } }))
  ];
  return { $and: [provider.baseFilter || {}, { $or: clauses }] };
};

const getPath = (doc, path) => path.split('.').reduce((value, key) => (value == null ? value : value[key]), doc);

/** Exact > prefix > word-start > substring, across every matched field. */
const scoreDoc = (provider, doc, q) => {
  const needle = q.toLowerCase();
  const { prefixUpper = [], prefix = [], contains = [] } = provider.fields;
  let best = 0;
  [...prefixUpper, ...prefix, ...contains].forEach((field) => {
    const value = getPath(doc, field);
    if (value == null || value === '') return;
    const hay = String(value).toLowerCase();
    let score = 0;
    if (hay === needle) score = 100;
    else if (hay.startsWith(needle)) score = 80;
    else if (hay.includes(` ${needle}`)) score = 60;
    else if (hay.includes(needle)) score = 40;
    if (score > best) best = score;
  });
  return best;
};

/** The provider's display fields plus every searched field, so ranking sees what matched. */
const buildSelect = (provider) => {
  const { prefixUpper = [], prefix = [], contains = [] } = provider.fields;
  const fields = [...new Set([...provider.select.split(/\s+/), ...prefixUpper, ...prefix, ...contains])];
  // Mongo rejects selecting both `a` and `a.b`; the parent already covers the child.
  return fields.filter((field) => !fields.some((other) => field.startsWith(`${other}.`))).join(' ');
};

const searchProvider = async (provider, ctx) => {
  const Model = ctx.models[provider.modelKey];
  const docs = await Model.find(buildFilter(provider, ctx.q))
    .select(buildSelect(provider))
    .sort(provider.sort || {})
    .limit(ctx.limit * FETCH_MULTIPLIER)
    .maxTimeMS(QUERY_TIMEOUT_MS)
    .lean();

  return docs
    .map((doc) => ({ doc, score: scoreDoc(provider, doc, ctx.q) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, ctx.limit)
    .map(({ doc, score }) => ({
      id: String(doc._id),
      type: provider.type,
      score,
      ...provider.map(doc, ctx)
    }));
};

const getActiveProviders = ({ models, toggles, role, types }) => PROVIDERS.filter((provider) => (
  (!types || types.has(provider.type))
  && models[provider.modelKey]
  && provider.enabled({ toggles, role })
));

const runSearch = async ({ q, limit, types, models, toggles, role }) => {
  const startedAt = Date.now();
  const ctx = { q, limit, models, toggles, role };
  const providers = getActiveProviders({ models, toggles, role, types });

  const settled = await Promise.allSettled(providers.map((provider) => searchProvider(provider, ctx)));

  const groups = [];
  settled.forEach((result, index) => {
    const provider = providers[index];
    if (result.status === 'rejected') {
      console.warn(`[search] provider "${provider.type}" failed:`, result.reason?.message || result.reason);
      return;
    }
    if (result.value.length) {
      groups.push({ type: provider.type, label: provider.label, items: result.value });
    }
  });

  // Groups whose best hit is strongest come first.
  groups.sort((left, right) => (right.items[0]?.score || 0) - (left.items[0]?.score || 0));

  return { q, groups, tookMs: Date.now() - startedAt };
};

module.exports = {
  parseSearchParams,
  buildFilter,
  buildSelect,
  scoreDoc,
  getActiveProviders,
  runSearch,
  MIN_QUERY_LENGTH,
  MAX_LIMIT
};
