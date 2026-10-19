/* eslint-disable max-len -- email HTML needs long inline-styled lines */
/*
 * The one Capabble email layout. Every template builds a content object and renderEmail turns
 * it into { html, text }, so all platform mail looks the same and always has a plain-text part.
 *
 * Email HTML rules: tables for layout, inline styles only, no web fonts, no CSS variables,
 * and the logo is an inline attachment (cid:), so it shows even when remote images are blocked.
 * Colours are the light-theme tokens from client/src/styles/capabble/tokens.css.
 */
const { LOGO_CID } = require('./brand');

const C = {
  bg: '#F4F5F6',
  surface: '#FFFFFF',
  sunken: '#EDEFF0',
  border: '#E3E6E8',
  ink: '#191B1C',
  muted: '#595F61',
  subtle: '#666D70',
  accent: '#2458AA',
  warningSoft: '#FFFBEB',
  warningBorder: '#FDE68A',
  warningInk: '#B45309'
};

// Single quotes inside: these go into style="…" attributes.
const FONT = '-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif';
const MONO = '\'SFMono-Regular\', Menlo, Consolas, \'Liberation Mono\', monospace';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;'
}[char]));

/*
 * A paragraph is a string or an array of parts, where a part is a string or { strong: '…' }.
 * That is all the inline formatting templates need, and it keeps every value escaped.
 */
const partsOf = (paragraph) => (Array.isArray(paragraph) ? paragraph : [paragraph]);
const paragraphHtml = (paragraph, strongColor = C.ink) => partsOf(paragraph)
  .map((part) => (part && typeof part === 'object'
    ? `<strong style="color:${strongColor};font-weight:600;">${escapeHtml(part.strong)}</strong>`
    : escapeHtml(part)))
  .join('');
const paragraphText = (paragraph) => partsOf(paragraph)
  .map((part) => (part && typeof part === 'object' ? part.strong : String(part ?? '')))
  .join('');

const p = (html, extra = '') => (
  `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:24px;color:${C.muted};${extra}">${html}</p>`
);

const codeBlock = (code) => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;">
    <tr>
      <td style="background:${C.sunken};border-radius:10px;padding:14px 24px;font-family:${MONO};font-size:30px;line-height:36px;letter-spacing:8px;font-weight:700;color:${C.ink};">${escapeHtml(code)}</td>
    </tr>
  </table>`;

const buttonBlock = ({ label, url }) => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;">
    <tr>
      <td style="border-radius:8px;background:${C.accent};">
        <a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>
  ${p(`If the button doesn’t work, copy this link into your browser:<br><a href="${escapeHtml(url)}" style="color:${C.accent};word-break:break-all;">${escapeHtml(url)}</a>`, `font-size:13px;line-height:20px;color:${C.subtle};`)}`;

const detailCell = (i, extra) => `padding:10px 14px;${i ? `border-top:1px solid ${C.border};` : ''}font-family:${FONT};font-size:14px;line-height:20px;${extra}`;

const detailsBlock = (rows) => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:4px 0 20px;border:1px solid ${C.border};border-radius:10px;border-collapse:separate;">
    ${rows.map(([label, value], i) => `
    <tr>
      <td style="${detailCell(i, `color:${C.subtle};width:40%;`)}">${escapeHtml(label)}</td>
      <td style="${detailCell(i, `color:${C.ink};font-weight:600;`)}">${escapeHtml(value)}</td>
    </tr>`).join('')}
  </table>`;

const noticeBlock = (paragraph) => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:4px 0 20px;">
    <tr>
      <td style="background:${C.warningSoft};border:1px solid ${C.warningBorder};border-radius:10px;padding:12px 14px;font-family:${FONT};font-size:14px;line-height:22px;color:${C.warningInk};">${paragraphHtml(paragraph, C.warningInk)}</td>
    </tr>
  </table>`;

const footerLine = () => (process.env.MAIL_REPLY_TO
  ? 'Questions? Reply to this email and we’ll help.'
  : 'This mailbox isn’t monitored, so please don’t reply to this email.');

/**
 * @param {object} content
 * @param {string} content.subject       Used as the HTML title.
 * @param {string} content.preheader     Inbox preview text (hidden in the body).
 * @param {string} [content.context]     Small label above the heading, e.g. the school's name.
 * @param {string} content.heading
 * @param {Array}  [content.intro]       Paragraphs before the main block.
 * @param {string} [content.code]        A one-time code, shown large.
 * @param {object} [content.button]      { label, url }
 * @param {Array}  [content.details]     [[label, value], …]
 * @param {*}      [content.notice]      One highlighted paragraph (warnings).
 * @param {Array}  [content.outro]       Paragraphs after the main block.
 * @param {string} [content.footnote]    Why the reader got this email.
 */
const renderEmail = (content) => {
  const {
    subject, preheader, context, heading, intro = [], code, button, details, notice, outro = [], footnote
  } = content;
  const site = process.env.MAIL_SITE_URL || 'https://capabble.cloud';
  const siteLabel = site.replace(/^https?:\/\//, '').replace(/\/$/, '');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg};">${escapeHtml(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${C.bg};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;">
        <tr>
          <td style="padding:0 4px 20px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align:middle;padding-right:10px;"><img src="cid:${LOGO_CID}" width="32" height="32" alt="" style="display:block;border:0;width:32px;height:32px;"></td>
                <td style="vertical-align:middle;font-family:${FONT};font-size:20px;line-height:24px;font-weight:700;color:${C.ink};letter-spacing:-0.2px;">Capa<span style="color:${C.accent};">bb</span>le</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:${C.surface};border:1px solid ${C.border};border-radius:14px;padding:32px 32px 16px;">
            ${context ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:13px;line-height:18px;font-weight:600;color:${C.accent};">${escapeHtml(context)}</p>` : ''}
            <h1 style="margin:0 0 16px;font-family:${FONT};font-size:22px;line-height:30px;font-weight:700;color:${C.ink};">${escapeHtml(heading)}</h1>
            ${intro.map((para) => p(paragraphHtml(para))).join('')}
            ${code ? codeBlock(code) : ''}
            ${details && details.length ? detailsBlock(details) : ''}
            ${notice ? noticeBlock(notice) : ''}
            ${button ? buttonBlock(button) : ''}
            ${outro.map((para) => p(paragraphHtml(para))).join('')}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 4px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${C.subtle};">
            ${footnote ? `<p style="margin:0 0 8px;">${escapeHtml(footnote)}</p>` : ''}
            <p style="margin:0 0 8px;">${escapeHtml(footerLine())}</p>
            <p style="margin:0;">Capabble · School management, one module at a time · <a href="${escapeHtml(site)}" style="color:${C.subtle};">${escapeHtml(siteLabel)}</a></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const text = [
    context,
    heading,
    '',
    ...intro.map(paragraphText).flatMap((line) => [line, '']),
    ...(code ? [code, ''] : []),
    ...(details && details.length ? [...details.map(([label, value]) => `${label}: ${value}`), ''] : []),
    ...(notice ? [paragraphText(notice), ''] : []),
    ...(button ? [`${button.label}: ${button.url}`, ''] : []),
    ...outro.map(paragraphText).flatMap((line) => [line, '']),
    '—',
    ...(footnote ? [footnote] : []),
    footerLine(),
    `Capabble · ${siteLabel}`
  ].filter((line) => line !== undefined && line !== null).join('\n');

  return { subject, html, text };
};

module.exports = { renderEmail, escapeHtml };
