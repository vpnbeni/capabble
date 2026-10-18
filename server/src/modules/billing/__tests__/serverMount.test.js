// The billing routes as the real server app mounts them.
process.env.NODE_ENV = 'test';
process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_mount';

// Puppeteer (PDF exports elsewhere in the server) can't load under --experimental-vm-modules.
jest.mock('puppeteer', () => ({ launch: jest.fn() }));

const crypto = require('crypto');
const request = require('supertest');
const { createTestDb } = require('./helpers/testDb');
const app = require('../../../app');

let t;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.close(); });

describe('server mounting', () => {
  test('a signed Razorpay webhook reaches billing with its raw body intact', async () => {
    // Characters the server's sanitizers would rewrite if they ran first.
    const body = JSON.stringify({ event: 'order.paid', payload: { note: '<b>$set</b>' } });
    const signature = crypto.createHmac('sha256', 'whsec_mount').update(body).digest('hex');
    const res = await request(app).post('/api/webhooks/razorpay')
      .set('content-type', 'application/json')
      .set('x-razorpay-signature', signature)
      .set('x-razorpay-event-id', 'evt_mount_1')
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, status: 'ignored' });
  });

  test('a bad signature is refused', async () => {
    const res = await request(app).post('/api/webhooks/razorpay')
      .set('content-type', 'application/json')
      .set('x-razorpay-signature', 'nope')
      .send('{"event":"payment.captured"}');
    expect(res.status).toBe(401);
  });
});
