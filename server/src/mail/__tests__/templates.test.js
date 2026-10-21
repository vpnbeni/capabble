/* eslint-disable global-require, max-len -- each mailer test loads a fresh module with its own env */
const templates = require('../templates');
const { samples } = require('../samples');
const { LOGO_CID } = require('../brand');

describe('email templates', () => {
  it.each(Object.keys(samples))('%s has a subject, a branded HTML part and a text part', (name) => {
    const { subject, html, text } = samples[name]();
    expect(subject).toBeTruthy();
    expect(html).toContain(`cid:${LOGO_CID}`);
    expect(html).toContain('Capa<span');
    expect(text.length).toBeGreaterThan(20);
    // Old product name must never reach a customer.
    expect(`${subject}\n${html}\n${text}`).not.toMatch(/\bCntr\b/);
  });

  it('shows the one-time code in both parts and in the subject', () => {
    const { subject, html, text } = templates.signupCode({ schoolName: 'Alpha', code: '123456', minutes: 10 });
    expect(subject).toContain('123456');
    expect(html).toContain('123456');
    expect(text).toContain('123456');
    expect(text).toContain('10 minutes');
  });

  it('escapes values that come from users', () => {
    const { html, text } = templates.loginInvite({
      schoolName: '<script>alert(1)</script>',
      name: 'A "quoted" name',
      inviteUrl: 'https://school.capabble.cloud/#/accept-invite?token=a&b=1',
      loginHint: 'Sign in with x@y.in.',
      hours: 72
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('href="https://school.capabble.cloud/#/accept-invite?token=a&amp;b=1"');
    expect(text).toContain('<script>alert(1)</script>');
  });

  it('keeps the amount due line billing reminders rely on', () => {
    const { text } = templates.invoiceEmail({
      variant: 'issued', name: 'Alpha', invoiceNumber: 'CB2627-000001', amountDue: '₹100.00', dueDate: '1 Nov 2026', url: 'https://x'
    });
    expect(text).toMatch(/Amount due: ₹100\.00/);
  });
});

describe('mailer', () => {
  const env = { ...process.env };
  let sent;
  let createTransport;

  beforeEach(() => {
    jest.resetModules();
    sent = [];
    createTransport = jest.fn(() => ({ sendMail: async (m) => { sent.push(m); return { messageId: 'x' }; } }));
    jest.doMock('nodemailer', () => ({ createTransport }));
    Object.assign(process.env, {
      SMTP_HOST: 'smtp.hostinger.com',
      SMTP_PORT: '465',
      SMTP_USER: 'no-reply@capabble.cloud',
      SMTP_PASS: 'secret',
      SMTP_FROM: 'no-reply@capabble.cloud'
    });
    delete process.env.MAIL_REPLY_TO;
  });

  afterEach(() => {
    process.env = { ...env };
    jest.dontMock('nodemailer');
  });

  it('sends as "Capabble <no-reply@…>" over SSL on 465 and attaches the logo inline', async () => {
    const { sendMail } = require('../../utils/mailer');
    await sendMail({ to: 'a@b.in', ...samples['signup-code']() });
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.hostinger.com', port: 465, secure: true })
    );
    expect(sent[0].from).toBe('Capabble <no-reply@capabble.cloud>');
    expect(sent[0].attachments).toEqual([expect.objectContaining({ cid: LOGO_CID, contentDisposition: 'inline' })]);
  });

  it('keeps a display name given in SMTP_FROM and adds MAIL_REPLY_TO', async () => {
    process.env.SMTP_FROM = 'Capabble Team <no-reply@capabble.cloud>';
    process.env.MAIL_REPLY_TO = 'help@capabble.cloud';
    const { sendMail } = require('../../utils/mailer');
    await sendMail({ to: 'a@b.in', subject: 'Hi', text: 'Plain only' });
    expect(sent[0].from).toBe('Capabble Team <no-reply@capabble.cloud>');
    expect(sent[0].replyTo).toBe('help@capabble.cloud');
    expect(sent[0].attachments).toEqual([]);
  });
});
