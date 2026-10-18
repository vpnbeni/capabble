// Billing emails go out through the server's mailer (SMTP_* or EMAIL_* settings).
const serverMailer = require('../../../utils/mailer');

let transport = null;

// Tests pass a fake transport.
function setTransport(fake) {
  transport = fake;
}

const isNotConfigured = (error) => /configuration is incomplete/i.test(String(error?.message || ''));

/** Returns 'sent', or 'skipped' when mail isn't set up. Throws on a send failure. */
async function sendMail({ to, subject, text }) {
  if (transport) {
    await transport.sendMail({ to, subject, text });
    return 'sent';
  }
  try {
    await serverMailer.sendMail({ to, subject, text });
    return 'sent';
  } catch (error) {
    if (isNotConfigured(error)) return 'skipped';
    throw error;
  }
}

module.exports = { sendMail, setTransport };
