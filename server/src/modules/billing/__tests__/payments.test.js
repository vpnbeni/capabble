process.env.NODE_ENV = 'test';
process.env.BILLING_SUPPLIER_STATE_CODE = '07';
process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test';

const crypto = require('crypto');
const request = require('supertest');
const { eq } = require('drizzle-orm');
const { createTestDb } = require('./helpers/testDb');
const app = require('./helpers/testApp');
const s = require('../db/schema');
const razorpay = require('../providers/razorpay');
const { seedCatalog } = require('../services/seedService');
const { getEntitlement } = require('../services/entitlementService');

/** In-memory stand-in for the Razorpay SDK. */
function fakeRazorpay() {
  const links = new Map();
  const refunds = [];
  let n = 0;
  return {
    links,
    refunds,
    failRefunds: false,
    paymentLink: {
      create: async (params) => {
        n += 1;
        const link = { id: `plink_${n}`, short_url: `https://rzp.io/i/test${n}`, status: 'created', amount: params.amount, params, payments: null };
        links.set(link.id, link);
        return link;
      },
      fetch: async (id) => links.get(id),
      cancel: async (id) => { links.get(id).status = 'cancelled'; return links.get(id); }
    },
    payments: {
      refund: async function refund(paymentId, params) {
        if (this.owner.failRefunds) throw { statusCode: 400, error: { description: 'refund not allowed' } };
        const r = { id: `rfnd_${refunds.length + 1}`, payment_id: paymentId, amount: params.amount, status: 'pending' };
        refunds.push(r);
        return r;
      }
    }
  };
}

let t;
let rz;
const internal = (method, path, body) => request(app)[method](`/internal${path}`)

  .set('x-billing-actor-type', 'platform_admin')
  .send(body);

function sign(body) {
  return crypto.createHmac('sha256', 'whsec_test').update(body).digest('hex');
}

function webhook(event, { eventId, signature } = {}) {
  const body = JSON.stringify(event);
  return request(app).post('/webhooks/razorpay')
    .set('content-type', 'application/json')
    .set('x-razorpay-signature', signature ?? sign(body))
    .set('x-razorpay-event-id', eventId)
    .send(body);
}

const paidLinkEvent = (link, invoice, paymentId, amount) => ({
  event: 'payment_link.paid',
  payload: {
    payment_link: { entity: { id: link.id, status: 'paid', notes: { invoice_id: invoice.id } } },
    payment: { entity: { id: paymentId, amount, status: 'captured', method: 'upi', created_at: Math.floor(Date.now() / 1000) } }
  }
});

let invoice;

beforeAll(async () => {
  t = await createTestDb();
  await seedCatalog(t.db, { withPrices: true });
  rz = fakeRazorpay();
  rz.payments.owner = rz;
  razorpay.setClient(rz);
  await internal('post', '/tenants/onboard', { tenantId: 't1', tenantSlug: 'payer', tenantName: 'Payer School', billingEmail: 'accounts@payer.test' }).expect(201);
  const res = await internal('post', '/tenant/payer/subscription', { modules: ['attnd'], interval: 'month', declaredStudents: 100 }).expect(200);
  invoice = res.body.data.invoice;
});
afterAll(async () => { razorpay.setClient(null); await t.close(); });

describe('pay now', () => {
  test('creates a payment link for the outstanding amount and reuses it', async () => {
    const first = await internal('post', '/tenant/payer/pay-now', { callbackUrl: 'http://localhost:5173/#/billing?paid=1' }).expect(200);
    expect(first.body.data.paymentLink.url).toMatch(/^https:\/\/rzp\.io\//);
    const link = rz.links.get(first.body.data.paymentLink.id);
    expect(link.amount).toBe(invoice.totalPaise);
    expect(link.params.reference_id).toBe(invoice.number);
    expect(link.params.notes.invoice_id).toBe(invoice.id);
    const again = await internal('post', '/tenant/payer/pay-now', {}).expect(200);
    expect(again.body.data.paymentLink.id).toBe(link.id);
  });

  test('nothing to pay is a 409', async () => {
    await internal('post', '/tenants/onboard', { tenantId: 't2', tenantSlug: 'nothing', tenantName: 'Nothing Due' }).expect(201);
    await internal('post', '/tenant/nothing/pay-now', {}).expect(409);
  });
});

describe('webhooks', () => {
  test('a bad signature is a 401, not a 500', async () => {
    await webhook({ event: 'payment.captured', payload: {} }, { eventId: 'evt_bad', signature: 'abc' }).expect(401);
    await webhook({ event: 'payment.captured', payload: {} }, { eventId: 'evt_bad', signature: '' }).expect(401);
  });

  test('payment_link.paid records the payment once, even when retried', async () => {
    const link = rz.links.get(invoice.paymentLinkId || [...rz.links.keys()][0]);
    const event = paidLinkEvent(link, invoice, 'pay_link_1', invoice.totalPaise);
    const first = await webhook(event, { eventId: 'evt_paid_1' }).expect(200);
    expect(first.body).toMatchObject({ duplicate: false, status: 'processed' });
    const retry = await webhook(event, { eventId: 'evt_paid_1' }).expect(200);
    expect(retry.body.duplicate).toBe(true);
    // Razorpay also sends payment.captured for the same payment under another event id.
    const captured = { event: 'payment.captured', payload: { payment: { entity: { ...event.payload.payment.entity, notes: { invoice_id: invoice.id } } } } };
    await webhook(captured, { eventId: 'evt_captured_1' }).expect(200);

    const rows = await t.db.select().from(s.payments).where(eq(s.payments.invoiceId, invoice.id));
    expect(rows.filter((p) => p.status === 'captured')).toHaveLength(1);
    expect(rows[0]).toMatchObject({ method: 'upi', providerPaymentId: 'pay_link_1' });
    const [inv] = await t.db.select().from(s.invoices).where(eq(s.invoices.id, invoice.id));
    expect(inv.status).toBe('paid');
    expect((await getEntitlement('payer')).state).toBe('active');
  });

  test('a failed event can be retried and succeeds the second time', async () => {
    await internal('post', '/tenants/onboard', { tenantId: 't3', tenantSlug: 'retry', tenantName: 'Retry School' }).expect(201);
    const res = await internal('post', '/tenant/retry/subscription', { modules: ['appnt'], interval: 'month' }).expect(200);
    const inv = res.body.data.invoice;
    const event = paidLinkEvent({ id: 'plink_unknown' }, inv, 'pay_retry_1', inv.totalPaise);
    // First delivery fails: the invoice it names has been voided.
    await t.pg.query(`update billing.invoices set status = 'void' where id = '${inv.id}'`);
    await webhook(event, { eventId: 'evt_retry' }).expect(409);
    const [failed] = await t.db.select().from(s.webhookEvents).where(eq(s.webhookEvents.eventId, 'evt_retry'));
    expect(failed).toMatchObject({ status: 'failed', attempts: 1 });

    const res2 = await internal('post', '/tenant/retry/subscription', { modules: ['appnt'], interval: 'month' }).expect(200);
    const fixed = { ...event, payload: { ...event.payload, payment_link: { entity: { id: 'plink_x', notes: { invoice_id: res2.body.data.invoice.id } } } } };
    // Razorpay retries with the same event id; this time the invoice is payable.
    const second = await webhook(fixed, { eventId: 'evt_retry' }).expect(200);
    expect(second.body.status).toBe('processed');
    const [done] = await t.db.select().from(s.webhookEvents).where(eq(s.webhookEvents.eventId, 'evt_retry'));
    expect(done).toMatchObject({ status: 'processed', attempts: 2 });
  });

  test('payment.failed is logged as a failed attempt', async () => {
    await internal('post', '/tenants/onboard', { tenantId: 't4', tenantSlug: 'declined', tenantName: 'Declined School' }).expect(201);
    const res = await internal('post', '/tenant/declined/subscription', { modules: ['appnt'], interval: 'month' }).expect(200);
    const inv = res.body.data.invoice;
    await webhook({ event: 'payment.failed', payload: { payment: { entity: { id: 'pay_fail_1', amount: inv.totalPaise, method: 'card', status: 'failed', error_description: 'Card declined', notes: { invoice_id: inv.id } } } } }, { eventId: 'evt_fail_1' }).expect(200);
    const rows = await t.db.select().from(s.payments).where(eq(s.payments.invoiceId, inv.id));
    expect(rows[0]).toMatchObject({ status: 'failed', failureReason: 'Card declined', method: 'card' });
    // The same payment id later succeeding turns that row into the captured payment.
    await webhook(paidLinkEvent({ id: 'plink_y' }, inv, 'pay_fail_1', inv.totalPaise), { eventId: 'evt_fail_then_ok' }).expect(200);
    const after = await t.db.select().from(s.payments).where(eq(s.payments.invoiceId, inv.id));
    expect(after).toHaveLength(1);
    expect(after[0].status).toBe('captured');
  });

  test('unknown events are stored and ignored', async () => {
    const res = await webhook({ event: 'order.paid', payload: {} }, { eventId: 'evt_order' }).expect(200);
    expect(res.body.status).toBe('ignored');
  });
});

describe('reconcile', () => {
  test('records a paid link when the webhook has not arrived', async () => {
    await internal('post', '/tenants/onboard', { tenantId: 't5', tenantSlug: 'returning', tenantName: 'Returning School' }).expect(201);
    const sub = await internal('post', '/tenant/returning/subscription', { modules: ['attnd'], interval: 'month' }).expect(200);
    const inv = sub.body.data.invoice;
    const pay = await internal('post', '/tenant/returning/pay-now', {}).expect(200);
    const link = rz.links.get(pay.body.data.paymentLink.id);
    link.status = 'paid';
    link.payments = [{ payment_id: 'pay_rec_1', amount: inv.totalPaise, method: 'netbanking', status: 'captured', created_at: Math.floor(Date.now() / 1000) }];
    const rec = await internal('post', '/tenant/returning/pay-now/reconcile', {}).expect(200);
    expect(rec.body.data.recorded).toHaveLength(1);
    expect(rec.body.data.invoices[0].status).toBe('paid');
    const again = await internal('post', '/tenant/returning/pay-now/reconcile', {}).expect(200);
    expect(again.body.data.recorded).toHaveLength(0);
  });
});

describe('refunds', () => {
  test('a credit note with a refund calls Razorpay after commit and tracks the webhook', async () => {
    const cn = await internal('post', `/admin/tenants/payer/invoices/${invoice.id}/credit-notes`, { amountPaise: 11800, reason: 'Duplicate module', refundPaise: 11800 }).expect(201);
    const note = cn.body.data.creditNote;
    expect(note.providerRefundId).toBe('rfnd_1');
    expect(note.refundStatus).toBe('pending');
    expect(rz.refunds[0]).toMatchObject({ payment_id: 'pay_link_1', amount: 11800 });
    await webhook({ event: 'refund.processed', payload: { refund: { entity: { id: 'rfnd_1', status: 'processed' } } } }, { eventId: 'evt_refund_1' }).expect(200);
    const [row] = await t.db.select().from(s.creditNotes).where(eq(s.creditNotes.id, note.id));
    expect(row.refundStatus).toBe('processed');
  });

  test('a refund Razorpay rejects is marked failed and the balance is given back', async () => {
    rz.failRefunds = true;
    const cn = await internal('post', `/admin/tenants/payer/invoices/${invoice.id}/credit-notes`, { amountPaise: 1000, reason: 'Test', refundPaise: 1000 }).expect(201);
    rz.failRefunds = false;
    expect(cn.body.data.creditNote.refundStatus).toBe('failed');
    expect(cn.body.message).toMatch(/refund failed/);
    const [payment] = await t.db.select().from(s.payments).where(eq(s.payments.providerPaymentId, 'pay_link_1'));
    expect(payment.refundedPaise).toBe(11800);
  });
});
