const nodemailer = require('nodemailer');
const { LOGO_CID, LOGO_PATH } = require('../mail/brand');

/*
 * Every platform email goes out through here, from one mailbox (no-reply@capabble.cloud on
 * Hostinger in production). Templates live in src/mail; this file only delivers.
 *
 * Env: SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM, MAIL_REPLY_TO.
 * The older EMAIL_* names still work as a fallback.
 */

const DEFAULT_FROM_NAME = 'Capabble';

let cachedTransporter = null;
let cachedConfigKey = null;

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
};

const clean = (value) => String(value || '').trim();

/** "no-reply@x" → "Capabble <no-reply@x>"; a value that already has a name is kept. */
const withDisplayName = (from) => (from.includes('<') ? from : `${DEFAULT_FROM_NAME} <${from}>`);

const getSmtpConfig = () => {
  const host = clean(process.env.SMTP_HOST || process.env.EMAIL_HOST);
  const port = Number.parseInt(process.env.SMTP_PORT || process.env.EMAIL_PORT || '587', 10);
  const user = clean(process.env.SMTP_USER || process.env.EMAIL_USER);
  const pass = clean(process.env.SMTP_PASS || process.env.EMAIL_PASS);
  const secure = parseBoolean(process.env.SMTP_SECURE, port === 465);
  const from = clean(process.env.SMTP_FROM || process.env.EMAIL_FROM || user);
  const replyTo = clean(process.env.MAIL_REPLY_TO) || undefined;

  if (!host || !user || !pass || !from || !Number.isFinite(port) || port <= 0) {
    throw new Error(
      'SMTP configuration is incomplete. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM '
        + '(or EMAIL_* equivalents).'
    );
  }

  return {
    host,
    port,
    secure,
    user,
    pass,
    from: withDisplayName(from),
    replyTo
  };
};

const getTransporter = () => {
  const config = getSmtpConfig();
  const configKey = JSON.stringify({
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.user,
    pass: config.pass
  });

  if (cachedTransporter && cachedConfigKey === configKey) {
    return { transporter: cachedTransporter, config };
  }

  cachedTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass
    },
    // Fail fast instead of holding a request open when the mail server is unreachable.
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000
  });
  cachedConfigKey = configKey;

  return { transporter: cachedTransporter, config };
};

/** Templates reference the logo as cid:capabble-logo; attach it only when it is used. */
const logoAttachments = (html) => (
  html && html.includes(`cid:${LOGO_CID}`)
    ? [{ filename: 'capabble.png', path: LOGO_PATH, cid: LOGO_CID, contentDisposition: 'inline' }]
    : []
);

const sendMail = async ({ to, subject, text, html, replyTo }) => {
  if (!to || !subject || (!text && !html)) {
    throw new Error('sendMail requires to, subject, and text or html');
  }

  const { transporter, config } = getTransporter();

  return transporter.sendMail({
    from: config.from,
    replyTo: replyTo || config.replyTo,
    to,
    subject,
    text,
    html,
    attachments: logoAttachments(html)
  });
};

const isMailConfigured = () => {
  try {
    getSmtpConfig();
    return true;
  } catch {
    return false;
  }
};

/** Logs in to the mail server without sending anything. Used at startup and by mail:test. */
const verifyMailer = async () => {
  const { transporter, config } = getTransporter();
  await transporter.verify();
  return { host: config.host, port: config.port, from: config.from };
};

module.exports = {
  sendMail,
  verifyMailer,
  isMailConfigured
};
