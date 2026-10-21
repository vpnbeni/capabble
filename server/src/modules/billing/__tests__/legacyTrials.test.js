process.env.NODE_ENV = 'test';
process.env.BILLING_TRIAL_DAYS = '14';
process.env.BILLING_APP_URL = 'https://school.test/#/billing';

const { eq } = require('drizzle-orm');
const { createTestDb } = require('./helpers/testDb');
const s = require('../db/schema');
const billing = require('..');
const mailer = require('../services/mailer');
const { seedCatalog } = require('../services/seedService');

let t;
const sent = [];

const school = (slug) => ({
  tenantId: `tid-${slug}`, tenantSlug: slug, tenantName: `${slug} school`, billingEmail: `${slug}@school.test`
});
const bySlug = (rows) => Object.fromEntries(rows.map((r) => [r.tenantSlug, r.status]));

beforeAll(async () => {
  t = await createTestDb();
  await seedCatalog(t.db, { withPrices: true });
  mailer.setTransport({ sendMail: async (m) => { sent.push(m); } });

  // A trial from before opt-in: trialing, no consent.
  await billing.onboardTrial(school('legacy'));
  // Opted in: consent recorded.
  const { subscription } = await billing.onboardTrial(school('optin'));
  await t.db.update(s.subscriptions).set({ trialConsentAt: new Date(), trialConsentText: 'I agree' })
    .where(eq(s.subscriptions.id, subscription.id));
  // Complimentary access is not a trial.
  await billing.grandfather({ ...school('comp'), days: 30 });
  // Registered but never started a trial.
  await billing.registerSchool(school('fresh'));
  sent.length = 0;
});
afterAll(async () => { mailer.setTransport(null); await t.close(); });

test('a dry run lists only trials without opt-in and sends nothing', async () => {
  const rows = await billing.inviteLegacyTrials();
  expect(bySlug(rows)).toEqual({ legacy: 'would_send' });
  expect(sent).toHaveLength(0);
});

test('--apply emails each legacy trial once, linking to Billing', async () => {
  expect(bySlug(await billing.inviteLegacyTrials({ apply: true }))).toEqual({ legacy: 'sent' });
  expect(sent).toHaveLength(1);
  expect(sent[0].to).toBe('legacy@school.test');
  expect(sent[0].subject).toMatch(/^Choose your Capabble plan before /);
  expect(sent[0].html).toContain('https://school.test/#/billing');
  expect(sent[0].html).not.toContain('#/get-started');

  // A rerun (dry or applied) never emails twice.
  expect(bySlug(await billing.inviteLegacyTrials())).toEqual({ legacy: 'already_sent' });
  expect(bySlug(await billing.inviteLegacyTrials({ apply: true }))).toEqual({ legacy: 'already_sent' });
  expect(sent).toHaveLength(1);
});

test('a failed send is not recorded, so the next run tries again', async () => {
  await billing.onboardTrial(school('flaky'));
  mailer.setTransport({ sendMail: async () => { throw new Error('smtp down'); } });
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  expect(bySlug(await billing.inviteLegacyTrials({ apply: true })).flaky).toBe('failed');
  errorSpy.mockRestore();

  mailer.setTransport({ sendMail: async (m) => { sent.push(m); } });
  expect(bySlug(await billing.inviteLegacyTrials({ apply: true })).flaky).toBe('sent');
  expect(sent.filter((m) => m.to === 'flaky@school.test')).toHaveLength(1);
});
