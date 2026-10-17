// Thin wrapper over the Razorpay SDK: payment links, refunds, auto-debit and webhook signatures.
const crypto = require('crypto');
const Razorpay = require('razorpay');
const HttpError = require('../utils/httpError');

let client = null;

function getClient() {
  if (client) return client;
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new HttpError(503, 'Online payments are not configured');
  client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return client;
}

// Tests replace the SDK with a fake.
function setClient(fake) {
  client = fake;
}

// The SDK rejects with { statusCode, error: { description } }; make that a normal error.
async function call(label, fn) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const description = error?.error?.description || error?.message || 'Razorpay request failed';
    const wrapped = new HttpError(502, `Razorpay ${label} failed: ${description}`);
    wrapped.providerStatus = error?.statusCode;
    throw wrapped;
  }
}

function createPaymentLink({ invoice, account, amountPaise, referenceId, callbackUrl }) {
  return call('payment link', () => getClient().paymentLink.create({
    amount: amountPaise,
    currency: invoice.currency || 'INR',
    accept_partial: false,
    reference_id: referenceId,
    description: `Capabble invoice ${invoice.number}`,
    customer: {
      name: (account.legalName || account.tenantName).slice(0, 100),
      ...(account.billingEmail ? { email: account.billingEmail } : {}),
    },
    notify: { email: Boolean(account.billingEmail), sms: false },
    reminder_enable: true,
    notes: { invoice_id: invoice.id, invoice_number: invoice.number, tenant_slug: account.tenantSlug },
    ...(callbackUrl ? { callback_url: callbackUrl, callback_method: 'get' } : {}),
  }));
}

const fetchPaymentLink = (id) => call('payment link fetch', () => getClient().paymentLink.fetch(id));
const cancelPaymentLink = (id) => call('payment link cancel', () => getClient().paymentLink.cancel(id));

function refundPayment(paymentId, { amountPaise, receipt, notes }) {
  return call('refund', () => getClient().payments.refund(paymentId, {
    amount: amountPaise, speed: 'normal', receipt, notes,
  }));
}

/** Auto-debit: a Razorpay plan for this amount and a subscription the school authorises once. */
async function createAutoDebit({ account, subscription, amountPaise, interval }) {
  const rz = getClient();
  const plan = await call('plan', () => rz.plans.create({
    period: interval === 'year' ? 'yearly' : 'monthly',
    interval: 1,
    item: { name: `Capabble ${account.tenantName}`.slice(0, 100), amount: amountPaise, currency: 'INR' },
    notes: { tenant_slug: account.tenantSlug, subscription_id: subscription.id },
  }));
  return call('subscription', () => rz.subscriptions.create({
    plan_id: plan.id,
    total_count: interval === 'year' ? 10 : 120,
    customer_notify: 1,
    notes: { tenant_slug: account.tenantSlug, subscription_id: subscription.id },
  }));
}

const cancelAutoDebit = (id) => call('subscription cancel', () => getClient().subscriptions.cancel(id, false));

/** HMAC-SHA256 of the raw body, compared in constant time. Never throws. */
function verifySignature(rawBody, signature, secret = process.env.RAZORPAY_WEBHOOK_SECRET) {
  if (!rawBody || !signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = {
  getClient,
  setClient,
  createPaymentLink,
  fetchPaymentLink,
  cancelPaymentLink,
  refundPayment,
  createAutoDebit,
  cancelAutoDebit,
  verifySignature,
};
