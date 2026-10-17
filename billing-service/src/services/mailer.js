// Billing emails over the same SMTP settings the main server uses.
const nodemailer = require('nodemailer');

let transport = null;

function getTransport() {
  if (transport) return transport;
  if (!process.env.SMTP_HOST) return null;
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number.parseInt(process.env.SMTP_PORT || '587', 10),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transport;
}

// Tests pass a fake transport.
function setTransport(fake) {
  transport = fake;
}

/** Returns 'sent', or 'skipped' when SMTP isn't configured. Throws on a send failure. */
async function sendMail({ to, subject, text }) {
  const t = getTransport();
  if (!t) return 'skipped';
  await t.sendMail({
    from: process.env.BILLING_MAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
  });
  return 'sent';
}

module.exports = { sendMail, setTransport };
