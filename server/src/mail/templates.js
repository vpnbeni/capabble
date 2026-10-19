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

module.exports = {
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
