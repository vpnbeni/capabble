jest.mock('../../tenancy/platformModels', () => ({ getPlatformModels: jest.fn() }));
jest.mock('../../utils/mailer', () => ({ sendMail: jest.fn() }));

const mongoose = require('mongoose');
const { getPlatformModels } = require('../../tenancy/platformModels');
const { sendMail } = require('../../utils/mailer');
const {
  requireAdministrator,
  getClosure,
  requestClosure,
  cancelClosure,
  EXPORT_DAYS,
  DELETE_DAYS
} = require('../accountClosureController');
const { requestClosureSchema } = require('../../validations/accountClosureValidation');
const { resolveRouteRequirement } = require('../../rbac/catalog');
const { routeAccessGate } = require('../../rbac/middleware');
const { PermissionSet } = require('../../rbac/permissions');
const { AUDIENCE } = require('../../rbac/session');

const DAY_MS = 24 * 60 * 60 * 1000;
const grantsOf = (keys) => new PermissionSet(keys.map((key) => ({ key, scope: 'all' })));
const tenantId = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();

const createRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const flush = () => new Promise((resolve) => { setTimeout(resolve, 20); });
const lean = (value) => ({ lean: () => Promise.resolve(value) });

/** In-memory stand-in for the central Tenant model, enough for the closure queries. */
const createTenantModel = (initial) => {
  const state = {
    tenant: { _id: tenantId, slug: 'redrose', name: 'Red Rose Public School', closure: null, ...initial }
  };
  const pending = () => Boolean(state.tenant.closure?.requestedAt && !state.tenant.closure?.canceledAt);
  const Tenant = {
    state,
    findById: jest.fn(() => lean(state.tenant)),
    findOneAndUpdate: jest.fn((filter, update) => {
      const isCancel = Object.prototype.hasOwnProperty.call(filter, 'closure.canceledAt');
      const matches = isCancel
        ? pending() && state.tenant.closure.exportUntil > filter['closure.exportUntil'].$gt
        : !pending();
      if (!matches) return lean(null);
      if (update.$set.closure !== undefined) {
        state.tenant = { ...state.tenant, closure: update.$set.closure };
      } else {
        state.tenant = {
          ...state.tenant,
          closure: {
            ...state.tenant.closure,
            canceledAt: update.$set['closure.canceledAt'],
            canceledBy: update.$set['closure.canceledBy']
          }
        };
      }
      return lean(state.tenant);
    })
  };
  return Tenant;
};

const adminReq = (overrides = {}) => ({
  tenant: { id: tenantId, slug: 'redrose', name: 'Red Rose Public School' },
  user: { _id: userId, email: 'Admin@RedRose.edu.in', name: 'Anita Sharma' },
  rbac: grantsOf(['*']),
  body: {},
  ...overrides
});

const run = async (handler, req) => {
  const res = createRes();
  const next = jest.fn();
  handler(req, res, next);
  await flush();
  if (next.mock.calls[0]?.[0]) throw next.mock.calls[0][0];
  return res;
};

describe('account closure', () => {
  let Tenant;

  beforeEach(() => {
    jest.clearAllMocks();
    Tenant = createTenantModel();
    getPlatformModels.mockReturnValue({ Tenant });
    sendMail.mockResolvedValue({ messageId: 'x' });
  });

  it('records a request with export and delete dates and emails the admin and support', async () => {
    const before = Date.now();
    const res = await run(requestClosure, adminReq({ body: { confirmation: 'redrose' } }));

    expect(res.status).toHaveBeenCalledWith(201);
    const { closure } = Tenant.state.tenant;
    expect(closure.requestedBy).toEqual({ userId, email: 'admin@redrose.edu.in', name: 'Anita Sharma' });
    expect(closure.exportUntil.getTime() - closure.requestedAt.getTime()).toBe(EXPORT_DAYS * DAY_MS);
    expect(closure.deleteAfter.getTime() - closure.requestedAt.getTime()).toBe((EXPORT_DAYS + DELETE_DAYS) * DAY_MS);
    expect(closure.requestedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(res.json.mock.calls[0][0].data.closure.status).toBe('pending');

    const recipients = sendMail.mock.calls.map(([message]) => message.to);
    expect(recipients).toEqual(['Admin@RedRose.edu.in', 'support@capabble.cloud']);
    expect(sendMail.mock.calls[1][0].text).toContain('redrose');
  });

  it('is idempotent while a request is pending', async () => {
    await run(requestClosure, adminReq({ body: { confirmation: 'redrose' } }));
    const first = Tenant.state.tenant.closure;
    sendMail.mockClear();

    const res = await run(requestClosure, adminReq({ body: { confirmation: 'redrose' } }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(Tenant.state.tenant.closure).toBe(first);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('refuses a confirmation that does not match the workspace code', async () => {
    const res = await run(requestClosure, adminReq({ body: { confirmation: 'red-rose' } }));
    expect(res.status).toHaveBeenCalledWith(400);
    expect(Tenant.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('still succeeds when the email cannot be sent', async () => {
    sendMail.mockRejectedValue(new Error('SMTP down'));
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await run(requestClosure, adminReq({ body: { confirmation: 'redrose' } }));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('cancels a pending request and lets the school ask again later', async () => {
    await run(requestClosure, adminReq({ body: { confirmation: 'redrose' } }));
    const res = await run(cancelClosure, adminReq());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(Tenant.state.tenant.closure.canceledAt).toBeInstanceOf(Date);
    expect(Tenant.state.tenant.closure.canceledBy.email).toBe('admin@redrose.edu.in');
    expect(res.json.mock.calls[0][0].data.closure.status).toBe('canceled');

    const again = await run(requestClosure, adminReq({ body: { confirmation: 'redrose' } }));
    expect(again.status).toHaveBeenCalledWith(201);
    expect(Tenant.state.tenant.closure.canceledAt).toBeNull();
  });

  it('refuses to cancel when nothing is pending', async () => {
    const res = await run(cancelClosure, adminReq());
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('refuses to cancel after the export period has ended', async () => {
    Tenant = createTenantModel({
      closure: {
        requestedAt: new Date(Date.now() - 31 * DAY_MS),
        exportUntil: new Date(Date.now() - DAY_MS),
        deleteAfter: new Date(Date.now() + 59 * DAY_MS),
        canceledAt: null
      }
    });
    getPlatformModels.mockReturnValue({ Tenant });
    const res = await run(cancelClosure, adminReq());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].message).toMatch(/time to cancel ended/);
  });

  it('reports the current state', async () => {
    const res = await run(getClosure, adminReq());
    expect(res.json.mock.calls[0][0].data).toEqual({
      slug: 'redrose', name: 'Red Rose Public School', closure: { status: 'none' }
    });
  });

  it('validates the body with Joi', () => {
    expect(requestClosureSchema.validate({}).error.message).toBe('Type your workspace code to confirm');
    expect(requestClosureSchema.validate({ confirmation: '  RedRose ' }).value.confirmation).toBe('redrose');
  });
});

describe('account closure permissions', () => {
  const staffReq = (grants, method = 'POST') => ({
    method,
    path: '/account/closure',
    user: { _id: userId, kind: 'staff' },
    auth: { audience: AUDIENCE.STAFF },
    rbac: grantsOf(grants)
  });
  const gate = (req) => {
    const next = jest.fn();
    routeAccessGate(req, createRes(), next);
    return next.mock.calls.length === 1;
  };
  const guard = (req) => {
    const res = createRes();
    const next = jest.fn();
    requireAdministrator(req, res, next);
    return { allowed: next.mock.calls.length === 1, res };
  };

  it('has a catalog rule', () => {
    expect(resolveRouteRequirement('POST', '/account/closure')).toMatchObject({ anyOf: ['core.billing.manage'] });
    expect(resolveRouteRequirement('DELETE', '/account/closure')).toMatchObject({ anyOf: ['core.billing.manage'] });
  });

  it('lets administrators through', () => {
    expect(gate(staffReq(['*']))).toBe(true);
    expect(guard(staffReq(['*'])).allowed).toBe(true);
  });

  it('blocks a principal at the gate', () => {
    expect(gate(staffReq(['core.school.read', 'core.school.write', 'core.billing.read']))).toBe(false);
  });

  it('blocks a custom role with billing access that is not an administrator', () => {
    const req = staffReq(['core.billing.manage']);
    expect(gate(req)).toBe(true);
    const { allowed, res } = guard(req);
    expect(allowed).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('blocks family portal logins', () => {
    expect(gate({ ...staffReq(['*']), auth: { audience: AUDIENCE.PORTAL } })).toBe(false);
  });
});
