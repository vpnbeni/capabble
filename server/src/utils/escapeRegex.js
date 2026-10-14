/**
 * Escape a user-supplied string so it can be embedded in a RegExp literally.
 * @param {string} value
 * @returns {string}
 */
const escapeRegex = (value) => String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { escapeRegex };
