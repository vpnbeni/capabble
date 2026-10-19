process.env.NODE_ENV = 'test';
process.env.BILLING_SUPPLIER_STATE_CODE = '07';
process.env.BILLING_TRIAL_DAYS = '14';
process.env.BILLING_GRACE_DAYS = '7';
process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test';

const crypto = require('crypto');
const request = require('supertest');
const { eq, and } = require('drizzle-orm');
const { createTestDb } = require('./helpers/testDb');
const app = require('./helpers/testApp');
const s = require('../db/schema');
const billing = require('..');
const razorpay = require('../providers/razorpay');
const mailer = require('../services/mailer');
const trials = require('../services/trialService');
const trialNotices = require('../services/trialNotices');
const { seedCatalog } = require('../services/seedService');
const { getEntitlement } = require('../services/entitlementService');
const subscriptions = require('../services/subscriptionService');
const sm = require('../domain/stateMachine');
const { SYSTEM_ACTOR } = require('../services/auditService');

const DAY = 86400000;
let t;
const sent = [];

/** Razorpay subscriptions (autopay mandates) in memory. */
function fakeRazorpay() {
  const subs = new Map();
  let n = 0;
  return {
    subs,
    plans: { create: async (params) => ({ id: `plan_${n + 1}`, ...params }) },
    subscriptions: {
      create: async (params) => {
        n += 1;
        const sub = { id: `sub_${n}`, status: 'created', short_url: `https://rzp.io/i/sub${n}`, start_at: params.start_at, params };
        subs.set(sub.id, sub);
        return sub;
      },
      fetch: async (id) => subs.get(id),
      cancel: async (id) => { subs.get(id).status = 'cancelled'; return subs.get(id); }
    }
  };
}
let rz;

const school = (slug) => ({
  post: (path, body = {}) => request(app).post(`/internal/tenant/${slug}${path}`).set('x-billing-actor-type', 'school_user').send(body),
  get: (path) => request(app).get(`/internal/tenant/${slug}${path}`)
});

function webhook(event, eventId) {
  const body = JSON.stringify(event);
  return request(app).post('/webhooks/razorpay')
    .set('content-type', 'application/json')
    .set('x-razorpay-signature', crypto.createHmac('sha256', 'whsec_test').update(body).digest('hex'))
    .set('x-razorpay-event-id', eventId)
    .send(body);
}

const register = (slug) => billing.registerSchool({
  tenantId: `tid-${slug}`, tenantSlug: slug, tenantName: `${slug} school`, billingEmail: `${slug}@school.test`
});

const subOf = async (slug) => {
  const [account] = await t.db.select().from(s.accounts).where(eq(s.accounts.tenantSlug, slug));
  return subscriptions.findSubscription(t.db, account.id);
};
const mailsTo = (slug, subjectPart) => sent.filter((m) => m.to === `${slug}@school.test` && (!subjectPart || m.subject.includes(subjectPart)));

beforeAll(async () => {
  t = await createTestDb();
  await seedCatalog(t.db, { withPrices: true });
  rz = fakeRazorpay();
  razorpay.setClient(rz);
  mailer.setTransport({ sendMail: async (m) => { sent.push(m); } });
});
afterAll(async () => { razorpay.setClient(null); mailer.setTransport(null); await t.close(); });

describe('a new school', () => {
  test('gets an account and one invite, but no trial until it opts in', async () => {
    await register('fresh');
    await register('fresh');
    const e = await getEntitlement('fresh');
    expect(e).toMatchObject({ accessMode: 'setup_required', reason: 'plan_required', state: null, isReadOnly: false });
    expect(await subOf('fresh')).toBeNull();
    expect(mailsTo('fresh', 'days of Capabble are ready')).toHaveLength(1);
  });

  test('sees the trial terms before agreeing to them', async () => {
    const res = await school('fresh').post('/trial/preview', { modules: ['attnd'], interval: 'year', declaredStudents: 300 }).expect(200);
    const d = res.body.data;
    expect(d.trialDays).toBe(14);
    expect(d.autopay).toBe(false);
    expect(d.firstChargePaise).toBe(d.quote.dueNow.totalPaise);
    expect(new Date(d.trialEndsAt) - Date.now()).toBeGreaterThan(13.9 * DAY);
    expect(new Date(d.reminderOn) - new Date(d.trialEndsAt)).toBe(-7 * DAY);
    expect(d.consentText).toMatch(/invoice ₹[\d,]+\.\d\d on .* until I cancel/);
  });
});

describe('opting in without autopay', () => {
  test('needs the school to agree to the terms', async () => {
    await school('fresh').post('/trial/start', { modules: ['attnd'] }).expect(400);
    await school('fresh').post('/trial/start', { modules: ['attnd'], consent: false }).expect(400);
  });

  test('starts the trial: every module open, the chosen ones remembered, nothing invoiced', async () => {
    const res = await school('fresh').post('/trial/start', { modules: ['attnd', 'stdnt'], interval: 'year', declaredStudents: 300, consent: true }).expect(201);
    expect(res.body.data.state).toBe('trialing');
    expect(res.body.data.authorizeUrl).toBeUndefined();
    const e = await getEntitlement('fresh');
    expect(e).toMatchObject({ state: 'trialing', accessMode: 'full', entitledModules: ['*'], plannedModules: ['attnd', 'stdnt'], autopay: false });
    const sub = await subOf('fresh');
    expect(sub.trialConsentText).toMatch(/I understand Capabble will invoice/);
    expect(sub.trialStartedAt).not.toBeNull();
    expect(await t.db.select().from(s.invoices).where(eq(s.invoices.subscriptionId, sub.id))).toHaveLength(0);
    expect(mailsTo('fresh', 'trial is on')).toHaveLength(1);
  });

  test('cannot start a second trial', async () => {
    await school('fresh').post('/trial/start', { modules: ['attnd'], consent: true }).expect(409);
  });

  test('changing the plan during the trial invoices nothing', async () => {
    const res = await school('fresh').post('/subscription', { modules: ['attnd', 'appnt'], interval: 'year' }).expect(200);
    expect(res.body.data.state).toBe('trialing');
    expect((await getEntitlement('fresh')).plannedModules).toEqual(['appnt', 'attnd']);
    const sub = await subOf('fresh');
    expect(await t.db.select().from(s.invoices).where(eq(s.invoices.subscriptionId, sub.id))).toHaveLength(0);
  });

  test('a week before the end: the conversion invoice and the reminder; once paid only the plan stays on', async () => {
    const sub = await subOf('fresh');
    const weekBefore = new Date(new Date(sub.trialEndsAt).getTime() - 6.5 * DAY);
    expect(await trials.issueConversionInvoices(SYSTEM_ACTOR, weekBefore)).toBe(1);
    expect(await trials.issueConversionInvoices(SYSTEM_ACTOR, weekBefore)).toBe(0);
    await trialNotices.sendTrialReminders(weekBefore);
    await trialNotices.sendTrialReminders(weekBefore);
    expect(mailsTo('fresh', 'days left of everything')).toHaveLength(1);

    const [inv] = await t.db.select().from(s.invoices).where(eq(s.invoices.subscriptionId, sub.id));
    expect(inv.reason).toBe('subscription_create');
    expect(new Date(inv.periodStart).toISOString()).toBe(sm.startOfDay(sub.trialEndsAt).toISOString());
    await request(app).post(`/internal/admin/tenants/fresh/invoices/${inv.id}/payments/offline`)
      .set('x-billing-actor-type', 'platform_admin')
      .send({ amountPaise: inv.totalPaise, method: 'offline_bank', reference: 'NEFT-1' }).expect(201);
    const e = await getEntitlement('fresh');
    expect(e.state).toBe('active');
    expect(e.entitledModules).toEqual(['appnt', 'attnd', 'core']);
  });
});

describe('cancelling a trial', () => {
  test('keeps access until the end, charges nothing, then closes', async () => {
    await register('quitter');
    await school('quitter').post('/trial/start', { modules: ['attnd'], consent: true }).expect(201);
    await school('quitter').post('/cancel', {}).expect(200);
    const sub = await subOf('quitter');
    expect(sub.cancelAtPeriodEnd).toBe(true);
    expect(mailsTo('quitter', 'trial is cancelled')).toHaveLength(1);
    expect(await trials.issueConversionInvoices(SYSTEM_ACTOR, new Date(new Date(sub.trialEndsAt).getTime() - DAY))).toBe(0);
    const after = await getEntitlement('quitter', new Date(new Date(sub.trialEndsAt).getTime() + DAY));
    expect(after.state).toBe('canceled');
  });
});

describe('opting in with autopay', () => {
  beforeAll(() => {
    process.env.BILLING_AUTODEBIT_ENABLED = 'true';
    process.env.BILLING_TRIAL_REQUIRES_MANDATE = 'true';
  });
  afterAll(() => {
    delete process.env.BILLING_AUTODEBIT_ENABLED;
    delete process.env.BILLING_TRIAL_REQUIRES_MANDATE;
  });

  let rzSubId;

  test('waits for the mandate before the trial starts', async () => {
    await register('auto');
    const res = await school('auto').post('/trial/start', { modules: ['attnd'], interval: 'year', declaredStudents: 200, consent: true }).expect(201);
    const d = res.body.data;
    expect(d).toMatchObject({ state: 'incomplete', autopay: true });
    expect(d.authorizeUrl).toMatch(/^https:\/\/rzp\.io\//);
    expect(d.consentText).toMatch(/I authorise Capabble to charge/);
    rzSubId = d.providerSubscriptionId;
    const mandate = rz.subs.get(rzSubId);
    expect(mandate.params.start_at).toBe(Math.floor(new Date(d.trialEndsAt).getTime() / 1000));
    expect((await getEntitlement('auto')).accessMode).toBe('setup_required');
  });

  test('the authorised mandate starts the trial, once', async () => {
    const entity = { ...rz.subs.get(rzSubId), status: 'authenticated', payment_method: 'upi' };
    const event = { event: 'subscription.authenticated', payload: { subscription: { entity } } };
    await webhook(event, 'evt_auth_1').expect(200);
    await webhook(event, 'evt_auth_1').expect(200);
    const e = await getEntitlement('auto');
    expect(e).toMatchObject({ state: 'trialing', accessMode: 'full', autopay: true });
    expect(mailsTo('auto', 'trial is on')).toHaveLength(1);
  });

  test('the pre-debit notice goes out the day before', async () => {
    const sub = await subOf('auto');
    await trialNotices.sendTrialReminders(new Date(new Date(sub.trialEndsAt).getTime() - 12 * 3600000));
    expect(mailsTo('auto', 'Pre-debit notice')).toHaveLength(1);
  });

  test('the first charge pays the conversion invoice and activates the plan', async () => {
    const sub = await subOf('auto');
    const payment = { id: 'pay_auto_1', amount: sub.autopayAmountPaise, status: 'captured', method: 'upi', created_at: Math.floor(Date.now() / 1000) };
    await webhook({ event: 'subscription.charged', payload: { subscription: { entity: { id: rzSubId } }, payment: { entity: payment } } }, 'evt_charge_1').expect(200);
    const [inv] = await t.db.select().from(s.invoices).where(and(eq(s.invoices.subscriptionId, sub.id), eq(s.invoices.reason, 'subscription_create')));
    expect(inv.status).toBe('paid');
    expect(inv.totalPaise).toBe(sub.autopayAmountPaise);
    expect((await getEntitlement('auto')).state).toBe('active');
  });

  test('an abandoned checkout lapses after a day and the school can opt in again', async () => {
    await register('later');
    await school('later').post('/trial/start', { modules: ['attnd'], consent: true }).expect(201);
    const e = await getEntitlement('later', new Date(Date.now() + 25 * 3600000));
    expect(e).toMatchObject({ accessMode: 'setup_required', subscriptionId: null });
    await school('later').post('/trial/start', { modules: ['attnd'], consent: true }).expect(201);
  });
});
