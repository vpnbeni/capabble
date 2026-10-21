// Checks the SMTP login, then sends sample emails to one address.
//   npm run mail:test -- --to you@example.com                 every email
//   npm run mail:test -- --to you@example.com --only signup-code
//   npm run mail:test -- --verify                             log in only, send nothing
require('dotenv').config();
const { sendMail, verifyMailer } = require('../../src/utils/mailer');
const { samples } = require('../../src/mail/samples');

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : null;
};

const run = async () => {
  const server = await verifyMailer();
  console.log(`[mail:test] signed in to ${server.host}:${server.port} as sender ${server.from}`);
  if (process.argv.includes('--verify')) return;

  const to = arg('--to');
  if (!to) throw new Error('Pass --to <address> (or --verify to only check the login).');
  const only = arg('--only');
  const names = only ? [only] : Object.keys(samples);
  const unknown = names.find((name) => !samples[name]);
  if (unknown) throw new Error(`No email called "${unknown}". Choose from: ${Object.keys(samples).join(', ')}`);
  // One at a time keeps within the mailbox's sending rate.
  await names.reduce((previous, name) => previous.then(async () => {
    const info = await sendMail({ to, ...samples[name]() });
    console.log(`[mail:test] sent ${name} → ${to} (${info.messageId})`);
  }), Promise.resolve());
};

run().catch((error) => {
  console.error('[mail:test] failed:', error.message);
  process.exitCode = 1;
});
