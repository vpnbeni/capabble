const { sql, eq } = require('drizzle-orm');
const { createTestDb, expectDbError } = require('./helpers/testDb');
const s = require('../db/schema');

let t;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.close(); });

const expectReject = expectDbError;

async function seedAccount(slug = 'demo') {
  const [account] = await t.db.insert(s.accounts).values({
    tenantId: `t-${slug}`, tenantSlug: slug, tenantName: 'Demo School', billingEmail: 'billing@demo.test'
  }).returning();
  return account;
}

describe('billing schema guards', () => {
  test('migrations create the billing schema', async () => {
    const res = await t.db.execute(sql`select count(*)::int as n from information_schema.tables where table_schema = 'billing'`);
    expect(res.rows[0].n).toBeGreaterThanOrEqual(19);
  });

  test('money cannot be negative', async () => {
    await t.db.insert(s.modules).values({ code: 'attnd', name: 'Attendance' });
    await expectReject(
      t.db.insert(s.modulePrices).values({ moduleCode: 'attnd', interval: 'month', basePaise: -1 }),
      /module_prices_base_nonneg/
    );
  });

  test('module prices for the same interval cannot overlap', async () => {
    const from = new Date('2026-04-01T00:00:00Z');
    await t.db.insert(s.modulePrices).values({ moduleCode: 'attnd', interval: 'month', basePaise: 150000, effectiveFrom: from });
    await expectReject(
      t.db.insert(s.modulePrices).values({ moduleCode: 'attnd', interval: 'month', basePaise: 160000, effectiveFrom: new Date('2026-05-01T00:00:00Z') }),
      /module_prices_no_overlap/
    );
    // A yearly price alongside is fine.
    await t.db.insert(s.modulePrices).values({ moduleCode: 'attnd', interval: 'year', basePaise: 1500000, effectiveFrom: from });
  });

  test('coupon must have exactly one discount kind and an uppercase code', async () => {
    await expectReject(t.db.insert(s.coupons).values({ code: 'BOTH10', percentBps: 1000, fixedPaise: 100 }), /coupons_one_discount/);
    await expectReject(t.db.insert(s.coupons).values({ code: 'lower10', percentBps: 1000 }), /coupons_code_upper/);
    await t.db.insert(s.coupons).values({ code: 'WELCOME10', percentBps: 1000 });
  });

  test('GSTIN format is enforced', async () => {
    await expectReject(
      t.db.insert(s.accounts).values({ tenantId: 'x', tenantSlug: 'bad', tenantName: 'x', billingEmail: 'x@x.test', gstin: '07ABC' }),
      /accounts_gstin_format/
    );
  });

  test('only one live subscription per account', async () => {
    const account = await seedAccount('one-live');
    await t.db.insert(s.subscriptions).values({ accountId: account.id, state: 'trialing' });
    await expectReject(t.db.insert(s.subscriptions).values({ accountId: account.id, state: 'active' }), /subscriptions_one_live_per_account_uq/);
    await t.db.update(s.subscriptions).set({ state: 'canceled' }).where(eq(s.subscriptions.accountId, account.id));
    await t.db.insert(s.subscriptions).values({ accountId: account.id, state: 'active' });
  });

  test('invoice totals must add up and IGST excludes CGST/SGST', async () => {
    const account = await seedAccount('totals');
    const base = { accountId: account.id, reason: 'manual', number: 'X1', supplier: {}, buyer: {}, subtotalPaise: 1000, taxablePaise: 1000 };
    await expectReject(t.db.insert(s.invoices).values({ ...base, cgstPaise: 90, sgstPaise: 90, totalPaise: 1000 }), /invoices_total/);
    await expectReject(t.db.insert(s.invoices).values({ ...base, cgstPaise: 90, igstPaise: 180, totalPaise: 1270 }), /invoices_igst_xor_split/);
    await t.db.insert(s.invoices).values({ ...base, cgstPaise: 90, sgstPaise: 90, totalPaise: 1180 });
  });

  test('issued invoice amounts and lines are locked; paid cannot change status', async () => {
    const account = await seedAccount('locked');
    const [inv] = await t.db.insert(s.invoices).values({
      accountId: account.id, reason: 'manual', number: 'X2', supplier: {}, buyer: {}, subtotalPaise: 1000, taxablePaise: 1000, igstPaise: 180, totalPaise: 1180
    }).returning();
    await t.db.insert(s.invoiceLines).values({
      invoiceId: inv.id, position: 1, kind: 'module', description: 'x', hsnSac: '998314', unitPaise: 1000, amountPaise: 1000, taxablePaise: 1000, taxRateBps: 1800, igstPaise: 180
    });
    await expectReject(t.db.update(s.invoices).set({ subtotalPaise: 2000, taxablePaise: 2000, totalPaise: 2180 }).where(eq(s.invoices.id, inv.id)), /cannot change its amounts/);
    await expectReject(t.db.delete(s.invoiceLines).where(eq(s.invoiceLines.invoiceId, inv.id)), /issued invoice cannot change/);
    await t.db.update(s.invoices).set({ status: 'paid', amountPaidPaise: 1180 }).where(eq(s.invoices.id, inv.id));
    await expectReject(t.db.update(s.invoices).set({ status: 'void' }).where(eq(s.invoices.id, inv.id)), /cannot move to void/);
  });

  test('audit log is append-only', async () => {
    await t.db.insert(s.auditLog).values({ actorType: 'system', entityType: 'test', entityId: '1', action: 'created' });
    await expectReject(t.db.update(s.auditLog).set({ action: 'edited' }), /append-only/);
    await expectReject(t.db.delete(s.auditLog), /append-only/);
  });

  test('webhook events are unique per provider event id', async () => {
    const row = { provider: 'razorpay', eventId: 'evt_1', eventType: 'payment.captured', payload: {} };
    await t.db.insert(s.webhookEvents).values(row);
    await expectReject(t.db.insert(s.webhookEvents).values(row), /webhook_events_provider_event_uq/);
  });

  test('a provider payment id is recorded once', async () => {
    const account = await seedAccount('pay-once');
    const row = { accountId: account.id, provider: 'razorpay', providerPaymentId: 'pay_1', status: 'captured', amountPaise: 100, receiptNumber: 'R1' };
    await t.db.insert(s.payments).values(row);
    await expectReject(t.db.insert(s.payments).values({ ...row, receiptNumber: 'R2' }), /payments_provider_payment_uq/);
  });
});
