/**
 * Escapes `<` as `&lt;` in every string of req.body, req.query and req.params,
 * keys included, so user input can't open an HTML tag when it is shown later.
 *
 * Same behaviour as the retired `xss-clean` package (its `inHTMLData` filter),
 * kept in-house because that package is no longer maintained.
 */
const escapeHtmlData = (value) => {
  if (typeof value === 'string') return value.replace(/</g, '&lt;');
  if (Array.isArray(value)) return value.map(escapeHtmlData);
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach((key) => {
      out[escapeHtmlData(key)] = escapeHtmlData(value[key]);
    });
    return out;
  }
  return value;
};

const clean = (data) => {
  if (typeof data === 'string') return escapeHtmlData(data).trim();
  return escapeHtmlData(data);
};

const xssClean = () => (req, res, next) => {
  if (req.body) req.body = clean(req.body);
  if (req.query) req.query = clean(req.query);
  if (req.params) req.params = clean(req.params);
  next();
};

module.exports = { xssClean, clean };
