process.env.NODE_ENV = 'test';
process.env.BILLING_SERVICE_TOKEN = 'test-token';
process.env.BILLING_SUPPLIER_GSTIN = '07AAACC1234D1Z5';
process.env.BILLING_SUPPLIER_STATE_CODE = '07';
process.env.BILLING_TRIAL_DAYS = '14';
process.env.BILLING_GRACE_DAYS = '7';

const request = require('supertest');
const { eq, sql } = require('drizzle-orm');
const { createTestDb } = require('./helpers/testDb');
const app = require('../src/app');
const s = require('../src/db/schema');
const { seedCatalog } = require('../src/services/seedService');
const subscriptions = require('../src/services/subscriptionService');
const invoices = require('../src/services/invoiceService');
const { getEntitlement } = require('../src/services/entitlementService');
const { allocateNumber } = require('../src/domain/numbering');
const { transaction } = require('../src/db/client');
const sm = require('../src/domain/stateMachine');

let t;
const api = () => ({
  get: (path) => request(app).get(`/internal${path}`).set('x-billing-service-token', 'test-token'),
  post: (path, body = {}) => request(app).post(`/internal${path}`)
    .set('x-billing-service-token', 'test-token')
    .set('x-billing-actor-type', 'platform_admin')
    .set('x-billing-actor-id', 'admin-1')
    .send(body),
});

const ADMIN = { type: 'platform_admin', id: 'admin-1' };

async function onboard(slug, extra = {}) {
  const res = await api().post('/tenants/onboard', {
    tenantId: `tid-${slug}`, tenantSlug: slug, tenantName: `${slug} school`, billingEmail: `${slug}@school.test`, ...extra,
  });
  expect(res.status).toBeLessThan(300);
  return res.body.data;
}

async function payInFull(invoiceId, providerPaymentId) {
  return transaction(async (tx) => {
    const inv = await invoices.lockInvoice(tx, invoiceId);
    return invoices.recordPayment(tx, ADMIN, {
      invoiceId, amountPaise: invoices.outstanding(inv), provider: 'razorpay', providerPaymentId, method: 'upi',
    });
  });
}

beforeAll(async () => {
  t = await createTestDb();
  await seedCatalog(t.db, { withPrices: false });
  // Attendance: ₹1,500/month or ₹15,000/year for 500 students, ₹3/₹30 per extra student.
  for (const [code, month, year, perMonth, perYear] of [
    ['attnd', 150000, 1500000, 300, 3000],
    ['appnt', 100000, 1000000, 200, 2000],
    ['stdnt', 200000, 2000000, 0, 0],
  ]) {
    await api().post(`/admin/modules/${code}/prices`, { interval: 'month', basePaise: month, perStudentPaise: perMonth, effectiveFrom: '2026-01-01T00:00:00Z' }).expect(201);
    await api().post(`/admin/modules/${code}/prices`, { interval: 'year', basePaise: year, perStudentPaise: perYear, effectiveFrom: '2026-01-01T00:00:00Z' }).expect(201);
  }
});
afterAll(async () => { await t.close(); });

describe('service auth', () => {
  test('rejects a missing or wrong token', async () => {
    await request(app).get('/internal/entitlements/x').expect(401);
    await request(app).get('/internal/entitlements/x').set('x-billing-service-token', 'nope').expect(401);
  });
});

describe('entitlement contract', () => {
  test('unknown school keeps the v1 read-only fallback shape', async () => {
    const res = await api().get('/entitlements/nobody').expect(200);
    expect(res.body.data).toMatchObject({
      tenantSlug: 'nobody', state: 'suspended_read_only', accessMode: 'read_only', isReadOnly: true, reason: 'billing_account_missing',
      planCode: null, trialEndsAt: null, graceEndsAt: null,
    });
    expect(res.body.data.entitledModules).toEqual(['core']);
  });

  test('a trial has full access to every module', async () => {
    const data = await onboard('trial-school');
    const e = data.entitlement;
    const v1Keys = ['tenantSlug', 'state', 'accessMode', 'allowedModules', 'isReadOnly', 'reason', 'planCode', 'trialEndsAt', 'graceEndsAt', 'computedAt', 'validUntil'];
    for (const key of v1Keys) expect(e).toHaveProperty(key);
    expect(e).toMatchObject({ state: 'trialing', accessMode: 'full', allowedModules: ['*'], entitledModules: ['*'], isReadOnly: false });
    const days = (new Date(e.trialEndsAt) - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(13.9);
  });

  test('onboarding twice never restarts the trial', async () => {
    const first = await onboard('twice');
    const again = await onboard('twice');
    expect(again.subscription.id).toBe(first.subscription.id);
    expect(again.subscription.trialEndsAt).toBe(first.subscription.trialEndsAt);
  });
});

describe('catalog', () => {
  test('a price change closes the old version and keeps history', async () => {
    await api().post('/admin/modules/appnt/prices', { interval: 'month', basePaise: 120000, perStudentPaise: 200 }).expect(201);
    const history = await api().get('/admin/modules/appnt/prices').expect(200);
    const monthly = history.body.data.filter((p) => p.interval === 'month');
    expect(monthly).toHaveLength(2);
    expect(monthly[0].effectiveTo).toBeNull();
    expect(monthly[1].effectiveTo).not.toBeNull();
    const audit = await api().get('/admin/audit?entityType=module_price&entityId=appnt:month').expect(200);
    expect(audit.body.data[0]).toMatchObject({ action: 'price.changed', actorType: 'platform_admin', actorId: 'admin-1' });
  });

  test('core cannot be priced and validation rejects bad input', async () => {
    await api().post('/admin/modules/core/prices', { interval: 'month', basePaise: 100 }).expect(400);
    await api().post('/admin/modules/attnd/prices', { interval: 'week', basePaise: 100 }).expect(400);
    await api().post('/admin/coupons', { code: 'BOTH', percentBps: 100, fixedPaise: 100 }).expect(400);
  });

  test('bundles and coupons', async () => {
    await api().post('/admin/bundles', { code: 'ops', name: 'Operations', discountBps: 1000, moduleCodes: ['attnd', 'appnt'] }).expect(200);
    await api().post('/admin/coupons', { code: 'welcome10', percentBps: 1000, duration: 'once' }).expect(200);
    const cat = await api().get('/admin/catalog').expect(200);
    expect(cat.body.data.bundles[0].moduleCodes).toEqual(['appnt', 'attnd']);
    expect(cat.body.data.coupons[0].code).toBe('WELCOME10');
  });
});

describe('subscribing and paying', () => {
  let invoice;

  test('profile rejects a bad GSTIN and takes the state from a good one', async () => {
    await onboard('delhi');
    await api().post('/tenant/delhi/profile', { gstin: '07ABC' }).expect(400);
    const res = await api().post('/tenant/delhi/profile', { legalName: 'Delhi Public Trust', gstin: '07AAAPL1234C1Z2', addressLine1: '1 School Road', city: 'New Delhi', postalCode: '110001' }).expect(200);
    expect(res.body.data.stateCode).toBe('07');
  });

  test('preview prices modules by student band, with bundle discount and intra-state GST', async () => {
    const res = await api().post('/tenant/delhi/subscription/preview', {
      modules: ['stdnt'], bundleCode: 'ops', interval: 'year', declaredStudents: 600,
    }).expect(200);
    const q = res.body.data;
    expect(q.modules.map((m) => m.code).sort()).toEqual(['appnt', 'attnd', 'stdnt']);
    expect(q.students).toBe(600);
    // attnd 15,00,000 + 100×3000 overage; appnt 10,00,000 + 100×2000; stdnt 20,00,000. Bundle −10% on attnd+appnt.
    const attnd = 1500000 + 300000;
    const appnt = 1000000 + 200000;
    const expectedTaxable = Math.round(attnd * 0.9) + Math.round(appnt * 0.9) + 2000000;
    expect(q.dueNow.taxablePaise).toBe(expectedTaxable);
    expect(q.dueNow.igstPaise).toBe(0);
    expect(q.dueNow.cgstPaise).toBe(q.dueNow.sgstPaise);
    expect(q.dueNow.totalPaise).toBe(q.dueNow.taxablePaise + q.dueNow.cgstPaise + q.dueNow.sgstPaise);
  });

  test('subscribing during the trial invoices a year starting when the trial ends', async () => {
    const before = await getEntitlement('delhi');
    const res = await api().post('/tenant/delhi/subscription', {
      modules: ['attnd', 'stdnt'], interval: 'year', declaredStudents: 400, couponCode: 'WELCOME10', reportedStudents: 450,
    }).expect(200);
    invoice = res.body.data.invoice;
    expect(invoice.number).toMatch(/^CB\d{4}-\d{6}$/);
    expect(invoice.reason).toBe('subscription_create');
    expect(new Date(invoice.periodStart).toISOString()).toBe(sm.startOfDay(before.trialEndsAt).toISOString());
    expect(invoice.studentsBilled).toBe(450);
    expect(invoice.discountPaise).toBe(Math.round((1500000 + 2000000) * 0.1));
    // Still trialing until paid.
    expect((await getEntitlement('delhi')).state).toBe('trialing');
  });

  test('a duplicate provider payment is recorded once', async () => {
    const first = await payInFull(invoice.id, 'pay_dup_1');
    expect(first.duplicate).toBe(false);
    expect(first.invoice.status).toBe('paid');
    expect(first.payment.receiptNumber).toMatch(/^RC\d{4}-\d{6}$/);
    const again = await transaction((tx) => invoices.recordPayment(tx, ADMIN, {
      invoiceId: invoice.id, amountPaise: first.payment.amountPaise, provider: 'razorpay', providerPaymentId: 'pay_dup_1',
    }));
    expect(again.duplicate).toBe(true);
    const rows = await t.db.select().from(s.payments).where(eq(s.payments.invoiceId, invoice.id));
    expect(rows).toHaveLength(1);
  });

  test('paying activates the subscription and entitles exactly the bought modules', async () => {
    const e = await getEntitlement('delhi');
    expect(e.state).toBe('active');
    expect(e.entitledModules).toEqual(['attnd', 'core', 'stdnt']);
    expect(e.planCode).toBe('modules');
    expect(e.studentsBilled).toBe(450);
    const coupon = await t.db.select().from(s.coupons).where(eq(s.coupons.code, 'WELCOME10'));
    expect(coupon[0].redeemedCount).toBe(1);
  });

  test('adding a module mid-period is prorated; removing waits for the period end', async () => {
    const now = new Date();
    const res = await api().post('/tenant/delhi/subscription', { modules: ['attnd', 'appnt'], interval: 'year' }).expect(200);
    const change = res.body.data.invoice;
    expect(change.reason).toBe('change');
    const detail = await api().get(`/tenant/delhi/invoices/${change.id}`).expect(200);
    expect(detail.body.data.lines.every((l) => l.kind === 'proration' && l.moduleCode === 'appnt')).toBe(true);
    const sub = res.body.data.subscription;
    const days = prorationDays(now, sub);
    expect(detail.body.data.lines[0].amountPaise).toBe(Math.round((1000000 * days.remaining) / days.total));
    const e = await getEntitlement('delhi');
    expect(e.entitledModules).toEqual(['appnt', 'attnd', 'core', 'stdnt']); // stdnt stays until period end
    const items = await subscriptions.liveItems(t.db, sub.id);
    expect(items.find((i) => i.moduleCode === 'stdnt').endsAtPeriodEnd).toBe(true);
  });

  test('renewal invoice bills max(declared, reported) and drops removed modules once paid', async () => {
    const [sub] = await t.db.select().from(s.subscriptions).where(sql`${s.subscriptions.id} = (select id from billing.subscriptions where account_id = (select id from billing.accounts where tenant_slug = 'delhi') and state <> 'canceled')`);
    // Pay the open change invoice first.
    const open = await invoices.openInvoicesFor(sub.id);
    for (const inv of open) await payInFull(inv.id, `pay_${inv.id}`);

    const nearEnd = sm.addDays(sub.currentPeriodEnd, -3);
    const renewal = await subscriptions.createRenewalInvoice(ADMIN, sub.id, { reportedStudents: 700, now: nearEnd });
    expect(renewal.reason).toBe('renewal');
    expect(renewal.studentsBilled).toBe(700);
    expect(new Date(renewal.periodStart).toISOString()).toBe(new Date(sub.currentPeriodEnd).toISOString());
    const lines = (await invoices.getInvoice(renewal.id)).lines;
    expect(lines.map((l) => l.moduleCode)).not.toContain('stdnt');
    expect(lines.find((l) => l.kind === 'overage' && l.moduleCode === 'attnd').quantity).toBe(200);
    // WELCOME10 was once-only, so no discount on renewal.
    expect(renewal.discountPaise).toBe(0);
    // Creating it again is a no-op.
    expect(await subscriptions.createRenewalInvoice(ADMIN, sub.id, { reportedStudents: 700, now: nearEnd })).toBeNull();

    await payInFull(renewal.id, 'pay_renewal_1');
    const e = await getEntitlement('delhi');
    expect(e.entitledModules).toEqual(['appnt', 'attnd', 'core']);
    expect(new Date(e.periodEndsAt) > new Date(sub.currentPeriodEnd)).toBe(true);
  });
});

function prorationDays(now, sub) {
  const total = Math.round((new Date(sub.currentPeriodEnd) - new Date(sub.currentPeriodStart)) / 86400000);
  const remaining = Math.min(total, Math.ceil((new Date(sub.currentPeriodEnd) - now) / 86400000));
  return { total, remaining };
}

describe('GST by place of supply', () => {
  test('a school registered in another state is charged IGST', async () => {
    await onboard('mumbai');
    await api().post('/tenant/mumbai/profile', { gstin: '27AAPFU0939F1ZV' }).expect(200);
    const res = await api().post('/tenant/mumbai/subscription', { modules: ['attnd'], interval: 'month', declaredStudents: 100 }).expect(200);
    const inv = res.body.data.invoice;
    expect(inv.placeOfSupply).toBe('27');
    expect(inv.cgstPaise + inv.sgstPaise).toBe(0);
    expect(inv.igstPaise).toBe(27000);
    expect(inv.totalPaise).toBe(177000);
    expect(inv.buyer.gstin).toBe('27AAPFU0939F1ZV');
  });
});

describe('state changes over time', () => {
  test('unpaid trial goes to grace, then read-only; extension restores grace; payment activates', async () => {
    const { subscription } = await onboard('late-payer');
    const afterTrial = sm.addDays(subscription.trialEndsAt, 1);
    let e = await getEntitlement('late-payer', afterTrial);
    expect(e).toMatchObject({ state: 'past_due_grace', accessMode: 'full' });
    e = await getEntitlement('late-payer', sm.addDays(subscription.trialEndsAt, 9));
    expect(e).toMatchObject({ state: 'suspended_read_only', accessMode: 'read_only', isReadOnly: true });

    await api().post('/admin/tenants/late-payer/grant-extension', { days: 5 }).expect(200);
    expect((await getEntitlement('late-payer')).state).toBe('past_due_grace');

    const res = await api().post('/admin/tenants/late-payer/change-plan', { modules: ['attnd'], interval: 'month' }).expect(200);
    const inv = res.body.data.invoice;
    const pay = await api().post(`/admin/tenants/late-payer/invoices/${inv.id}/payments/offline`, { amountPaise: inv.totalPaise, method: 'offline_bank', reference: 'NEFT123' }).expect(201);
    expect(pay.body.data.invoice.status).toBe('paid');
    expect((await getEntitlement('late-payer')).state).toBe('active');

    const audit = await api().get(`/admin/audit?accountId=${res.body.data.account.id}`).expect(200);
    const actions = audit.body.data.map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['subscription.state_changed', 'subscription.extended', 'invoice.issued', 'payment.recorded', 'invoice.paid']));
  });

  test('cancel at period end, then canceled and read-only', async () => {
    const { subscription } = await onboard('leaver');
    await api().post('/tenant/leaver/cancel', {}).expect(200);
    const e = await getEntitlement('leaver', sm.addDays(subscription.trialEndsAt, 1));
    expect(e).toMatchObject({ state: 'canceled', accessMode: 'read_only' });
  });
});

describe('credit notes and voids', () => {
  let inv;
  beforeAll(async () => {
    await onboard('refunds');
    const res = await api().post('/tenant/refunds/subscription', { modules: ['attnd'], interval: 'month' }).expect(200);
    inv = res.body.data.invoice;
  });

  test('an unpaid invoice can be voided; a void invoice cannot be paid', async () => {
    await api().post(`/admin/tenants/refunds/invoices/${inv.id}/void`, { reason: 'test' }).expect(200);
    await api().post(`/admin/tenants/refunds/invoices/${inv.id}/payments/offline`, { amountPaise: 100, method: 'offline_cash' }).expect(409);
  });

  test('partial credit note splits tax like the invoice and cannot over-credit', async () => {
    const res = await api().post('/tenant/refunds/subscription', { modules: ['attnd'], interval: 'month' }).expect(200);
    const paidInv = res.body.data.invoice;
    await api().post(`/admin/tenants/refunds/invoices/${paidInv.id}/payments/offline`, { amountPaise: paidInv.totalPaise, method: 'offline_bank' }).expect(201);
    const cn = await api().post(`/admin/tenants/refunds/invoices/${paidInv.id}/credit-notes`, { amountPaise: 59000, reason: 'Goodwill', refundPaise: 59000 }).expect(201);
    const note = cn.body.data.creditNote;
    expect(note.number).toMatch(/^CN\d{4}-\d{6}$/);
    expect(note.taxablePaise).toBe(50000);
    expect(note.cgstPaise + note.sgstPaise + note.igstPaise).toBe(9000);
    expect(note.refundStatus).toBe('processed'); // offline payment: refunded by hand
    await api().post(`/admin/tenants/refunds/invoices/${paidInv.id}/credit-notes`, { amountPaise: paidInv.totalPaise, reason: 'Too much' }).expect(400);
    await api().post(`/admin/tenants/refunds/invoices/${paidInv.id}/void`, {}).expect(409);
  });
});

describe('document numbers', () => {
  test('are unique and gapless within a financial year', async () => {
    const date = new Date('2030-06-01T00:00:00Z');
    const results = await Promise.all(Array.from({ length: 20 }, () => transaction((tx) => allocateNumber(tx, 'CN', date))));
    const values = results.map((r) => r.value).sort((a, b) => a - b);
    expect(values).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(results[0].financialYear).toBe('2030-31');
  });
});

describe('admin listing', () => {
  test('lists schools with their state', async () => {
    const res = await api().get('/admin/tenants?search=delhi').expect(200);
    expect(res.body.data.items[0].entitlement.state).toBe('active');
    const detail = await api().get('/admin/tenants/delhi').expect(200);
    expect(detail.body.data.invoices.length).toBeGreaterThanOrEqual(3);
    expect(detail.body.data.payments.length).toBeGreaterThanOrEqual(3);
  });
});
