/* eslint-disable max-len -- email copy reads better unwrapped */
/*
 * Every email Capabble sends. Each function returns { subject, html, text } for sendMail.
 * Wording follows the product voice: plain, short, second person, no jargon.
 * Preview them all with `npm run mail:preview`.
 */
const { renderEmail } = require('./layout');

const minutesLabel = (minutes) => (minutes && minutes > 0
  ? `${minutes} minute${minutes === 1 ? '' : 's'}`
  : null);

const codeExpiry = (minutes) => {
  const label = minutesLabel(minutes);
  return label ? ['The code works for ', { strong: label }, ' and only once.'] : 'Use the code straight away. It works only once.';
};

/* ---------- Sign-up and sign-in ---------- */

/** Code that confirms a new school's admin email at signup. */
const signupCode = ({ schoolName, code, minutes }) => renderEmail({
  subject: `${code} is your Capabble confirmation code`,
  preheader: `Enter this code to finish setting up ${schoolName || 'your school'} on Capabble.`,
  context: schoolName || undefined,
  heading: 'Confirm your email',
  intro: [
    ['Enter this code to finish setting up ', { strong: schoolName || 'your school' }, ' on Capabble.']
  ],
  code,
  outro: [codeExpiry(minutes)],
  footnote: 'You’re getting this because someone used this email to create a Capabble account. If it wasn’t you, ignore this email and no account will be made.'
});

/** Code for "Forgot password". */
const passwordResetCode = ({ code, minutes }) => renderEmail({
  subject: `${code} is your Capabble password reset code`,
  preheader: 'Enter this code to choose a new password.',
  heading: 'Reset your password',
  intro: ['Enter this code on the reset page to choose a new password.'],
  code,
  outro: [codeExpiry(minutes)],
  footnote: 'You’re getting this because a password reset was asked for on your Capabble account. If it wasn’t you, ignore this email. Your password stays the same.'
});

/** Code that confirms the email on an existing account. */
const emailVerificationCode = ({ code, minutes }) => renderEmail({
  subject: `${code} is your Capabble verification code`,
  preheader: 'Enter this code to confirm your email address.',
  heading: 'Confirm your email address',
  intro: ['Enter this code in Capabble to confirm your email address.'],
  code,
  outro: [codeExpiry(minutes)],
  footnote: 'You’re getting this because this email was added to a Capabble account. If it wasn’t you, ignore this email.'
});

/** A school created a login for someone (Settings → Users and access). */
const loginInvite = ({ schoolName, name, inviteUrl, loginHint, hours }) => renderEmail({
  subject: `Set up your ${schoolName} login`,
  preheader: `${schoolName} has created a Capabble login for you.`,
  context: schoolName,
  heading: name ? `Welcome, ${name}` : 'Welcome to Capabble',
  intro: [
    [{ strong: schoolName }, ' has created a Capabble login for you. Choose a password to get started.']
  ],
  button: { label: 'Choose my password', url: inviteUrl },
  outro: [
    loginHint,
    `The link works once and expires in ${hours} hours. If it has expired, ask your school's Capabble admin to send a new one.`
  ],
  footnote: `You're getting this because ${schoolName} added you to Capabble.`
});

/* ---------- Internal ---------- */

/** Tells the Capabble team a new school signed up (ADMIN_EMAILS). */
const newSchoolAlert = ({ tenantName, tenantSlug, adminEmail, source, time }) => renderEmail({
  subject: `New school on Capabble: ${tenantName}`,
  preheader: `${tenantName} (${tenantSlug}) signed up through ${source}.`,
  context: 'Capabble team',
  heading: 'A new school signed up',
  details: [
    ['School', tenantName],
    ['Workspace code', tenantSlug],
    ['Admin email', adminEmail],
    ['Source', source],
    ['Time', time]
  ],
  footnote: 'You’re getting this because your address is in ADMIN_EMAILS on the Capabble server.'
});

/* ---------- Appointments ---------- */

/** Meeting updates for visitors and hosts. */
const appointmentUpdate = ({ schoolName, subject, body }) => renderEmail({
  subject: schoolName ? `${subject} · ${schoolName}` : subject,
  preheader: body,
  context: schoolName || undefined,
  heading: subject.replace(/:.*$/, ''),
  intro: [body],
  footnote: schoolName
    ? `You're getting this because of a meeting booked at ${schoolName}.`
    : 'You’re getting this because of a meeting booked through Capabble.'
});

/* ---------- Billing ---------- */

const invoiceEmail = ({ variant, name, invoiceNumber, amountDue, dueDate, url }) => {
  const copy = {
    issued: {
      subject: `Capabble invoice ${invoiceNumber}`,
      heading: 'Your new invoice',
      lead: 'A new invoice has been issued for your Capabble subscription.'
    },
    due_soon: {
      subject: `Payment due on ${dueDate}: ${invoiceNumber}`,
      heading: 'Your invoice is due soon',
      lead: 'A reminder that your Capabble invoice is due soon.'
    },
    overdue: {
      subject: `Overdue: Capabble invoice ${invoiceNumber}`,
      heading: 'Your invoice is overdue',
      lead: 'Your Capabble invoice is past its due date. Please pay it to keep full access.'
    }
  }[variant];
  return renderEmail({
    subject: copy.subject,
    preheader: `${invoiceNumber}: ${amountDue} due ${dueDate}.`,
    context: name,
    heading: copy.heading,
    intro: [copy.lead],
    details: [
      ['Invoice', invoiceNumber],
      ['Amount due', amountDue],
      ['Due date', dueDate]
    ],
    button: { label: 'Pay or download invoice', url },
    outro: ['You can pay by UPI, card or netbanking.'],
    footnote: `You're getting this because this is the billing email for ${name} on Capabble.`
  });
};

/** A payment was recorded (online or offline). The receipt PDF, and the invoice once paid, are attached. */
const paymentReceived = ({ name, amount, receiptNumber, invoiceNumber, paidOn, method, balanceDue, url }) => renderEmail({
  subject: `Payment received: ${amount} for ${invoiceNumber}`,
  preheader: `Thank you. We've received ${amount} for invoice ${invoiceNumber}.`,
  context: name,
  heading: 'Payment received',
  intro: [['Thank you. We’ve received ', { strong: amount }, ' for your Capabble subscription.']],
  details: [
    ['Receipt', receiptNumber],
    ['Invoice', invoiceNumber],
    ['Amount', amount],
    ['Paid on', paidOn],
    ['Method', method],
    ...(balanceDue ? [['Still due', balanceDue]] : [])
  ],
  outro: [
    balanceDue
      ? 'The receipt is attached. The rest of the invoice is still due.'
      : 'The receipt and the paid invoice are attached. Keep them for your accounts.'
  ],
  button: { label: 'View billing', url },
  footnote: `You’re getting this because this is the billing email for ${name} on Capabble.`
});

const accessEmail = ({ variant, name, date, url }) => {
  const copy = {
    trial_ending: {
      subject: 'Your Capabble trial ends soon',
      heading: 'Your free trial ends soon',
      intro: [['Your free trial ends on ', { strong: date }, '. Choose the modules you want to keep and pay to carry on without a break.']],
      button: 'Choose my modules'
    },
    grandfather_ending: {
      subject: 'Choose your Capabble plan',
      heading: 'Time to choose your plan',
      intro: [['Your complimentary access ends on ', { strong: date }, '. Choose the modules you want to keep.']],
      button: 'Choose my modules'
    },
    grace_ending: {
      subject: 'Capabble access becomes read-only tomorrow',
      heading: 'Access becomes read-only tomorrow',
      intro: ['A payment is overdue.'],
      notice: ['On ', { strong: date }, ', your school’s Capabble access becomes read-only until the invoice is paid.'],
      button: 'Pay now'
    },
    suspended: {
      subject: 'Capabble access is now read-only',
      heading: 'Your access is read-only',
      intro: ['Your school’s Capabble access is read-only because a payment is overdue. Your data is safe.'],
      notice: 'Pay the overdue invoice to restore full access straight away.',
      button: 'Pay now'
    }
  }[variant];
  return renderEmail({
    subject: copy.subject,
    preheader: typeof copy.intro[0] === 'string' ? copy.intro[0] : `${copy.heading}.`,
    context: name,
    heading: copy.heading,
    intro: copy.intro,
    notice: copy.notice,
    button: { label: copy.button, url },
    footnote: `You're getting this because this is the billing email for ${name} on Capabble.`
  });
};

/* ---------- Opt-in trial ---------- */

const billingFootnote = (name) => `You're getting this because this is the billing email for ${name} on Capabble.`;
const listOf = (names) => (names.length > 2 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names.join(' and '));
const perInterval = (interval) => (interval === 'month' ? 'a month' : 'a year');

const moduleItems = (allModules, planned = null) => allModules.map((m) => {
  const inPlan = planned ? planned.includes(m.name) : false;
  return {
    name: m.name,
    blurb: m.blurb,
    tag: planned ? (inPlan ? 'In your plan' : 'Open in your trial') : 'Included in your trial',
    planned: inPlan
  };
}).sort((a, b) => Number(b.planned) - Number(a.planned));

const trialTimeline = ({ reminderOn, noticeOn, trialEndsOn, amount, autopay, current = 0 }) => [
  { label: 'Today', date: 'Trial starts', caption: 'Every module open, free' },
  { label: 'Reminder', date: reminderOn, caption: 'We email you a week before' },
  { label: autopay ? 'Notice' : 'Invoice', date: noticeOn, caption: autopay ? 'Pre-debit notice, 24 hours ahead' : 'Your invoice is ready' },
  { label: autopay ? 'First charge' : 'Plan starts', date: trialEndsOn, caption: amount }
].map((step, i) => ({ ...step, current: i === current }));

/** A new school: choose your plan to start the free trial. Everything is open in the trial. */
const trialInvite = ({ name, url, trialDays, allModules = [] }) => renderEmail({
  subject: `${name}, your ${trialDays} days of Capabble are ready`,
  preheader: `Every Capabble module, free for ${trialDays} days. Choose your plan to start.`,
  context: name,
  heading: `Your ${trialDays}-day free trial is ready`,
  intro: [
    ['For ', { strong: `${trialDays} days` }, ', your school gets ', { strong: 'every Capabble module' }, ': students, attendance, timetable, exams, fees and the rest. Free.'],
    'Starting takes about two minutes:'
  ],
  details: [
    ['1. Choose', 'The modules (or a bundle) you want after the trial'],
    ['2. Confirm', 'See exactly what you’ll pay and when. Nothing is charged today'],
    ['3. Explore', `Use everything for ${trialDays} days, then keep what you chose`]
  ],
  button: { label: 'Choose your plan', url },
  moduleGrid: allModules.length ? { title: 'All of this is in your trial', items: moduleItems(allModules) } : null,
  outro: ['You can change your plan or cancel any time during the trial, from Billing.'],
  footnote: billingFootnote(name)
});

/** The trial is on: everything is open, here is the plan, the dates and how to cancel. */
const trialStarted = ({ name, url, trialEndsOn, amount, interval, planned = [], allModules = [], reminderOn, noticeOn, autopay }) => renderEmail({
  subject: `Your Capabble trial is on — everything is open until ${trialEndsOn}`,
  preheader: `Every module is yours to try until ${trialEndsOn}. Nothing is charged before then.`,
  context: name,
  heading: 'Your free trial has started',
  intro: [
    ['Every Capabble module is open for your school until ', { strong: trialEndsOn }, '. Try anything: the modules in your plan and all the others too.'],
    autopay
      ? ['On ', { strong: trialEndsOn }, ' we’ll charge ', { strong: amount }, ` (${perInterval(interval)}, GST included) through the autopay you set up, and your plan carries on. Nothing is charged before then.`]
      : ['On ', { strong: trialEndsOn }, ' your plan starts and we’ll send an invoice for ', { strong: amount }, ` (${perInterval(interval)}, GST included). Nothing is due before then.`]
  ],
  timeline: trialTimeline({ reminderOn, noticeOn, trialEndsOn, amount, autopay, current: 0 }),
  lists: [{ title: 'Your plan after the trial', items: planned }],
  button: { label: 'Start exploring', url: url.replace(/#\/billing.*$/, '#/dashboard') },
  link: { label: 'Review or change your plan', url },
  moduleGrid: allModules.length ? { title: 'Open during your trial', items: moduleItems(allModules, planned) } : null,
  outro: [['Changed your mind? Go to ', { strong: 'Billing → Cancel trial' }, ` any time before ${trialEndsOn} and you pay nothing.`]],
  footnote: billingFootnote(name)
});

const SUGGESTIONS = {
  'Student Management': 'Admissions, profiles and class lists in one place.',
  'Attendance Management': 'Mark a class in seconds and spot absence patterns early.',
  'Timetable Management': 'Build a clash-free timetable, substitutions included.',
  'Internal Exams': 'Set exams, enter marks and print report cards.',
  'Capital & Finance': 'Fee collection, receipts and expenses without spreadsheets.',
  'Library Management': 'Issue and return books with a scan.',
  'School Transport': 'Routes, stops and who rides which bus.',
  'Asset Management': 'Know what the school owns and where it is.',
  Appointments: 'Parent meetings booked without phone tag.',
  'Human Resource Management': 'Staff records, leave and documents.',
  'Medical Clinic': 'Visits, allergies and health records.',
  Activities: 'Clubs, houses and events.',
  Academics: 'Plan the curriculum and track coverage.',
  'Exam Centre Control': 'Run a CBSE exam centre end to end.'
};

/** Halfway: a nudge to try modules outside the plan while they're still open. */
const trialMidpoint = ({ name, url, daysLeft, others = [] }) => {
  const picks = others.slice(0, 3);
  return renderEmail({
    subject: picks.length ? `Halfway through your trial — have you tried ${picks[0]}?` : 'Halfway through your Capabble trial',
    preheader: `${daysLeft} days left with every module open.`,
    context: name,
    heading: 'You’re halfway through your trial',
    intro: [
      ['You still have ', { strong: `${daysLeft} days` }, ' with every module open. A good moment to try the ones that aren’t in your plan yet. If one earns its place, add it before the trial ends.']
    ],
    details: picks.map((mod) => [mod, SUGGESTIONS[mod] || 'Open now in your trial.']),
    button: { label: 'Explore Capabble', url: url.replace(/#\/billing.*$/, '#/dashboard') },
    link: { label: 'Add modules to your plan', url },
    footnote: billingFootnote(name)
  });
};

/** 7 and 3 days before the end: what stays, what closes, what will be charged. */
const trialEnding = ({ name, url, daysLeft, trialEndsOn, amount, planned = [], others = [], autopay }) => renderEmail({
  subject: `${daysLeft} day${daysLeft === 1 ? '' : 's'} left of everything on Capabble`,
  preheader: `Your trial ends on ${trialEndsOn}. Here's what stays and what closes.`,
  context: name,
  heading: `${daysLeft} day${daysLeft === 1 ? '' : 's'} left of everything`,
  intro: [
    ['Your free trial ends on ', { strong: trialEndsOn }, '. Until then every module is still open. After that, your school keeps the modules in its plan.'],
    autopay
      ? ['On ', { strong: trialEndsOn }, ' we’ll charge ', { strong: amount }, ' through your autopay. You’ll get a pre-debit notice the day before.']
      : ['On ', { strong: trialEndsOn }, ' your plan starts and your invoice for ', { strong: amount }, ' falls due.']
  ],
  timeline: trialTimeline({ reminderOn: daysLeft > 3 ? 'Today' : 'Sent', noticeOn: 'The day before', trialEndsOn, amount, autopay, current: daysLeft > 3 ? 1 : 2 })
    .map((step, i) => (i === 0 ? { ...step, label: 'Trial', date: 'Everything open', caption: `Until ${trialEndsOn}` } : step)),
  lists: [
    { title: 'These stay on', items: planned },
    { title: `These close on ${trialEndsOn}`, items: others, tone: 'muted' }
  ],
  button: { label: 'Add modules', url },
  link: { label: 'Review my plan', url },
  outro: [
    'Anything you saved in a module that closes stays safe. Add the module back any time and it’s all there.',
    ['Not for you? Cancel from ', { strong: 'Billing' }, ` before ${trialEndsOn} and you pay nothing.`]
  ],
  footnote: billingFootnote(name)
});

/**
 * A school whose trial started before opt-in (no plan, never agreed to terms): keep the
 * trial, but choose the modules to keep before it ends.
 */
const legacyTrialChoosePlan = ({ name, url, daysLeft, trialEndsOn, allModules = [] }) => renderEmail({
  subject: `Choose your Capabble plan before ${trialEndsOn}`,
  preheader: `Your free trial runs until ${trialEndsOn}. Pick the modules you'll keep after it.`,
  context: name,
  heading: 'Choose the modules you’ll keep',
  intro: [
    ['Your school has been on a free Capabble trial with ', { strong: 'every module open' }, '. It runs until ', { strong: trialEndsOn }, ` (${daysLeft} day${daysLeft === 1 ? '' : 's'} from now) and nothing changes before then.`],
    'Your school hasn’t chosen a plan yet. Choose the modules you want to keep, and they carry on after the trial without a break.'
  ],
  timeline: [
    { label: 'Now', date: 'Everything open', caption: `Until ${trialEndsOn}` },
    { label: 'Choose', date: 'Before the trial ends', caption: 'Pick modules or a bundle on Billing' },
    { label: 'Trial ends', date: trialEndsOn, caption: 'Your plan starts; the invoice follows' }
  ].map((step, i) => ({ ...step, current: i === 1 })),
  lists: [
    { title: 'With a plan', items: ['The modules you choose stay on', 'Your first invoice is dated when the trial ends'] },
    { title: `Without a plan, after ${trialEndsOn}`, items: ['Your school becomes read-only after a short grace period', 'Your data stays safe and readable'], tone: 'muted' }
  ],
  button: { label: 'Choose your plan', url },
  moduleGrid: allModules.length ? { title: 'Open during your trial', items: moduleItems(allModules) } : null,
  outro: ['Nothing is charged by this email, and your trial dates stay the same.'],
  footnote: billingFootnote(name)
});

/** Pre-debit notice, at least 24 hours before an autopay charge (RBI e-mandate rules). */
const preDebitNotice = ({ name, url, amount, chargeOn, method }) => renderEmail({
  subject: `Pre-debit notice: ${amount} on ${chargeOn}`,
  preheader: `Your Capabble autopay will charge ${amount} on ${chargeOn}.`,
  context: name,
  heading: 'Upcoming autopay charge',
  intro: ['Your free trial ends tomorrow and your Capabble plan starts. As agreed when you set up autopay, we’ll charge:'],
  details: [
    ['Amount', amount],
    ['Date', chargeOn],
    ['Paid by', method || 'Autopay'],
    ['For', 'Your Capabble subscription, first period']
  ],
  button: { label: 'Review my plan', url },
  outro: [['To stop this charge, cancel from ', { strong: 'Billing → Cancel trial' }, ` before ${chargeOn}.`]],
  footnote: billingFootnote(name)
});

/** The first charge after the trial was paid: welcome, and which modules closed. */
const trialConverted = ({ name, url, planned = [], others = [] }) => renderEmail({
  subject: 'Welcome aboard — your Capabble plan is active',
  preheader: 'Your trial has ended and your plan is now active.',
  context: name,
  heading: 'Welcome aboard',
  intro: ['Your trial has ended and your Capabble plan is now active. Thank you for choosing us. Your receipt is in its own email.'],
  lists: [
    { title: 'In your plan', items: planned },
    { title: 'Closed with the trial', items: others, tone: 'muted' }
  ],
  button: { label: 'Open Capabble', url: url.replace(/#\/billing.*$/, '#/dashboard') },
  link: { label: 'Add a module', url },
  outro: others.length ? ['Anything you saved in a closed module is kept. Add it back any time and pick up where you left off.'] : [],
  footnote: billingFootnote(name)
});

/** Autopay was set up but the first charge didn't go through. */
const trialChargeFailed = ({ name, url, amount, graceEndsOn }) => renderEmail({
  subject: 'We couldn’t charge your Capabble autopay',
  preheader: `Pay ${amount} to keep your plan going.`,
  context: name,
  heading: 'Your first payment didn’t go through',
  intro: [['Your trial has ended, but the autopay charge of ', { strong: amount }, ' didn’t go through. This often happens when a bank asks for extra approval on larger amounts.']],
  notice: graceEndsOn ? ['Your school keeps full access until ', { strong: graceEndsOn }, '. Pay before then to avoid any break.'] : undefined,
  button: { label: 'Pay now', url },
  outro: ['You can pay by UPI, card or netbanking.'],
  footnote: billingFootnote(name)
});

/** The school cancelled during its trial. */
const trialCanceled = ({ name, url, trialEndsOn }) => renderEmail({
  subject: 'Your Capabble trial is cancelled',
  preheader: 'Nothing will be charged.',
  context: name,
  heading: 'Your trial is cancelled',
  intro: [
    'You won’t be charged anything, and your autopay (if you set one up) has been cancelled.',
    trialEndsOn ? ['Your school can still use every module until ', { strong: trialEndsOn }, '. After that your data stays safe and readable.'] : 'Your data stays safe and readable.'
  ],
  button: { label: 'Keep my plan', url },
  outro: ['Changed your mind? Choose “Keep my plan” on Billing before the trial ends.'],
  footnote: billingFootnote(name)
});

module.exports = {
  trialInvite,
  trialStarted,
  trialMidpoint,
  trialEnding,
  legacyTrialChoosePlan,
  preDebitNotice,
  trialConverted,
  trialChargeFailed,
  trialCanceled,
  signupCode,
  passwordResetCode,
  emailVerificationCode,
  loginInvite,
  newSchoolAlert,
  appointmentUpdate,
  invoiceEmail,
  paymentReceived,
  accessEmail
};
