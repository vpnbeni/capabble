/**
 * Staff imported without an email get a generated placeholder address on the
 * reserved `.local` domain (see teacherController `buildGeneratedImportEmail`).
 * These are never real mailboxes and must not be used for logins or invites.
 */
const PLACEHOLDER_EMAIL_DOMAIN = 'capabble.local';

const isPlaceholderEmail = (email) => /\.local$/i.test(String(email || '').trim());

const realEmailOrEmpty = (email) => (isPlaceholderEmail(email) ? '' : String(email || '').trim());

module.exports = { PLACEHOLDER_EMAIL_DOMAIN, isPlaceholderEmail, realEmailOrEmpty };
