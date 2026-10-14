/**
 * Typo-tolerant fallback for the global search ("annuj" → "Anuj").
 *
 * Runs only when the exact pass finds nothing. Candidates are fetched with an
 * n-gram regex (any shared 3-gram, or 2-gram for short words), then filtered and
 * ranked by edit distance per word — the same idea as Postgres pg_trgm.
 */
const { escapeRegex } = require('../../utils/escapeRegex');

const MIN_FUZZY_TOKEN = 4;
const MAX_GRAMS = 12;

/** Typos allowed per word: 1 for short words, 2 for medium, 3 for long. */
const maxEditsFor = (length) => {
  if (length <= 5) return 1;
  if (length <= 9) return 2;
  return 3;
};

/**
 * Optimal-string-alignment distance (Levenshtein + adjacent transpositions),
 * bailing out once the distance must exceed `max`.
 */
const editDistance = (a, b, max = Infinity) => {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows = [];
  for (let i = 0; i <= a.length; i += 1) {
    rows[i] = [i];
  }
  for (let j = 1; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, rows[i - 2][j - 2] + 1);
      }
      rows[i][j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
  }
  return rows[a.length][b.length];
};

const tokenize = (value) => String(value || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** Query words worth typo-matching; null when nothing is long enough to fuzz safely. */
const fuzzyTokens = (q) => {
  const tokens = tokenize(q);
  return tokens.some((token) => token.length >= MIN_FUZZY_TOKEN) ? tokens : null;
};

/** Regex source matching any n-gram of the long-enough tokens, e.g. "annuj" → "ann|nnu|nuj". */
const buildGramPattern = (tokens) => {
  const grams = new Set();
  tokens.filter((token) => token.length >= MIN_FUZZY_TOKEN).forEach((token) => {
    const size = token.length >= 5 ? 3 : 2;
    for (let i = 0; i + size <= token.length; i += 1) grams.add(token.slice(i, i + size));
  });
  return [...grams].slice(0, MAX_GRAMS).map(escapeRegex).join('|');
};

/** Fewest edits for `token` to match one of `words`; also tries word prefixes so "anuj" finds "anuja". */
const bestWordDistance = (token, words) => {
  const max = maxEditsFor(token.length);
  return words.reduce((best, word) => {
    if (best === 0) return best;
    const whole = editDistance(token, word, max);
    const prefix = word.length > token.length ? editDistance(token, word.slice(0, token.length), max) + 1 : Infinity;
    return Math.min(best, whole, prefix);
  }, Infinity);
};

/**
 * Total edits needed for every query token to match some word in the doc's name fields,
 * or null when any token is too far off. Short tokens must prefix-match a word exactly.
 */
const fuzzyDistance = (tokens, words) => {
  const distances = tokens.map((token) => {
    if (token.length < MIN_FUZZY_TOKEN) return words.some((word) => word.startsWith(token)) ? 0 : null;
    const best = bestWordDistance(token, words);
    return best <= maxEditsFor(token.length) ? best : null;
  });
  return distances.includes(null) ? null : distances.reduce((sum, distance) => sum + distance, 0);
};

module.exports = {
  editDistance,
  maxEditsFor,
  tokenize,
  fuzzyTokens,
  buildGramPattern,
  fuzzyDistance,
  MIN_FUZZY_TOKEN
};
