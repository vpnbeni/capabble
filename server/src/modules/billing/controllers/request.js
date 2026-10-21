// The school a billing request is about. School routes set req.billingTenantKey from the
// signed-in tenant; admin routes name the school in the URL (account id, tenant id or slug).
const schoolKey = (req) => req.billingTenantKey || req.params.tenantId || req.params.tenantSlug;

module.exports = { schoolKey };
