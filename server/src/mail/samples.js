/*
 * One sample of every email, used by `npm run mail:preview`, `npm run mail:test` and the tests.
 * Keep it in step with templates.js: a new template gets a sample here.
 */
const templates = require('./templates');

const APP = process.env.CLIENT_URL || 'https://school.capabble.cloud';
const PAY = process.env.BILLING_APP_URL || `${APP}/#/billing`;
const SCHOOL = 'Red Rose Public School';
const INVOICE = {
  name: SCHOOL, invoiceNumber: 'CB2627-000014', amountDue: '₹29,500.00', dueDate: '2 Nov 2026', url: PAY
};

const samples = {
  'signup-code': () => templates.signupCode({ schoolName: SCHOOL, code: '482913', minutes: 10 }),
  'password-reset-code': () => templates.passwordResetCode({ code: '305817', minutes: 10 }),
  'email-verification-code': () => templates.emailVerificationCode({ code: '771204', minutes: 10 }),
  'login-invite': () => templates.loginInvite({
    schoolName: SCHOOL,
    name: 'Anita Sharma',
    inviteUrl: `${APP}/#/accept-invite?school=demo&token=sample`,
    loginHint: 'Sign in with anita.sharma@redrose.edu.in.',
    hours: 72
  }),
  'new-school-alert': () => templates.newSchoolAlert({
    tenantName: SCHOOL,
    tenantSlug: '06123456789',
    adminEmail: 'principal@redrose.edu.in',
    source: 'Public signup',
    time: '19 Oct 2026, 10:42 am IST'
  }),
  'appointment-confirmed': () => templates.appointmentUpdate({
    schoolName: SCHOOL,
    subject: 'Meeting confirmed: APT-0142',
    body: 'Your meeting with Ms Rao is confirmed for Tue, 20 Oct 2026 at 11:30 am. Venue: Staff room. '
      + 'Please carry this reference number: APT-0142.'
  }),
  'invoice-issued': () => templates.invoiceEmail({
    variant: 'issued', ...INVOICE
  }),
  'invoice-due-soon': () => templates.invoiceEmail({
    variant: 'due_soon', ...INVOICE
  }),
  'invoice-overdue': () => templates.invoiceEmail({
    variant: 'overdue', ...INVOICE
  }),
  'payment-received': () => templates.paymentReceived({
    name: SCHOOL,
    amount: '₹39,648.00',
    receiptNumber: 'RC2627-000001',
    invoiceNumber: 'CB2627-000001',
    paidOn: '19 Oct 2026',
    method: 'Netbanking',
    balanceDue: null,
    url: PAY
  }),
  'trial-ending': () => templates.accessEmail({ variant: 'trial_ending', name: SCHOOL, date: '25 Oct 2026', url: PAY }),
  'grandfather-ending': () => templates.accessEmail({
    variant: 'grandfather_ending', name: SCHOOL, date: '31 Mar 2027', url: PAY
  }),
  'grace-ending': () => templates.accessEmail({ variant: 'grace_ending', name: SCHOOL, date: '9 Nov 2026', url: PAY }),
  suspended: () => templates.accessEmail({ variant: 'suspended', name: SCHOOL, date: '9 Nov 2026', url: PAY })
};

module.exports = { samples };
