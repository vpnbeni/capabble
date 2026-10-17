// HTTP client for the billing service. Only billing-service reads or writes billing data;
// the ERP and the platform admin go through here, keyed by the school's tenant slug or id.
const http = require('http');
const https = require('https');

// Entitlement reads are cached by the caller, so keep them short. Writes may wait for the
// billing database to wake from scale-to-zero, so give them longer.
const READ_TIMEOUT_MS = 8000;
const WRITE_TIMEOUT_MS = 20000;

const getBaseUrl = () => String(process.env.BILLING_SERVICE_URL || '').trim();

const getServiceToken = () => String(process.env.BILLING_SERVICE_TOKEN || '').trim();

const parseJson = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const isConfigured = () => Boolean(getBaseUrl());

const buildUrl = (path, query) => {
  const base = getBaseUrl();
  if (!base) {
    throw new Error('Billing service URL is not configured');
  }

  const url = new URL(path, base.endsWith('/') ? base : `${base}/`);

  if (query && typeof query === 'object') {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });
  }

  return url;
};

/** Who is acting, recorded in billing's audit log. */
const actorHeaders = (actor) => {
  if (!actor) return {};
  return {
    'x-billing-actor-type': actor.type || 'system',
    'x-billing-actor-id': String(actor.id || ''),
    ...(actor.requestId ? { 'x-request-id': String(actor.requestId) } : {})
  };
};

const unavailable = () => {
  const error = new Error('Billing service is not configured');
  error.statusCode = 503;
  return error;
};

const openRequest = (method, path, { body, query, timeoutMs, actor, accept = 'application/json' }) => {
  const url = buildUrl(path, query);
  const client = url.protocol === 'https:' ? https : http;
  const payload = body ? JSON.stringify(body) : null;

  const options = {
    method,
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: `${url.pathname}${url.search}`,
    headers: {
      Accept: accept,
      'Content-Type': 'application/json',
      ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      ...(getServiceToken() ? { 'x-billing-service-token': getServiceToken() } : {}),
      ...actorHeaders(actor)
    },
    timeout: timeoutMs || (method === 'GET' ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS)
  };

  return { client, options, payload };
};

const requestBillingService = (method, path, opts = {}) => {
  if (!isConfigured()) return Promise.reject(unavailable());
  const { client, options, payload } = openRequest(method, path, opts);

  return new Promise((resolve, reject) => {
    const req = client.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        const parsed = parseJson(data) || { success: false, message: 'Invalid billing service response' };

        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(parsed);
          return;
        }

        const error = new Error(parsed.message || `Billing service request failed (${res.statusCode})`);
        error.statusCode = res.statusCode;
        error.response = parsed;
        reject(error);
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Billing service request timed out'));
    });

    if (payload) {
      req.write(payload);
    }

    req.end();
  });
};

/** Pipe a PDF from billing-service straight to the browser. */
const streamBillingPdf = (path, res) => {
  if (!isConfigured()) return Promise.reject(unavailable());
  const { client, options } = openRequest('GET', path, { accept: 'application/pdf', timeoutMs: WRITE_TIMEOUT_MS });

  return new Promise((resolve, reject) => {
    const req = client.request(options, (upstream) => {
      if (upstream.statusCode !== 200) {
        let data = '';
        upstream.on('data', (chunk) => { data += chunk; });
        upstream.on('end', () => {
          const parsed = parseJson(data) || {};
          const error = new Error(parsed.message || 'Document not available');
          error.statusCode = upstream.statusCode;
          reject(error);
        });
        return;
      }
      res.setHeader('Content-Type', 'application/pdf');
      const disposition = upstream.headers['content-disposition'];
      if (disposition) res.setHeader('Content-Disposition', disposition);
      res.setHeader('Cache-Control', 'private, no-store');
      upstream.pipe(res);
      upstream.on('end', resolve);
      upstream.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Billing service request timed out')));
    req.end();
  });
};

const fallbackEntitlement = {
  accessMode: 'full',
  state: 'active',
  allowedModules: ['*'],
  entitledModules: ['*'],
  isReadOnly: false,
  reason: 'billing_service_not_configured',
  planCode: null,
  trialEndsAt: null,
  graceEndsAt: null
};

const getTenantEntitlement = async (tenantSlug) => {
  if (!isConfigured()) {
    return { ...fallbackEntitlement, tenantSlug };
  }

  const response = await requestBillingService('GET', `/internal/entitlements/${encodeURIComponent(tenantSlug)}`);
  return response.data;
};

const enc = encodeURIComponent;
const get = (path, query) => requestBillingService('GET', path, { query });
const post = (path, body, actor) => requestBillingService('POST', path, { body, actor });

// Onboarding (best effort during signup).
const onboardTenantTrial = async (payload) => (isConfigured() ? post('/internal/tenants/onboard', payload) : null);
const grandfatherTenant = async (payload) => (isConfigured() ? post('/internal/tenants/grandfather', payload) : null);

// One school (school app).
const school = (slug) => `/internal/tenant/${enc(slug)}`;
const getTenantBilling = (slug) => get(school(slug));
const getTenantInvoices = (slug) => get(`${school(slug)}/invoices`);
const getTenantInvoice = (slug, invoiceId) => get(`${school(slug)}/invoices/${enc(invoiceId)}`);
const getTenantPayments = (slug) => get(`${school(slug)}/payments`);
const getTenantCreditNotes = (slug) => get(`${school(slug)}/credit-notes`);
const getCatalog = () => get('/internal/catalog');
const previewSubscription = (slug, body, actor) => post(`${school(slug)}/subscription/preview`, body, actor);
const subscribe = (slug, body, actor) => post(`${school(slug)}/subscription`, body, actor);
const cancelSubscription = (slug, body, actor) => post(`${school(slug)}/cancel`, body, actor);
const resumeSubscription = (slug, actor) => post(`${school(slug)}/resume`, {}, actor);
const createPayNowLink = (slug, body, actor) => post(`${school(slug)}/pay-now`, body, actor);
const reconcilePayment = (slug, body, actor) => post(`${school(slug)}/pay-now/reconcile`, body, actor);
const updateTenantBillingProfile = (slug, body, actor) => post(`${school(slug)}/profile`, body, actor);
const streamInvoicePdf = (key, id, res) => streamBillingPdf(`${school(key)}/invoices/${enc(id)}/pdf`, res);
const streamReceiptPdf = (key, id, res) => streamBillingPdf(`${school(key)}/receipts/${enc(id)}/pdf`, res);
const streamCreditNotePdf = (key, id, res) => streamBillingPdf(`${school(key)}/credit-notes/${enc(id)}/pdf`, res);

// Platform admin.
const adminTenant = (id) => `/internal/admin/tenants/${enc(id)}`;
const listBillingTenants = (query = {}) => get('/internal/admin/tenants', query);
const getBillingTenantById = (id) => get(adminTenant(id));
const previewBillingTenantPlan = (id, body, actor) => post(`${adminTenant(id)}/change-plan/preview`, body, actor);
const changeBillingTenantPlan = (id, body, actor) => post(`${adminTenant(id)}/change-plan`, body, actor);
const grantBillingTenantExtension = (id, body, actor) => post(`${adminTenant(id)}/grant-extension`, body, actor);
const setBillingTenantStudents = (id, body, actor) => post(`${adminTenant(id)}/students`, body, actor);
const cancelBillingTenant = (id, body, actor) => post(`${adminTenant(id)}/cancel`, body, actor);
const updateBillingTenantProfile = (id, body, actor) => post(`${adminTenant(id)}/profile`, body, actor);
const adminInvoice = (id, invoiceId) => `${adminTenant(id)}/invoices/${enc(invoiceId)}`;
const recordOfflinePayment = (id, inv, body, actor) => post(`${adminInvoice(id, inv)}/payments/offline`, body, actor);
const voidBillingInvoice = (id, inv, body, actor) => post(`${adminInvoice(id, inv)}/void`, body, actor);
const createBillingCreditNote = (id, inv, body, actor) => post(`${adminInvoice(id, inv)}/credit-notes`, body, actor);
const setupBillingAutoDebit = (id, actor) => post(`${adminTenant(id)}/autodebit`, {}, actor);
const listBillingAudit = (query = {}) => get('/internal/admin/audit', query);
const runBillingJobs = (actor) => post('/internal/admin/jobs/run', {}, actor);
const getBillingCatalogAdmin = () => get('/internal/admin/catalog');
const upsertBillingModule = (body, actor) => post('/internal/admin/modules', body, actor);
const getBillingModulePrices = (code) => get(`/internal/admin/modules/${enc(code)}/prices`);
const setBillingModulePrice = (code, body, actor) => post(`/internal/admin/modules/${enc(code)}/prices`, body, actor);
const upsertBillingBundle = (body, actor) => post('/internal/admin/bundles', body, actor);
const createBillingCoupon = (body, actor) => post('/internal/admin/coupons', body, actor);
const createBillingAddon = (body, actor) => post('/internal/admin/addons', body, actor);

module.exports = {
  isConfigured,
  requestBillingService,
  getTenantEntitlement,
  onboardTenantTrial,
  grandfatherTenant,
  getTenantBilling,
  getTenantInvoices,
  getTenantInvoice,
  getTenantPayments,
  getTenantCreditNotes,
  getCatalog,
  previewSubscription,
  subscribe,
  cancelSubscription,
  resumeSubscription,
  createPayNowLink,
  reconcilePayment,
  updateTenantBillingProfile,
  streamInvoicePdf,
  streamReceiptPdf,
  streamCreditNotePdf,
  listBillingTenants,
  getBillingTenantById,
  previewBillingTenantPlan,
  changeBillingTenantPlan,
  grantBillingTenantExtension,
  setBillingTenantStudents,
  cancelBillingTenant,
  updateBillingTenantProfile,
  recordOfflinePayment,
  voidBillingInvoice,
  createBillingCreditNote,
  setupBillingAutoDebit,
  listBillingAudit,
  runBillingJobs,
  getBillingCatalogAdmin,
  upsertBillingModule,
  getBillingModulePrices,
  setBillingModulePrice,
  upsertBillingBundle,
  createBillingCoupon,
  createBillingAddon
};
