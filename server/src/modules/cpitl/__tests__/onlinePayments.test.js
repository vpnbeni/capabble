/* eslint-disable max-len -- fixtures read better on one line */
const crypto = require('crypto');
const express = require('express');
const request = require('supertest');

jest.mock('../feeService', () => {
  const actual = jest.requireActual('../feeService');
  return { ...actual, recordPayment: jest.fn() };
});

const { recordPayment } = require('../feeService');
const payments = require('../onlinePayments');
const publicPayments = require('../publicPayments');
const { seal } = require('../../../utils/secretBox');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const KEY_SECRET = 'key_secret_test_123';
const WEBHOOK_SECRET = 'whsec_test_456';
const ORDER_ID = 'a'.repeat(24);
const ACCOUNT_ID = 'b'.repeat(24);
const STUDENT_ID = 'c'.repeat(24);

// --- A tiny in-memory stand-in for the Mongoose models these functions use ---

const get = (doc, path) => path.split('.').reduce((v, k) => (v == null ? v : v[k]), doc);
const matches = (doc, filter = {}) => Object.entries(filter).every(([key, cond]) => {
  if (key === '$or') return cond.some((clause) => matches(doc, clause));
  const value = get(doc, key);
  if (cond && typeof cond === 'object' && !(cond instanceof Date) && !Array.isArray(cond)) {
    if ('$in' in cond) return cond.$in.map(String).includes(String(value));
    if ('$ne' in cond) return String(value) !== String(cond.$ne);
    if ('$lt' in cond) return value != null && value < cond.$lt;
    if ('$gt' in cond) return value != null && value > cond.$gt;
    if ('$gte' in cond) return value != null && value >= cond.$gte;
  }
  return String(value) === String(cond);
});
const query = (value) => {
  const q = {
    select: () => q,
    sort: () => q,
    lean: () => q,
    limit: () => q,
    then: (resolve, reject) => Promise.resolve(typeof value === 'function' ? value() : value).then(resolve, reject)
  };
  return q;
};
const collection = (rows = []) => {
  const docs = rows.map((row) => ({ ...row }));
  return {
    docs,
    find: (filter) => query(() => docs.filter((d) => matches(d, filter)).map((d) => ({ ...d }))),
    findOne: (filter) => query(() => { const d = docs.find((row) => matches(row, filter)); return d ? { ...d } : null; }),
    findById: (id) => query(() => { const d = docs.find((row) => String(row._id) === String(id)); return d ? { ...d } : null; }),
    findOneAndUpdate: (filter, update) => query(async () => {
      await new Promise((resolve) => { setImmediate(resolve); }); // let racing callers interleave
      const d = docs.find((row) => matches(row, filter));
      if (!d) return null;
      Object.assign(d, update.$set || {});
      return { ...d };
    }),
    updateOne: (filter, update) => query(() => {
      const d = docs.find((row) => matches(row, filter));
      if (d) Object.assign(d, update.$set || {});
      return { matchedCount: d ? 1 : 0 };
    })
  };
};

const settingsDoc = () => ({
  _id: 's1',
  key: 'default',
  enabled: true,
  keyId: 'rzp_test_abcdef123456',
  keySecret: seal(KEY_SECRET),
  webhookSecret: seal(WEBHOOK_SECRET)
});

const makeModels = ({ demands, order } = {}) => {
  const receipts = collection([]);
  return {
    SchoolPaymentSettings: collection([settingsDoc()]),
    FeeOnlineOrder: collection([{
      _id: ORDER_ID,
      razorpayOrderId: 'order_RZP1',
      status: 'created',
      accountId: ACCOUNT_ID,
      student: STUDENT_ID,
      studentSnapshot: { name: 'Aarav Sharma', rollNumber: 'A101' },
      demandIds: ['d2'],
      amount: 2500,
      amountPaise: 250000,
      academicSession: '2026-2027',
      createdBy: { userId: 'u1', name: 'Priya Sharma' },
      ...order
    }]),
    FeePayment: receipts,
    StudentFeeAccount: collection([{ _id: ACCOUNT_ID, student: STUDENT_ID, studentSnapshot: { name: 'Aarav Sharma' } }]),
    FeeDemand: collection(demands || [
      { _id: 'd1', accountId: ACCOUNT_ID, status: 'due', balance: 1000, dueDate: new Date('2026-04-10') },
      { _id: 'd2', accountId: ACCOUNT_ID, status: 'partial', balance: 2500, dueDate: new Date('2026-07-10') }
    ])
  };
};

const capturedPayment = (overrides = {}) => ({
  id: 'pay_RZP1',
  order_id: 'order_RZP1',
  status: 'captured',
  amount: 250000,
  currency: 'INR',
  method: 'upi',
  created_at: 1793000000,
  ...overrides
});

const webhookBody = (event = 'payment.captured', payment = capturedPayment()) => JSON.stringify({
  event,
  payload: { payment: { entity: payment } }
});

const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');

beforeEach(() => {
  recordPayment.mockReset();
  let n = 0;
  recordPayment.mockImplementation(async (models, account, payload) => {
    n += 1;
    const receipt = { _id: `fp${n}`, receiptNo: `REC/26-27/${n}`, mode: payload.mode, reference: payload.reference, total: payload.amount };
    models.FeePayment.docs.push(receipt);
    return receipt;
  });
});

describe('signature checks', () => {
  it('accepts a webhook signed with the school secret over the raw body', () => {
    const body = Buffer.from(webhookBody());
    expect(payments.verifyWebhookSignature(body, hmac(WEBHOOK_SECRET, body), WEBHOOK_SECRET)).toBe(true);
  });

  it('rejects a wrong secret, a tampered body or a missing signature', () => {
    const body = Buffer.from(webhookBody());
    expect(payments.verifyWebhookSignature(body, hmac('another_secret', body), WEBHOOK_SECRET)).toBe(false);
    const tampered = Buffer.from(webhookBody('payment.captured', capturedPayment({ amount: 100 })));
    expect(payments.verifyWebhookSignature(tampered, hmac(WEBHOOK_SECRET, body), WEBHOOK_SECRET)).toBe(false);
    expect(payments.verifyWebhookSignature(body, '', WEBHOOK_SECRET)).toBe(false);
    expect(payments.verifyWebhookSignature(body, 'abc', '')).toBe(false);
  });

  it('checks the checkout signature over "order_id|payment_id" with the key secret', () => {
    const signature = hmac(KEY_SECRET, 'order_RZP1|pay_RZP1');
    expect(payments.verifyCheckoutSignature({ orderId: 'order_RZP1', paymentId: 'pay_RZP1', signature }, KEY_SECRET)).toBe(true);
    expect(payments.verifyCheckoutSignature({ orderId: 'order_RZP1', paymentId: 'pay_OTHER', signature }, KEY_SECRET)).toBe(false);
    expect(payments.verifyCheckoutSignature({ orderId: 'order_RZP1', paymentId: 'pay_RZP1', signature }, WEBHOOK_SECRET)).toBe(false);
  });
});

describe('settleOrder', () => {
  it('records the payment as an online receipt on the chosen installments', async () => {
    const models = makeModels();
    const order = await models.FeeOnlineOrder.findById(ORDER_ID);
    const settled = await payments.settleOrder(models, { order, paymentId: 'pay_RZP1', payment: capturedPayment() });

    expect(settled).toMatchObject({ status: 'paid', receiptNo: 'REC/26-27/1', paymentId: 'pay_RZP1', method: 'UPI' });
    expect(recordPayment).toHaveBeenCalledTimes(1);
    const [, , payload, session] = recordPayment.mock.calls[0];
    expect(payload).toMatchObject({ amount: 2500, lateFee: 0, mode: 'online', reference: 'pay_RZP1', allocations: [{ demandId: 'd2', amount: 2500 }] });
    expect(session).toBe('2026-2027');
  });

  it('is idempotent on the payment id: repeats and races make one receipt', async () => {
    const models = makeModels();
    const order = await models.FeeOnlineOrder.findById(ORDER_ID);
    const results = await Promise.all([
      payments.settleOrder(models, { order, paymentId: 'pay_RZP1', payment: capturedPayment() }),
      payments.settleOrder(models, { order, paymentId: 'pay_RZP1', payment: capturedPayment() })
    ]);
    const again = await payments.settleOrder(models, { order: await models.FeeOnlineOrder.findById(ORDER_ID), paymentId: 'pay_RZP1', payment: capturedPayment() });

    expect(recordPayment).toHaveBeenCalledTimes(1);
    expect(again.status).toBe('paid');
    expect(results.some((r) => r.status === 'paid' || r.status === 'settling')).toBe(true);
  });

  it('links an existing receipt for the payment instead of recording it again', async () => {
    const models = makeModels({ order: { status: 'settling', paymentId: 'pay_RZP1', settlingAt: new Date(Date.now() - 10 * 60 * 1000) } });
    models.FeePayment.docs.push({ _id: 'fp-old', receiptNo: 'REC/26-27/9', mode: 'online', reference: 'pay_RZP1' });
    const order = await models.FeeOnlineOrder.findById(ORDER_ID);
    const settled = await payments.settleOrder(models, { order, paymentId: 'pay_RZP1', payment: capturedPayment() });

    expect(recordPayment).not.toHaveBeenCalled();
    expect(settled).toMatchObject({ status: 'paid', receiptNo: 'REC/26-27/9' });
  });

  it('refuses a payment for another order or a different amount', async () => {
    const models = makeModels();
    const order = await models.FeeOnlineOrder.findById(ORDER_ID);
    await expect(payments.settleOrder(models, { order, paymentId: 'pay_RZP1', payment: capturedPayment({ order_id: 'order_OTHER' }) })).rejects.toThrow('another order');
    await expect(payments.settleOrder(models, { order, paymentId: 'pay_RZP1', payment: capturedPayment({ amount: 100 }) })).rejects.toThrow('does not match');
    await expect(payments.settleOrder(models, { order, paymentId: 'pay_RZP1', payment: capturedPayment({ status: 'failed' }) })).rejects.toThrow('failed');
    expect(recordPayment).not.toHaveBeenCalled();
    expect((await models.FeeOnlineOrder.findById(ORDER_ID)).status).toBe('created');
  });

  it('sends the order for review when more was paid than is still due', async () => {
    const models = makeModels({ demands: [{ _id: 'd2', accountId: ACCOUNT_ID, status: 'partial', balance: 500, dueDate: new Date('2026-07-10') }] });
    const order = await models.FeeOnlineOrder.findById(ORDER_ID);
    const settled = await payments.settleOrder(models, { order, paymentId: 'pay_RZP1', payment: capturedPayment() });

    expect(recordPayment).not.toHaveBeenCalled();
    expect(settled.status).toBe('review');
    expect(settled.reviewReason).toMatch(/₹2,000 more was paid/);
  });
});

describe('planAllocations', () => {
  const open = [
    { _id: 'd1', balance: 1000 },
    { _id: 'd2', balance: 2500 },
    { _id: 'd3', balance: 2500 }
  ];
  it('fills the chosen installments first, then the earliest other ones', () => {
    expect(payments.planAllocations(open, ['d3'], 3000)).toEqual({
      allocations: [{ demandId: 'd3', amount: 2500 }, { demandId: 'd1', amount: 500 }],
      left: 0
    });
  });
  it('reports what could not be allocated', () => {
    expect(payments.planAllocations(open, [], 7000).left).toBe(1000);
  });
});

describe('POST /api/school-payments/webhook/:slug', () => {
  let models;
  const app = express();
  app.use('/api/school-payments', publicPayments.router);

  beforeEach(() => {
    models = makeModels();
    publicPayments.setTenantResolver(async (slug) => (slug === 'greenfield' ? { tenant: { slug, dbName: '' }, models } : null));
  });
  afterAll(() => publicPayments.setTenantResolver(null));

  const send = (body, signature, slug = 'greenfield') => request(app)
    .post(`/api/school-payments/webhook/${slug}`)
    .set('Content-Type', 'application/json')
    .set('X-Razorpay-Signature', signature)
    .send(body);

  it('records a signed payment.captured once, however often it is delivered', async () => {
    const body = webhookBody();
    const first = await send(body, hmac(WEBHOOK_SECRET, body));
    const retry = await send(body, hmac(WEBHOOK_SECRET, body));
    const orderPaid = webhookBody('order.paid');
    const third = await send(orderPaid, hmac(WEBHOOK_SECRET, orderPaid));

    expect(first.status).toBe(200);
    expect(first.body.outcome).toBe('paid');
    expect(retry.status).toBe(200);
    expect(third.status).toBe(200);
    expect(recordPayment).toHaveBeenCalledTimes(1);
    expect(models.FeeOnlineOrder.docs[0]).toMatchObject({ status: 'paid', receiptNo: 'REC/26-27/1' });
  });

  it('rejects a bad signature and records nothing', async () => {
    const body = webhookBody();
    const res = await send(body, hmac('not_the_school_secret', body));
    expect(res.status).toBe(400);
    expect(recordPayment).not.toHaveBeenCalled();
    expect(models.FeeOnlineOrder.docs[0].status).toBe('created');
  });

  it('rejects a body changed after signing', async () => {
    const signed = webhookBody();
    const res = await send(webhookBody('payment.captured', capturedPayment({ amount: 1 })), hmac(WEBHOOK_SECRET, signed));
    expect(res.status).toBe(400);
    expect(recordPayment).not.toHaveBeenCalled();
  });

  it('ignores payments that are not for a Capabble order', async () => {
    const body = webhookBody('payment.captured', capturedPayment({ order_id: 'order_SHOP' }));
    const res = await send(body, hmac(WEBHOOK_SECRET, body));
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('not ours');
    expect(recordPayment).not.toHaveBeenCalled();
  });

  it('404s an unknown school', async () => {
    const body = webhookBody();
    const res = await send(body, hmac(WEBHOOK_SECRET, body), 'nowhere');
    expect(res.status).toBe(404);
  });
});

describe('checkout links', () => {
  it('round-trips a signed token and rejects a forged one', () => {
    const token = publicPayments.tokenFor({ slug: 'greenfield', orderId: ORDER_ID });
    expect(publicPayments.readToken(token)).toEqual({ slug: 'greenfield', orderId: ORDER_ID });
    const [payload] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ t: 'other-school', o: ORDER_ID })).toString('base64url');
    expect(publicPayments.readToken(`${forged}.${token.split('.')[1]}`)).toBeNull();
    expect(publicPayments.readToken(`${payload}.bad`)).toBeNull();
  });
});

describe('Capabble\'s own Razorpay keys', () => {
  const PLATFORM_KEY = 'rzp_test_capabble999999';
  beforeEach(() => { process.env.RAZORPAY_KEY_ID = PLATFORM_KEY; });
  afterEach(() => { delete process.env.RAZORPAY_KEY_ID; });

  it('refuses to save them as a school account', async () => {
    const models = makeModels();
    await expect(payments.saveSettings(models, { enabled: true, keyId: PLATFORM_KEY, keySecret: 'x', webhookSecret: 'y' }))
      .rejects.toThrow('Capabble\'s Razorpay keys');
  });

  it('stops taking payments on a school that already saved them, and says why', () => {
    const settings = { ...settingsDoc(), keyId: PLATFORM_KEY };
    expect(payments.credentialsOf(settings)).toBeNull();
    const view = payments.settingsView(settings, 'greenfield');
    expect(view.connected).toBe(false);
    expect(view.lastTestOk).toBe(false);
    expect(view.lastError).toMatch('Capabble\'s Razorpay keys');
  });

  it('leaves a school\'s own keys alone', () => {
    expect(payments.credentialsOf(settingsDoc())).not.toBeNull();
    expect(payments.isPlatformKey('rzp_test_abcdef123456')).toBe(false);
  });

  it('matches nothing when the server has no keys of its own', () => {
    delete process.env.RAZORPAY_KEY_ID;
    expect(payments.isPlatformKey(PLATFORM_KEY)).toBe(false);
  });
});
