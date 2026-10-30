/**
 * Online fee payments through the school's OWN Razorpay account.
 *
 * Money settles straight into the school's bank account: Capabble never holds
 * it (that would need a payment aggregator licence). Each school enters its
 * key ID, key secret and webhook secret in Settings → Payments; the secrets are
 * stored encrypted (utils/secretBox, MAIL_CREDENTIALS_KEY).
 *
 * Flow: a parent starts a payment → createOrder() makes a Razorpay order for the
 * installments they chose → Razorpay Checkout (web portal inline, the app in the
 * browser via publicRoutes.js) → the payment is confirmed by the checkout
 * signature AND by the signed webhook, whichever comes first → settleOrder()
 * records it with feeService.recordPayment, so the receipt is made the usual way.
 * settleOrder is idempotent on the Razorpay payment id.
 *
 * This is not the billing module's Razorpay code (Capabble charging schools).
 */
const crypto = require('crypto');
const Razorpay = require('razorpay');
const { seal, open } = require('../../utils/secretBox');
const { round2 } = require('./feeSchedule');
const { recordPayment, httpError } = require('./feeService');
const eventBus = require('../../events/eventBus');
const EVENTS = require('../../events/eventNames');

const KEY_ID_PATTERN = /^rzp_(test|live)_[A-Za-z0-9]{6,40}$/;
// A crashed settle (server restart mid-way) can be retried after this long.
const SETTLE_STALE_MS = 2 * 60 * 1000;
// Reuse an unpaid order for the same installments for this long instead of making another.
const ORDER_REUSE_MS = 20 * 60 * 1000;
const ONLINE_COLLECTOR = Object.freeze({ userId: null, name: 'Online payment', email: '' });

const apiUrl = () => String(process.env.API_URL || `http://localhost:${process.env.PORT || 5000}/api`)
  .replace(/\/+$/, '');

const modeOf = (keyId) => (String(keyId || '').startsWith('rzp_live_') ? 'live' : 'test');

// Capabble's own Razorpay account (the billing module) must never take a school's fees.
const PLATFORM_KEY_MESSAGE = 'These are Capabble\'s Razorpay keys, not your school\'s. '
  + 'Use the keys from your school\'s own Razorpay account, so fees go to the school\'s bank account.';

const isPlatformKey = (keyId) => {
  const platformKeyId = String(process.env.RAZORPAY_KEY_ID || '').trim();
  return Boolean(platformKeyId) && String(keyId || '').trim() === platformKeyId;
};

const webhookUrlFor = (slug) => `${apiUrl()}/school-payments/webhook/${encodeURIComponent(slug)}`;

// ---------------------------------------------------------------------------
// Signatures
// ---------------------------------------------------------------------------

const safeEqualHex = (expected, given) => {
  const a = Buffer.from(String(expected || ''), 'utf8');
  const b = Buffer.from(String(given || ''), 'utf8');
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
};

/** Webhooks: HMAC-SHA256 of the exact raw body with the school's webhook secret. */
const verifyWebhookSignature = (rawBody, signature, secret) => {
  if (!secret || !signature || !rawBody) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
};

/** Checkout: HMAC-SHA256 of "<order_id>|<payment_id>" with the school's key secret. */
const verifyCheckoutSignature = ({ orderId, paymentId, signature }, keySecret) => {
  if (!keySecret || !orderId || !paymentId || !signature) return false;
  const expected = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqualHex(expected, signature);
};

// ---------------------------------------------------------------------------
// The school's settings and Razorpay client
// ---------------------------------------------------------------------------

const loadSettings = (models) => models.SchoolPaymentSettings?.findOne({ key: 'default' });

/** The school's credentials when payments are on and complete, else null. */
const credentialsOf = (settings) => {
  if (!settings?.enabled || !settings.keyId || isPlatformKey(settings.keyId)) return null;
  const keySecret = open(settings.keySecret);
  const webhookSecret = open(settings.webhookSecret);
  if (!keySecret || !webhookSecret) return null;
  return { keyId: settings.keyId, keySecret, webhookSecret };
};

const isConnected = (settings) => Boolean(credentialsOf(settings));

let clientFactory = ({ keyId, keySecret }) => new Razorpay({ key_id: keyId, key_secret: keySecret });

// Tests replace the SDK with a fake.
const setClientFactory = (factory) => {
  clientFactory = factory;
};

// The SDK rejects with { statusCode, error: { description } }.
const providerMessage = (error) => String(error?.error?.description || error?.message || 'Razorpay request failed')
  .slice(0, 300);

const call = async (label, fn) => {
  try {
    return await fn();
  } catch (error) {
    throw httpError(`Razorpay could not ${label}: ${providerMessage(error)}`, 502);
  }
};

const settingsView = (settings, slug) => {
  const view = {
    enabled: Boolean(settings?.enabled),
    provider: 'razorpay',
    keyId: settings?.keyId || '',
    mode: settings?.keyId ? modeOf(settings.keyId) : null,
    hasKeySecret: Boolean(settings?.keySecret?.data),
    hasWebhookSecret: Boolean(settings?.webhookSecret?.data),
    connected: isConnected(settings),
    webhookUrl: webhookUrlFor(slug),
    lastTestAt: settings?.lastTestAt || null,
    lastTestOk: settings?.lastTestOk ?? null,
    lastError: settings?.lastError || '',
    lastWebhookAt: settings?.lastWebhookAt || null
  };
  // Saved before this check existed: show why payments stopped.
  return isPlatformKey(view.keyId) ? { ...view, lastTestOk: false, lastError: PLATFORM_KEY_MESSAGE } : view;
};

/** Save Settings → Payments. Empty secrets keep the stored ones. */
const saveSettings = async (models, value, userId) => {
  const { SchoolPaymentSettings } = models;
  const current = await SchoolPaymentSettings.findOne({ key: 'default' });
  const doc = current || new SchoolPaymentSettings({ key: 'default' });
  const keyId = String(value.keyId || '').trim();
  const keyChanged = keyId !== (doc.keyId || '');
  if (keyId && !KEY_ID_PATTERN.test(keyId)) {
    throw httpError('Enter the key ID from Razorpay → Account & Settings → API keys. '
      + 'It starts with rzp_test_ or rzp_live_.');
  }
  if (isPlatformKey(keyId)) throw httpError(PLATFORM_KEY_MESSAGE);
  if (keyChanged && keyId && doc.keySecret?.data && !value.keySecret) {
    throw httpError('Enter the key secret that goes with the new key ID.');
  }
  const hasKeySecret = Boolean(value.keySecret || (!keyChanged && doc.keySecret?.data));
  const hasWebhookSecret = Boolean(value.webhookSecret || doc.webhookSecret?.data);
  if (value.enabled && (!keyId || !hasKeySecret || !hasWebhookSecret)) {
    throw httpError('Fill in the key ID, key secret and webhook secret to turn payments on.');
  }
  doc.enabled = Boolean(value.enabled);
  doc.keyId = keyId;
  if (value.keySecret) doc.keySecret = seal(value.keySecret);
  if (value.webhookSecret) doc.webhookSecret = seal(value.webhookSecret);
  if (keyChanged || value.keySecret) {
    doc.lastTestAt = null;
    doc.lastTestOk = null;
    doc.lastError = '';
  }
  doc.updatedBy = userId || null;
  await doc.save();
  return doc;
};

/** Check the keys by asking Razorpay for one order. */
const testSettings = async (models) => {
  const settings = await loadSettings(models);
  const keySecret = open(settings?.keySecret);
  if (!settings?.keyId || !keySecret) throw httpError('Save the key ID and key secret first.');
  if (isPlatformKey(settings.keyId)) throw httpError(PLATFORM_KEY_MESSAGE);
  try {
    await clientFactory({ keyId: settings.keyId, keySecret }).orders.all({ count: 1 });
    settings.lastTestOk = true;
    settings.lastError = '';
  } catch (error) {
    settings.lastTestOk = false;
    settings.lastError = providerMessage(error);
  }
  settings.lastTestAt = new Date();
  await settings.save();
  if (!settings.lastTestOk) throw httpError(`Razorpay said: ${settings.lastError}`);
  return settings;
};

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

const toPaise = (rupees) => Math.round(round2(rupees) * 100);

const sameIds = (a = [], b = []) => a.length === b.length && a.every((id, i) => String(id) === String(b[i]));

/**
 * Make (or reuse) an order for a parent's open installments.
 * demandIds: the installments chosen; empty means everything still due.
 */
const createOrder = async (models, { account, demandIds = [], sessionLabel, user, source = 'web' }) => {
  const { FeeDemand, FeeOnlineOrder } = models;
  const settings = await loadSettings(models);
  const credentials = credentialsOf(settings);
  if (!credentials) throw httpError('Online payment is not available. Pay at the school office.', 409);

  const openDemands = await FeeDemand
    .find({ accountId: account._id, status: { $in: ['due', 'partial'] }, balance: { $gt: 0 } })
    .sort({ dueDate: 1 }).lean();
  const wanted = demandIds.length ? new Set(demandIds.map(String)) : null;
  const chosen = wanted ? openDemands.filter((demand) => wanted.has(String(demand._id))) : openDemands;
  if (wanted && chosen.length !== wanted.size) {
    throw httpError('Some of these fees are already paid. Refresh and try again.', 409);
  }
  const amount = round2(chosen.reduce((sum, demand) => sum + demand.balance, 0));
  if (amount < 1) throw httpError('Nothing is due right now.', 409);
  const ids = chosen.map((demand) => demand._id);

  const recent = await FeeOnlineOrder.findOne({
    accountId: account._id,
    status: 'created',
    amount,
    createdAt: { $gte: new Date(Date.now() - ORDER_REUSE_MS) }
  }).sort({ createdAt: -1 });
  if (recent && sameIds(recent.demandIds, ids)) return { order: recent, keyId: credentials.keyId, chosen };

  const order = new FeeOnlineOrder({
    razorpayOrderId: 'pending',
    accountId: account._id,
    student: account.student,
    studentSnapshot: {
      name: account.studentSnapshot?.name || '',
      rollNumber: account.studentSnapshot?.rollNumber || '',
      class: account.studentSnapshot?.class || '',
      section: account.studentSnapshot?.section || ''
    },
    demandIds: ids,
    amount,
    amountPaise: toPaise(amount),
    academicSession: sessionLabel || '',
    source,
    createdBy: { userId: user?._id || null, name: user?.name || '', email: user?.email || '' }
  });
  const remote = await call('start the payment', () => clientFactory(credentials).orders.create({
    amount: order.amountPaise,
    currency: 'INR',
    receipt: String(order._id),
    notes: {
      capabble_order: String(order._id),
      admission_no: order.studentSnapshot.rollNumber,
      student: order.studentSnapshot.name.slice(0, 200),
      installments: chosen.map((demand) => demand.label || demand.periodKey).join(', ').slice(0, 250)
    }
  }));
  order.razorpayOrderId = remote.id;
  await order.save();
  return { order, keyId: credentials.keyId, chosen };
};

/** Allocate the paid amount over the chosen installments, then any other open ones, earliest first. */
const planAllocations = (openDemands, chosenIds, amount) => {
  const chosen = new Set(chosenIds.map(String));
  const ordered = [
    ...openDemands.filter((demand) => chosen.has(String(demand._id))),
    ...openDemands.filter((demand) => !chosen.has(String(demand._id)))
  ];
  let left = round2(amount);
  const allocations = [];
  ordered.forEach((demand) => {
    if (left <= 0) return;
    const take = round2(Math.min(demand.balance, left));
    if (take <= 0) return;
    allocations.push({ demandId: demand._id, amount: take });
    left = round2(left - take);
  });
  return { allocations, left };
};

const PAYMENT_METHODS = { upi: 'UPI', card: 'card', netbanking: 'net banking', wallet: 'wallet', emi: 'EMI' };

/**
 * Confirm the payment with Razorpay: from the signed webhook payload when we have
 * it, else fetched with the school's keys (and captured if only authorised).
 */
const confirmPayment = async (credentials, order, { paymentId, payment }) => {
  let entity = payment;
  if (!entity) {
    const client = clientFactory(credentials);
    entity = await call('check the payment', () => client.payments.fetch(paymentId));
    if (entity?.status === 'authorized') {
      entity = await call('capture the payment', () => client.payments.capture(paymentId, order.amountPaise, 'INR'));
    }
  }
  if (!entity || entity.id !== paymentId) throw httpError('Payment not found.', 404);
  if (entity.order_id !== order.razorpayOrderId) throw httpError('This payment belongs to another order.', 400);
  if (entity.status !== 'captured') throw httpError(`The payment is ${entity.status || 'not complete'}.`, 409);
  if (Number(entity.amount) !== order.amountPaise || String(entity.currency || 'INR') !== 'INR') {
    throw httpError('The amount paid does not match the order.', 400);
  }
  return entity;
};

// "Paid online (UPI) by Priya Sharma · Razorpay pay_…" on the receipt.
const remarksFor = (order, paymentId) => [
  `Paid online${order.method ? ` (${order.method})` : ''}${order.createdBy?.name ? ` by ${order.createdBy.name}` : ''}`,
  `Razorpay ${paymentId}`
].join(' · ');

const emitRecorded = (tenant, payment, order) => {
  if (!tenant?.dbName) return;
  eventBus.emit(EVENTS.FEE_PAYMENT_RECORDED, {
    tenant: { dbName: tenant.dbName, slug: tenant.slug, id: String(tenant.id || tenant._id || '') },
    actorId: order.createdBy?.userId ? String(order.createdBy.userId) : null,
    actorName: order.createdBy?.name || '',
    paymentId: String(payment._id)
  });
};

/**
 * Turn a confirmed Razorpay payment into a receipt, once.
 * Safe to call from the checkout callback and the webhook at the same time, and
 * again on every webhook retry: the order is claimed atomically, and a receipt
 * already made for the payment id is reused.
 *
 * Returns the order (status 'paid', or 'review' when the money can't be matched
 * to dues any more, e.g. the office collected cash meanwhile).
 */
const settleOrder = async (models, {
  order: given, paymentId, payment = null, tenant = null, credentials = null, record = recordPayment
}) => {
  const { FeeOnlineOrder, FeePayment, FeeDemand, StudentFeeAccount } = models;
  let order = given;
  if (order.status === 'paid' || order.status === 'review') return order;
  if (!paymentId) throw httpError('Payment id missing.');

  const creds = credentials || credentialsOf(await loadSettings(models));
  if (!creds) throw httpError('Online payment is not set up.', 409);
  const entity = await confirmPayment(creds, order, { paymentId, payment });

  const claimed = await FeeOnlineOrder.findOneAndUpdate(
    {
      _id: order._id,
      $or: [
        { status: 'created' },
        { status: 'settling', paymentId, settlingAt: { $lt: new Date(Date.now() - SETTLE_STALE_MS) } }
      ]
    },
    {
      $set: {
        status: 'settling',
        settlingAt: new Date(),
        paymentId,
        method: PAYMENT_METHODS[entity.method] || entity.method || ''
      }
    },
    { new: true }
  );
  if (!claimed) return FeeOnlineOrder.findById(order._id); // Someone else has it (or it's done).
  order = claimed;

  const finish = (fields) => FeeOnlineOrder
    .findOneAndUpdate({ _id: order._id }, { $set: { ...fields, settlingAt: null } }, { new: true });
  const paidAt = entity.created_at ? new Date(entity.created_at * 1000) : new Date();

  // A receipt already made for this payment (a crash after recording): just link it.
  const existing = await FeePayment.findOne({ mode: 'online', reference: paymentId }).lean();
  if (existing) return finish({ status: 'paid', feePaymentId: existing._id, receiptNo: existing.receiptNo, paidAt });

  const account = await StudentFeeAccount.findById(order.accountId);
  if (!account) return finish({ status: 'review', reviewReason: 'The fee account no longer exists.' });
  const openDemands = await FeeDemand.find({ accountId: account._id, status: { $in: ['due', 'partial'] } })
    .sort({ dueDate: 1 }).lean();
  const { allocations, left } = planAllocations(openDemands, order.demandIds || [], order.amount);
  if (left > 0) {
    const extra = `₹${left.toLocaleString('en-IN')}`;
    const reviewReason = `${extra} more was paid than is still due. Refund it in Razorpay or record it by hand.`;
    return finish({ status: 'review', reviewReason });
  }

  try {
    const receipt = await record(models, account, {
      amount: order.amount,
      lateFee: 0,
      mode: 'online',
      reference: paymentId,
      date: paidAt,
      remarks: remarksFor(order, paymentId),
      allocations
    }, order.academicSession, ONLINE_COLLECTOR);
    const done = await finish({
      status: 'paid', feePaymentId: receipt._id, receiptNo: receipt.receiptNo, paidAt, reviewReason: ''
    });
    emitRecorded(tenant, receipt, done);
    return done;
  } catch (error) {
    return finish({ status: 'review', reviewReason: String(error.message || error).slice(0, 300) });
  }
};

/** Handle a verified webhook event. Returns what happened, for the log. */
const handleWebhookEvent = async (models, event, { tenant, credentials } = {}) => {
  const payment = event?.payload?.payment?.entity;
  if (!payment?.order_id) return 'ignored';
  const order = await models.FeeOnlineOrder.findOne({ razorpayOrderId: payment.order_id });
  if (!order) return 'not ours';

  if (event.event === 'payment.failed') {
    if (order.status === 'created') {
      const lastError = String(payment.error_description || 'Payment failed').slice(0, 300);
      await models.FeeOnlineOrder.updateOne({ _id: order._id }, { $set: { lastError } });
    }
    return 'failed';
  }
  if (event.event !== 'payment.captured' && event.event !== 'order.paid') return 'ignored';
  const settled = await settleOrder(models, { order, paymentId: payment.id, payment, tenant, credentials });
  return settled?.status || 'unknown';
};

/**
 * Catch up an unpaid order with Razorpay (the webhook may be late or not set up):
 * settle it if Razorpay has a captured or authorised payment for it.
 */
const syncOrder = async (models, order, { tenant } = {}) => {
  if (order.status !== 'created') return order;
  const credentials = credentialsOf(await loadSettings(models));
  if (!credentials) return order;
  const client = clientFactory(credentials);
  const list = await call('check the payment', () => client.orders.fetchPayments(order.razorpayOrderId));
  const items = list?.items || [];
  const paid = items.find((item) => item.status === 'captured') || items.find((item) => item.status === 'authorized');
  if (!paid) return order;
  const payment = paid.status === 'captured' ? paid : null;
  return settleOrder(models, { order, paymentId: paid.id, payment, tenant, credentials });
};

/** What the parent sees about one order. */
const orderView = (order) => ({
  orderId: String(order._id),
  status: order.status === 'settling' ? 'processing' : order.status,
  amount: order.amount,
  receiptNo: order.receiptNo || null,
  feePaymentId: order.feePaymentId ? String(order.feePaymentId) : null,
  paidAt: order.paidAt || null,
  method: order.method || '',
  paymentId: order.paymentId || null,
  message: order.status === 'review'
    ? 'Your payment reached the school, but the receipt needs the office to check it. No need to pay again.'
    : order.lastError || ''
});

module.exports = {
  KEY_ID_PATTERN,
  isPlatformKey,
  apiUrl,
  modeOf,
  webhookUrlFor,
  verifyWebhookSignature,
  verifyCheckoutSignature,
  loadSettings,
  credentialsOf,
  isConnected,
  setClientFactory,
  settingsView,
  saveSettings,
  testSettings,
  createOrder,
  planAllocations,
  settleOrder,
  syncOrder,
  handleWebhookEvent,
  orderView
};
