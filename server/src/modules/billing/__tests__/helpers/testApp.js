// The billing routers mounted the way the server mounts them, with plain stand-ins for the
// server's session checks: /internal/tenant/:slug acts as the school, /internal/admin as the admin.
const express = require('express');
const billing = require('../..');
const { ACTOR_TYPES } = require('../../domain/constants');

const app = express();

app.use('/webhooks', billing.webhookRouter);
app.use(express.json());

app.use((req, _res, next) => {
  const type = String(req.headers['x-billing-actor-type'] || 'system');
  req.actor = { type: ACTOR_TYPES.includes(type) ? type : 'system', id: String(req.headers['x-billing-actor-id'] || '') };
  next();
});

// What the server does when a school signs up (tenantAdminController) or is backfilled.
const identity = (body) => ({
  tenantId: body.tenantId, tenantSlug: body.tenantSlug, tenantName: body.tenantName, billingEmail: body.billingEmail || '', days: body.days
});
app.post('/internal/tenants/onboard', async (req, res, next) => {
  try {
    const { account, subscription, created } = await billing.onboardTrial(identity(req.body), req.actor);
    res.status(created ? 201 : 200).json({ success: true, data: { account, subscription, entitlement: await billing.getEntitlement(account.tenantSlug) } });
  } catch (error) { next(error); }
});
app.get('/internal/entitlements/:slug', async (req, res, next) => {
  try {
    res.json({ success: true, data: await billing.getEntitlement(req.params.slug) });
  } catch (error) { next(error); }
});

app.use('/internal/tenant/:slug', (req, _res, next) => {
  req.billingTenantKey = req.params.slug;
  next();
}, billing.schoolRouter);
app.use('/internal/admin', billing.adminRouter);

app.use((err, _req, res, _next) => res.status(err.statusCode || 500).json({ success: false, message: err.message }));

module.exports = app;
