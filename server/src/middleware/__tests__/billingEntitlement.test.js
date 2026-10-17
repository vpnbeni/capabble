const client = require('../../services/billingServiceClient');
const {
  resolveModuleFromPath,
  isReadOnlyBlockedPath,
  shouldSkipForPath,
  billingEntitlementMiddleware,
  invalidateEntitlement
} = require('../billingEntitlement');
const { requireTenantFeature } = require('../tenantFeatureAccess');
const { normalizeTenantFeatureToggles, FEATURE_MODULE } = require('../../constants/tenantFeatures');

describe('billingEntitlement helpers', () => {
  it('maps known route prefixes to modules', () => {
    expect(resolveModuleFromPath('/dashboard/todays-exams')).toBe('dashboard');
    expect(resolveModuleFromPath('/seating-plan/generate/main-gate/123')).toBe('seating_plan');
    expect(resolveModuleFromPath('/form66/records')).toBe('form66');
    expect(resolveModuleFromPath('/unknown-path')).toBe('unknown-path');
  });

  it('identifies read-only blocked expensive paths', () => {
    expect(isReadOnlyBlockedPath('/seating-plan/generate/main-gate/abc')).toBe(true);
    expect(isReadOnlyBlockedPath('/form66/dates/12.03.2026/pdf')).toBe(true);
    expect(isReadOnlyBlockedPath('/export/teachers')).toBe(true);
    expect(isReadOnlyBlockedPath('/dashboard/todays-exams')).toBe(false);
  });

  it('skips auth and billing paths from enforcement', () => {
    expect(shouldSkipForPath('/auth/login')).toBe(true);
    expect(shouldSkipForPath('/billing/me')).toBe(true);
    expect(shouldSkipForPath('/subjects')).toBe(false);
  });
});

describe('billingEntitlementMiddleware', () => {
  const attndFeature = Object.keys(FEATURE_MODULE).find((key) => FEATURE_MODULE[key] === 'attnd');
  const stdntFeature = Object.keys(FEATURE_MODULE).find((key) => FEATURE_MODULE[key] === 'stdnt');

  const makeReq = (path = '/attnd/records', method = 'GET') => ({
    path,
    method,
    tenant: { slug: 'demo', featureToggles: normalizeTenantFeatureToggles({}) }
  });
  const makeRes = () => {
    const res = { headers: {}, statusCode: 200, body: null };
    res.setHeader = (k, v) => { res.headers[k] = v; };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; return res; };
    return res;
  };
  const run = async (req) => {
    const res = makeRes();
    const next = jest.fn();
    await billingEntitlementMiddleware(req, res, next);
    return { res, next };
  };

  let spy;
  beforeEach(() => {
    invalidateEntitlement();
    spy = jest.spyOn(client, 'getTenantEntitlement');
  });
  afterEach(() => spy.mockRestore());

  it('switches off features of modules the school has not paid for, and the gate answers 402', async () => {
    spy.mockResolvedValue({ state: 'active', accessMode: 'full', entitledModules: ['core', 'attnd'] });
    const req = makeReq();
    const { next } = await run(req);
    expect(next).toHaveBeenCalled();
    expect(req.tenant.featureToggles[attndFeature]).toBe(true);
    expect(req.tenant.featureToggles[stdntFeature]).toBe(false);
    expect(req.tenant.featureToggles.dashboard).toBe(true);

    const res = makeRes();
    const gateNext = jest.fn();
    requireTenantFeature(stdntFeature)(req, res, gateNext);
    expect(gateNext).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(402);
    expect(res.body).toMatchObject({ errorCode: 'module_not_subscribed', module: 'stdnt', billingUrl: '/billing' });
  });

  it('a feature the platform admin switched off stays a 403', async () => {
    spy.mockResolvedValue({ state: 'trialing', accessMode: 'full', entitledModules: ['*'] });
    const req = makeReq();
    req.tenant.featureToggles = normalizeTenantFeatureToggles({ [stdntFeature]: false });
    await run(req);
    const res = makeRes();
    requireTenantFeature(stdntFeature)(req, res, jest.fn());
    expect(res.statusCode).toBe(403);
  });

  it('masks toggles on /auth paths too (the app learns what is paid for) without blocking', async () => {
    spy.mockResolvedValue({ state: 'suspended_read_only', accessMode: 'read_only', entitledModules: ['core'] });
    const req = makeReq('/auth/me', 'POST');
    const { next } = await run(req);
    expect(next).toHaveBeenCalled();
    expect(req.tenant.featureToggles[attndFeature]).toBe(false);
  });

  it('read-only blocks writes with 402', async () => {
    spy.mockResolvedValue({ state: 'suspended_read_only', accessMode: 'read_only', entitledModules: ['*'] });
    const { res, next } = await run(makeReq('/attnd/records', 'POST'));
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(402);
  });

  it('keeps using the last known entitlement when billing is unreachable', async () => {
    spy.mockResolvedValueOnce({ state: 'active', accessMode: 'full', entitledModules: ['core', 'attnd'] });
    await run(makeReq());
    const realNow = Date.now;
    Date.now = () => realNow() + 60 * 1000; // past the 45s cache
    try {
      spy.mockRejectedValueOnce(new Error('Billing service request timed out'));
      const req = makeReq('/attnd/records', 'POST');
      const { next } = await run(req);
      expect(next).toHaveBeenCalled();
      expect(req.billingEntitlement.stale).toBe(true);
      expect(req.tenant.featureToggles[stdntFeature]).toBe(false);
    } finally {
      Date.now = realNow;
    }
  });

  it('with nothing cached, a write while billing is down is a 503 and a read goes through', async () => {
    spy.mockRejectedValue(new Error('down'));
    expect((await run(makeReq('/attnd/records', 'POST'))).res.statusCode).toBe(503);
    expect((await run(makeReq('/attnd/records', 'GET'))).next).toHaveBeenCalled();
  });

  it('concurrent requests share one billing call', async () => {
    let resolve;
    spy.mockReturnValue(new Promise((r) => { resolve = r; }));
    const pending = Promise.all([run(makeReq()), run(makeReq()), run(makeReq())]);
    resolve({ state: 'active', accessMode: 'full', entitledModules: ['*'] });
    await pending;
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
