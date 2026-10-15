/**
 * Credentials handed out by the school: invite links and temporary passwords.
 */
const crypto = require('crypto');
const { hashValue } = require('./session');
const { sendMail } = require('../utils/mailer');

const INVITE_TTL_HOURS = Number.parseInt(process.env.INVITE_TTL_HOURS || '', 10) || 72;

// No look-alike characters (0/O, 1/l/I) so it can be read off a printed slip.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';

const pick = (alphabet, count) => Array.from({ length: count }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');

/** e.g. `Kmt7-Rx4p-9Vhz`: upper, lower, digit and symbol, as the password rule requires. */
const generateTemporaryPassword = () => [
  pick(UPPER, 1) + pick(LOWER, 2) + pick(DIGITS, 1),
  pick(UPPER, 1) + pick(LOWER, 1) + pick(DIGITS, 1) + pick(LOWER, 1),
  pick(DIGITS, 1) + pick(UPPER, 1) + pick(LOWER, 2)
].join('-');

const isAllowedClientOrigin = (origin) => {
  try {
    const { hostname, protocol } = new URL(origin);
    if (!['http:', 'https:'].includes(protocol)) return false;
    const root = (process.env.ROOT_APP_DOMAIN || 'school.capabble.cloud').toLowerCase();
    const explicit = [process.env.CLIENT_URL, ...(process.env.CLIENT_URLS || '').split(',')]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    if (explicit.includes(origin)) return true;
    if (hostname === root || hostname.endsWith(`.${root}`)) return true;
    return process.env.NODE_ENV !== 'production' && (hostname === 'localhost' || hostname === '127.0.0.1');
  } catch (error) {
    return false;
  }
};

/** Web-app origin for links in emails: the admin's own origin when trusted. */
const resolveClientOrigin = (req) => {
  const origin = req.get?.('origin');
  if (origin && isAllowedClientOrigin(origin)) return origin.replace(/\/+$/, '');
  return String(process.env.CLIENT_URL || 'https://school.capabble.cloud').replace(/\/+$/, '');
};

/** Put a fresh invite on the user (caller saves) and return the raw token. */
const createInvite = (user) => {
  const token = crypto.randomBytes(32).toString('base64url');
  user.inviteTokenHash = hashValue(token);
  user.inviteExpiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);
  return token;
};

const buildInviteUrl = (req, token) => {
  const school = encodeURIComponent(req.tenant?.slug || '');
  return `${resolveClientOrigin(req)}/#/accept-invite?school=${school}&token=${encodeURIComponent(token)}`;
};

const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;'
}[char]));

const sendInviteEmail = async ({ req, user, inviteUrl }) => {
  if (!user.email) return false;
  const schoolName = req.tenant?.name || 'your school';
  const greeting = user.name ? `Hello ${user.name},` : 'Hello,';
  const loginHint = user.username ? `Your login ID is ${user.username}@${req.tenant?.slug}.` : `Sign in with ${user.email}.`;

  await sendMail({
    to: user.email,
    subject: `Set up your ${schoolName} login`,
    text: [
      greeting,
      `${schoolName} has created a login for you. Open this link to choose your password:`,
      inviteUrl,
      loginHint,
      `The link works once and expires in ${INVITE_TTL_HOURS} hours.`
    ].join('\n\n'),
    html: [
      '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;">',
      `<p>${escapeHtml(greeting)}</p>`,
      `<p>${escapeHtml(schoolName)} has created a login for you. Choose your password to get started:</p>`,
      `<p><a href="${escapeHtml(inviteUrl)}" style="display:inline-block;padding:10px 16px;background:#0f172a;color:#fff;`
        + 'border-radius:6px;text-decoration:none;">Set my password</a></p>',
      `<p>${escapeHtml(loginHint)}</p>`,
      `<p style="color:#475569;">The link works once and expires in ${INVITE_TTL_HOURS} hours.</p>`,
      '</div>'
    ].join('')
  });
  return true;
};

module.exports = {
  INVITE_TTL_HOURS,
  generateTemporaryPassword,
  createInvite,
  buildInviteUrl,
  sendInviteEmail
};
