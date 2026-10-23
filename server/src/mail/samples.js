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

const MODULES = [
  { name: 'Student Management', blurb: 'Admissions, profiles and class lists' },
  { name: 'Attendance Management', blurb: 'Daily attendance for every class' },
  { name: 'Timetable Management', blurb: 'Clash-free timetables and substitutions' },
  { name: 'Internal Exams', blurb: 'Marks entry and report cards' },
  { name: 'Capital & Finance', blurb: 'Fees, receipts and expenses' },
  { name: 'Library Management', blurb: 'Issue and return books' },
  { name: 'School Transport', blurb: 'Routes, stops and riders' },
  { name: 'Appointments', blurb: 'Parent and visitor meetings' }
];
const PLANNED = ['Student Management', 'Attendance Management', 'Internal Exams'];
const OTHERS = MODULES.map((m) => m.name).filter((n) => !PLANNED.includes(n));
const TRIAL = {
  name: SCHOOL, url: PAY, trialEndsOn: '2 Nov 2026', amount: '₹53,100.00'
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
  'workspace-closure-requested': () => templates.workspaceClosureRequested({
    schoolName: SCHOOL,
    name: 'Anita Sharma',
    exportUntil: '20 Nov 2026',
    deleteAfter: '19 Jan 2027',
    url: `${APP}/#/account-settings`
  }),
  'workspace-closure-alert': () => templates.workspaceClosureAlert({
    tenantName: SCHOOL,
    tenantSlug: 'redrose',
    requestedBy: 'Anita Sharma',
    requestedByEmail: 'principal@redrose.edu.in',
    exportUntil: '20 Nov 2026',
    deleteAfter: '19 Jan 2027',
    time: '21 Oct 2026, 10:42 am IST'
  }),
  'workspace-archive-ready': () => templates.workspaceArchiveReady({
    schoolName: SCHOOL,
    name: 'Anita Sharma',
    url: 'https://api.capabble.cloud/api/workspace-archives/6716f0c2a1b2c3d4e5f60718/download?exp=1&sig=sample',
    linkExpiresOn: '28 Oct 2026',
    exportUntil: '20 Nov 2026',
    settingsUrl: `${APP}/#/account-settings`
  }),
  'workspace-deletion-notice': () => templates.workspaceDeletionNotice({
    schoolName: SCHOOL,
    name: 'Anita Sharma',
    deleteAfter: '19 Jan 2027',
    supportEmail: 'support@capabble.cloud'
  }),
  'backup-failed': () => templates.backupFailed({
    runId: '2026-10-22T0200-3f9a',
    status: 'partial',
    environment: 'sems_central',
    time: '22 Oct 2026, 2:00 am IST',
    failures: [{ label: 'tenant:redrose', error: 'mongodump exited with 1: connection refused' }]
  }),
  'workspace-purge-due': () => templates.workspacePurgeDue({
    workspaces: [{ name: SCHOOL, slug: 'redrose', dueAt: '19 Jan 2027' }],
    adminUrl: 'https://admin.capabble.cloud/workspace-data'
  }),
  'demo-request-alert': () => templates.demoRequestAlert({
    name: 'Anita Sharma',
    institution: SCHOOL,
    role: 'Principal',
    email: 'principal@redrose.edu.in',
    phone: '+91 98123 45678',
    location: 'Rohtak, Haryana',
    studentCount: '500–1,000',
    modules: ['Student Management', 'Capital & Finance', 'Timetable Management'],
    preferredTime: 'Weekday afternoons',
    message: 'We are moving off spreadsheets before the new session. Fee collection is our biggest pain.',
    time: '19 Oct 2026, 10:42 am IST',
    adminUrl: 'https://admin.capabble.cloud/demo-requests'
  }),
  'demo-request-received': () => templates.demoRequestReceived({ name: 'Anita Sharma', institution: SCHOOL }),
  'appointment-confirmed': () => templates.appointmentUpdate({
    schoolName: SCHOOL,
    subject: 'Meeting confirmed: APT-0142',
    body: 'Your meeting with Ms Rao is confirmed for Tue, 20 Oct 2026 at 11:30 am. Venue: Staff room. '
      + 'Please carry this reference number: APT-0142.'
  }),
  'calendar-event': () => templates.calendarEvent({
    schoolName: SCHOOL,
    change: 'published',
    title: 'Annual Day',
    when: 'Fri 14 Nov, 9:00 am',
    venue: 'School auditorium',
    description: 'Families are welcome from 9 am. Seating is first come, first served.',
    parts: [
      { forWhom: 'For Riya', instructions: 'Send Riya in white uniform by 8 am for the rehearsal.' },
      { forWhom: 'For Aarav', instructions: 'Pick Aarav up at 12:30 pm from the main gate.' }
    ],
    url: 'https://school.capabble.cloud/?tenant=demo#/portal/calendar',
    unsubscribeUrl: 'https://api.capabble.cloud/api/mail/unsubscribe/sample',
    replyToSchool: true
  }),
  'calendar-cancelled': () => templates.calendarEvent({
    schoolName: SCHOOL,
    change: 'cancelled',
    title: 'Sports Day',
    when: 'Sat 22 Nov',
    reason: 'Rain is forecast. A new date will follow.',
    url: 'https://school.capabble.cloud/?tenant=demo#/portal/calendar'
  }),
  'mail-settings-test': () => templates.mailSettingsTest({ schoolName: SCHOOL, fromEmail: 'office@greenfield.edu.in' }),
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
  'trial-invite': () => templates.trialInvite({
    name: SCHOOL, url: `${APP}/#/get-started`, trialDays: 14, allModules: MODULES
  }),
  'trial-started': () => templates.trialStarted({
    ...TRIAL, interval: 'year', planned: PLANNED, allModules: MODULES, reminderOn: '26 Oct 2026', noticeOn: '1 Nov 2026', autopay: true
  }),
  'trial-midpoint': () => templates.trialMidpoint({
    name: SCHOOL, url: PAY, daysLeft: 7, others: OTHERS
  }),
  'trial-ending-7': () => templates.trialEnding({
    ...TRIAL, daysLeft: 7, planned: PLANNED, others: OTHERS, autopay: true
  }),
  'trial-ending-3': () => templates.trialEnding({
    ...TRIAL, daysLeft: 3, planned: PLANNED, others: OTHERS, autopay: false
  }),
  'legacy-trial-choose-plan': () => templates.legacyTrialChoosePlan({
    name: SCHOOL, url: PAY, daysLeft: 14, trialEndsOn: TRIAL.trialEndsOn, allModules: MODULES
  }),
  'pre-debit-notice': () => templates.preDebitNotice({
    name: SCHOOL, url: PAY, amount: TRIAL.amount, chargeOn: TRIAL.trialEndsOn, method: 'UPI AutoPay'
  }),
  'trial-converted': () => templates.trialConverted({
    name: SCHOOL, url: PAY, planned: PLANNED, others: OTHERS
  }),
  'trial-charge-failed': () => templates.trialChargeFailed({
    name: SCHOOL, url: PAY, amount: TRIAL.amount, graceEndsOn: '9 Nov 2026'
  }),
  'trial-canceled': () => templates.trialCanceled({ name: SCHOOL, url: PAY, trialEndsOn: TRIAL.trialEndsOn }),
  suspended: () => templates.accessEmail({ variant: 'suspended', name: SCHOOL, date: '9 Nov 2026', url: PAY })
};

module.exports = { samples };
