process.env.NODE_ENV = 'test';
process.env.BILLING_SERVICE_TOKEN = 'test-token';
process.env.BILLING_SUPPLIER_STATE_CODE = '07';
process.env.BILLING_SUPPLIER_GSTIN = '07AAACC1234D1Z5';
process.env.BILLING_SUPPLIER_LEGAL_NAME = 'Capabble Technologies Private Limited';

const request = require('supertest');
const { eq } = require('drizzle-orm');
const { createTestDb } = require('./helpers/testDb');
const app = require('../src/app');
const s = require('../src/db/schema');
const { seedCatalog } = require('../src/services/seedService');
const mailer = require('../src/services/mailer');
const erp = require('../src/services/erpClient');
const job = require('../src/jobs/billingJob');
const { inWords } = require('../src/services/pdfService');
const sm = require('../src/domain/stateMachine');
const { transaction } = require('../src/db/client');
const invoices = require('../src/services/invoiceService');

let t;
const sent = [];
const internal = (method, path, body) => request(app)[method](`/internal${path}`)
  .set('x-billing-service-token', 'test-token').send(body);

const binary = (res, cb) => {
  res.setEncoding('binary');
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => cb(null, Buffer.from(data, 'binary')));
};

async function activeSchool(slug, students = 300) {
  await internal('post', '/tenants/onboard', { tenantId: slug, tenantSlug: slug, tenantName: `${slug} school`, billingEmail: `${slug}@school.test` }).expect(201);
  const res = await internal('post', `/tenant/${slug}/subscription`, { modules: ['attnd'], interval: 'month', declaredStudents: students }).expect(200);
  const inv = res.body.data.invoice;
  await transaction((tx) => invoices.recordPayment(tx, { type: 'system' }, { invoiceId: inv.id, amountPaise: inv.totalPaise, provider: 'offline', method: 'offline_bank' }));
  const [sub] = await t.db.select().from(s.subscriptions).where(eq(s.subscriptions.id, res.body.data.subscription.id));
  return { sub, invoice: inv };
}

beforeAll(async () => {
  t = await createTestDb();
  await seedCatalog(t.db, { withPrices: true });
  mailer.setTransport({ sendMail: async (m) => { sent.push(m); } });
});
afterAll(async () => { mailer.setTransport(null); await t.close(); });

describe('job lease', () => {
  test('only one runner holds the lease', async () => {
    const now = new Date('2030-01-01T00:00:00Z');
    expect(await job.acquireLease(30, now)).toBe(true);
    expect(await job.acquireLease(30, now)).toBe(false);
    expect(await job.acquireLease(30, new Date(now.getTime() + 31 * 60000))).toBe(true);
    await t.db.update(s.jobLeases).set({ lockedUntil: new Date(0) });
  });
});

describe('hourly run', () => {
  test('issues the renewal with the ERP count and sends each reminder once', async () => {
    const { sub } = await activeSchool('renewing', 300);
    const spy = jest.spyOn(erp, 'getStudentCount').mockResolvedValue(620);
    const now = sm.addDays(sub.currentPeriodEnd, -2);

    const first = await job.runOnce(now);
    expect(first.renewalsIssued).toBe(1);
    expect(spy).toHaveBeenCalledWith('renewing');
    const [renewal] = await t.db.select().from(s.invoices).where(eq(s.invoices.reason, 'renewal'));
    expect(renewal.studentsBilled).toBe(620);
    const toSchool = sent.filter((m) => m.to === 'renewing@school.test');
    const subjects = toSchool.map((m) => m.subject);
    expect(subjects).toContain(`Capabble invoice ${renewal.number}`);
    expect(subjects.some((sub) => sub.startsWith('Payment due on ') && sub.endsWith(renewal.number))).toBe(true);
    expect(toSchool[0].text).toMatch(/Amount due: ₹/);

    const before = sent.length;
    const second = await job.runOnce(sm.addDays(now, 0.01));
    expect(second.renewalsIssued).toBe(0);
    expect(sent.length).toBe(before);
    spy.mockRestore();
  });

  test('moves unpaid schools through grace to read-only and tells them', async () => {
    await internal('post', '/tenants/onboard', { tenantId: 'quiet', tenantSlug: 'quiet', tenantName: 'Quiet School', billingEmail: 'quiet@school.test' }).expect(201);
    const [sub] = await t.db.select().from(s.subscriptions)
      .innerJoin(s.accounts, eq(s.accounts.id, s.subscriptions.accountId))
      .where(eq(s.accounts.tenantSlug, 'quiet'));
    const trialEnd = sub.subscriptions.trialEndsAt;

    await job.runOnce(sm.addDays(trialEnd, -1));
    expect(sent.some((m) => m.to === 'quiet@school.test' && /trial ends soon/.test(m.subject))).toBe(true);

    await job.runOnce(sm.addDays(trialEnd, 6.5));
    expect(sent.some((m) => m.to === 'quiet@school.test' && /read-only tomorrow/.test(m.subject))).toBe(true);

    const result = await job.runOnce(sm.addDays(trialEnd, 8));
    expect(result.stateChanges).toBeGreaterThanOrEqual(1);
    expect(sent.some((m) => m.to === 'quiet@school.test' && /now read-only/.test(m.subject))).toBe(true);
    const audits = await t.db.select().from(s.auditLog).where(eq(s.auditLog.entityId, sub.subscriptions.id));
    expect(audits.some((a) => a.action === 'subscription.state_changed' && a.after.state === 'suspended_read_only')).toBe(true);
  });

  test('a failed send is recorded and not retried as a duplicate', async () => {
    mailer.setTransport({ sendMail: async () => { throw new Error('SMTP down'); } });
    await internal('post', '/tenants/onboard', { tenantId: 'smtp', tenantSlug: 'smtp', tenantName: 'SMTP School', billingEmail: 'smtp@school.test' }).expect(201);
    const res = await internal('post', '/tenant/smtp/subscription', { modules: ['attnd'], interval: 'month' }).expect(200);
    await job.sendReminders(new Date());
    const rows = await t.db.select().from(s.notifications).where(eq(s.notifications.subjectId, res.body.data.invoice.id));
    expect(rows[0]).toMatchObject({ kind: 'invoice_issued', status: 'failed', error: 'SMTP down' });
    mailer.setTransport({ sendMail: async (m) => { sent.push(m); } });
  });
});

describe('PDFs', () => {
  test('invoice, receipt and credit note render as PDF', async () => {
    const { invoice } = await activeSchool('pdfs', 100);
    const inv = await internal('get', `/tenant/pdfs/invoices/${invoice.id}/pdf`).buffer(true).parse(binary).expect(200);
    expect(inv.headers['content-type']).toBe('application/pdf');
    expect(inv.body.subarray(0, 5).toString()).toBe('%PDF-');

    const [payment] = await t.db.select().from(s.payments).where(eq(s.payments.invoiceId, invoice.id));
    const rcpt = await internal('get', `/tenant/pdfs/receipts/${payment.id}/pdf`).buffer(true).parse(binary).expect(200);
    expect(rcpt.body.subarray(0, 5).toString()).toBe('%PDF-');

    const cn = await internal('post', `/admin/tenants/pdfs/invoices/${invoice.id}/credit-notes`, { amountPaise: 5000, reason: 'Goodwill' }).expect(201);
    const note = await internal('get', `/tenant/pdfs/credit-notes/${cn.body.data.creditNote.id}/pdf`).buffer(true).parse(binary).expect(200);
    expect(note.body.subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('another school cannot fetch the PDF', async () => {
    const { invoice } = await activeSchool('owner', 100);
    await internal('post', '/tenants/onboard', { tenantId: 'other', tenantSlug: 'other', tenantName: 'Other' }).expect(201);
    await internal('get', `/tenant/other/invoices/${invoice.id}/pdf`).expect(404);
  });

  test('amount in words uses lakh and crore', () => {
    expect(inWords(177000)).toBe('Rupees One Thousand Seven Hundred Seventy Only');
    expect(inWords(1234567850)).toBe('Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight and Fifty Paise Only');
    expect(inWords(0)).toBe('Rupees Zero Only');
  });
});
