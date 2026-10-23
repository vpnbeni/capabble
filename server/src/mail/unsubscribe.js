/* eslint-disable max-len -- page copy and inline styles read better unwrapped */
/**
 * Unsubscribe links in school emails: /api/mail/unsubscribe/<token>.
 *
 * The token names the school, the login and the email category, signed with
 * MAIL_LINK_SECRET (or JWT_SECRET). Opening the link shows a confirm button,
 * because mail scanners open links on their own; the button (or a mail app's
 * one-click unsubscribe, RFC 8058) POSTs and turns that category off for that
 * login. In-app notifications keep arriving.
 */
const crypto = require('crypto');
const express = require('express');
const { getPlatformModels } = require('../tenancy/platformModels');
const { getTenantConnectionAndModels } = require('../tenancy/tenantConnectionManager');
const { escapeHtml } = require('./layout');

const CATEGORY_LABELS = { calendar: 'calendar emails' };

const secret = () => String(process.env.MAIL_LINK_SECRET || process.env.JWT_SECRET || '').trim();
const apiUrl = () => String(process.env.API_URL || `http://localhost:${process.env.PORT || 5000}/api`)
  .replace(/\/+$/, '');

const sign = (payload) => crypto.createHmac('sha256', `${secret()}:mail-unsubscribe`)
  .update(payload)
  .digest('base64url');

const tokenFor = ({ slug, userId, category = 'calendar' }) => {
  const payload = Buffer.from(JSON.stringify({ t: slug, u: String(userId), c: category })).toString('base64url');
  return `${payload}.${sign(payload)}`;
};

const unsubscribeUrl = (opts) => `${apiUrl()}/mail/unsubscribe/${tokenFor(opts)}`;

/** The token's contents, or null when it is malformed or the signature is wrong. */
const readToken = (token) => {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig || !secret()) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data?.t && data?.u && data?.c ? { slug: data.t, userId: data.u, category: data.c } : null;
  } catch (error) {
    return null;
  }
};

const page = (title, body, form = '') => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#F4F5F6;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1B1F21;">
<main style="max-width:480px;margin:48px auto;padding:32px;background:#FFFFFF;border:1px solid #E3E6E8;border-radius:12px;">
<h1 style="margin:0 0 12px;font-size:22px;line-height:30px;">${escapeHtml(title)}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:24px;color:#4A5257;">${escapeHtml(body)}</p>
${form}
<p style="margin:24px 0 0;font-size:12px;color:#7A8388;">Capabble</p>
</main></body></html>`;

const optOut = async ({ slug, userId, category }) => {
  const tenant = await getPlatformModels().Tenant.findOne({ slug }).select('dbName').lean();
  if (!tenant) return false;
  const { User } = getTenantConnectionAndModels(tenant.dbName, ['User']).models;
  const result = await User.updateOne({ _id: userId }, { $addToSet: { emailOptOut: category } });
  return result.matchedCount > 0;
};

const router = express.Router();
router.use(express.urlencoded({ extended: false, limit: '2kb' }));

router.get('/:token', (req, res) => {
  const data = readToken(req.params.token);
  if (!data) return res.status(404).type('html').send(page('Link not valid', 'This unsubscribe link is not valid. You can turn emails off from your account in Capabble.'));
  const what = CATEGORY_LABELS[data.category] || 'these emails';
  return res.type('html').send(page(
    `Stop ${what}?`,
    `You'll stop getting ${what} from your school. Notices still show in the app.`,
    `<form method="post"><button type="submit" style="font:600 14px/20px inherit;padding:10px 16px;border:0;border-radius:6px;background:#2458AA;color:#FFFFFF;cursor:pointer;">Stop ${escapeHtml(what)}</button></form>`
  ));
});

router.post('/:token', async (req, res) => {
  const data = readToken(req.params.token);
  if (!data) return res.status(404).type('html').send(page('Link not valid', 'This unsubscribe link is not valid.'));
  try {
    await optOut(data);
  } catch (error) {
    console.error(`[mail] unsubscribe failed: ${error.message}`);
    return res.status(500).type('html').send(page('Something went wrong', 'We could not update your email settings. Please try again later.'));
  }
  const what = CATEGORY_LABELS[data.category] || 'these emails';
  return res.type('html').send(page('You’re unsubscribed', `You won't get ${what} from your school any more. Notices still show in the app.`));
});

module.exports = { router, tokenFor, readToken, unsubscribeUrl };
