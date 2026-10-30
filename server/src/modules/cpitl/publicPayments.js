/* eslint-disable max-len -- page copy and inline styles read better unwrapped */
/**
 * School fee payments reachable without a tenant session, mounted at
 * /api/school-payments before the body parsers (webhooks are signed over the
 * raw bytes):
 *
 * - POST /webhook/:slug — Razorpay webhooks from the school's own account,
 *   checked with the school's webhook secret.
 * - GET  /checkout/:token — a small page that opens Razorpay Checkout. The app
 *   opens it in the phone's browser (no native SDK needed in the current build).
 * - POST /checkout/:token/callback — where Checkout returns; the payment is
 *   checked with the school's key secret, recorded, and the parent is sent back
 *   to the app.
 *
 * The token names the school and the order, signed with PAYMENT_LINK_SECRET
 * (falls back to JWT_SECRET). Money moves only inside Razorpay.
 */
const crypto = require('crypto');
const express = require('express');
const { getPlatformModels } = require('../../tenancy/platformModels');
const { getTenantConnectionAndModels } = require('../../tenancy/tenantConnectionManager');
const { requestContextMiddleware, setRequestContext } = require('../../tenancy/requestContext');
const { getActiveModelKeys, isModuleActive } = require('../../constants/moduleModelKeys');
const { normalizeTenantFeatureToggles } = require('../../constants/tenantFeatures');
const { TENANT_STATUS } = require('../../models/platform/Tenant');
const { escapeHtml } = require('../../mail/layout');
const payments = require('./onlinePayments');

const secret = () => String(process.env.PAYMENT_LINK_SECRET || process.env.JWT_SECRET || '').trim();
const sign = (payload) => crypto.createHmac('sha256', `${secret()}:school-payments`).update(payload).digest('base64url');

const tokenFor = ({ slug, orderId }) => {
  const payload = Buffer.from(JSON.stringify({ t: slug, o: String(orderId) })).toString('base64url');
  return `${payload}.${sign(payload)}`;
};

const checkoutUrl = (opts) => `${payments.apiUrl()}/school-payments/checkout/${tokenFor(opts)}`;

const readToken = (token) => {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig || !secret()) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data?.t && /^[a-f0-9]{24}$/.test(String(data.o)) ? { slug: data.t, orderId: data.o } : null;
  } catch (error) {
    return null;
  }
};

/** The school's tenant models, or null when it doesn't exist, isn't active or has no fees module. */
const tenantFor = async (slug) => {
  const record = await getPlatformModels().Tenant.findOne({ slug: String(slug || '').toLowerCase() }).lean();
  if (!record || record.status !== TENANT_STATUS.ACTIVE) return null;
  const featureToggles = normalizeTenantFeatureToggles(record.featureToggles);
  if (!isModuleActive('cpitl', featureToggles)) return null;
  const { models } = getTenantConnectionAndModels(record.dbName, getActiveModelKeys(featureToggles));
  const tenant = { id: record._id, slug: record.slug, name: record.name, dbName: record.dbName, featureToggles };
  setRequestContext({ scope: 'tenant', tenant, models });
  return { tenant, models };
};

// Tests swap the tenant lookup.
let resolveTenant = tenantFor;
const setTenantResolver = (fn) => {
  resolveTenant = fn || tenantFor;
};

const useOrderSession = (order) => {
  // Fee records are per academic session; pin queries to the order's.
  if (order?.academicSession) setRequestContext({ academicSession: order.academicSession });
};

const formatINR = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// The app's link scheme: the stage server runs with APP_SCHEME=capabble-stage so it returns to "(S) Capabble".
const APP_SCHEME = (process.env.APP_SCHEME || 'capabble').replace(/[^a-z0-9+.-]/gi, '') || 'capabble';
const appReturnUrl = (order) => `${APP_SCHEME}://fee-payment/${order._id}?student=${order.student}`;

const page = ({ title, body = '', extra = '', nonce = '', script = '' }) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#F4F5F6;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1B1F21;">
<main style="max-width:480px;margin:32px auto;padding:32px 24px;background:#FFFFFF;border:1px solid #E3E6E8;border-radius:16px;text-align:center;">
<h1 style="margin:0 0 8px;font-size:22px;line-height:30px;">${escapeHtml(title)}</h1>
${body ? `<p style="margin:0 0 20px;font-size:15px;line-height:24px;color:#4A5257;">${escapeHtml(body)}</p>` : ''}
${extra}
<p style="margin:24px 0 0;font-size:12px;color:#7A8388;">Payments go straight to your school through Razorpay.</p>
</main>${script ? `<script nonce="${nonce}">${script}</script>` : ''}</body></html>`;

const button = (href, label, filled = true) => `<a href="${escapeHtml(href)}" style="display:block;margin:12px 0 0;padding:14px 16px;border-radius:12px;font-weight:600;font-size:16px;text-decoration:none;${filled ? 'background:#2458AA;color:#FFFFFF;' : 'background:#EEF0F2;color:#1B1F21;'}">${escapeHtml(label)}</a>`;

const sendPage = (res, status, opts) => {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.setHeader('Content-Security-Policy', [
    'default-src \'self\'',
    `script-src 'nonce-${nonce}' https://checkout.razorpay.com https://*.razorpay.com`,
    'frame-src https://*.razorpay.com',
    'connect-src https://*.razorpay.com',
    'img-src \'self\' data: https:',
    'style-src \'self\' \'unsafe-inline\' https://*.razorpay.com',
    'form-action \'self\' https://*.razorpay.com',
    'frame-ancestors \'none\''
  ].join('; '));
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).type('html').send(page({ ...opts, nonce }));
};

const notValid = (res) => sendPage(res, 404, { title: 'Link not valid', body: 'Start the payment again from the Fees screen in the app.' });

const paidPage = (res, order) => sendPage(res, 200, {
  title: 'Payment received',
  body: `${formatINR(order.amount)} for ${order.studentSnapshot?.name || 'your child'}.${order.receiptNo ? ` Receipt ${order.receiptNo}.` : ''}`,
  extra: button(appReturnUrl(order), 'Back to the app'),
  script: `setTimeout(function(){ window.location.href = ${JSON.stringify(appReturnUrl(order))}; }, 800);`
});

const loadOrder = async (data) => {
  const ctx = await resolveTenant(data.slug);
  if (!ctx) return null;
  const order = await ctx.models.FeeOnlineOrder.findById(data.orderId);
  if (!order) return null;
  useOrderSession(order);
  return { ...ctx, order };
};

const router = express.Router();
router.use(requestContextMiddleware);

router.post('/webhook/:slug', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  try {
    const ctx = await resolveTenant(req.params.slug);
    if (!ctx) return res.status(404).json({ success: false, message: 'Unknown school.' });
    const settings = await payments.loadSettings(ctx.models);
    const credentials = payments.credentialsOf(settings);
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    if (!credentials || !payments.verifyWebhookSignature(raw, req.get('x-razorpay-signature'), credentials.webhookSecret)) {
      return res.status(400).json({ success: false, message: 'Signature check failed.' });
    }
    let event;
    try {
      event = JSON.parse(raw.toString('utf8'));
    } catch (error) {
      return res.status(400).json({ success: false, message: 'Body is not JSON.' });
    }
    await ctx.models.SchoolPaymentSettings.updateOne({ _id: settings._id }, { $set: { lastWebhookAt: new Date() } });
    const orderId = event?.payload?.payment?.entity?.order_id;
    if (orderId) useOrderSession(await ctx.models.FeeOnlineOrder.findOne({ razorpayOrderId: orderId }).select('academicSession').lean());
    const outcome = await payments.handleWebhookEvent(ctx.models, event, { tenant: ctx.tenant, credentials });
    return res.json({ success: true, outcome });
  } catch (error) {
    // A non-2xx makes Razorpay retry, which is what we want for a passing failure.
    console.error(`[school-payments] webhook for ${req.params.slug} failed: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Could not process the webhook.' });
  }
});

router.get('/checkout/:token', async (req, res) => {
  const data = readToken(req.params.token);
  if (!data) return notValid(res);
  try {
    const ctx = await loadOrder(data);
    if (!ctx) return notValid(res);
    const { order, models } = ctx;
    if (order.status === 'paid') return paidPage(res, order);
    if (order.status !== 'created') {
      return sendPage(res, 200, { title: 'Payment being checked', body: payments.orderView(order).message || 'This payment is being checked. Open the app to see it.', extra: button(appReturnUrl(order), 'Back to the app') });
    }
    const credentials = payments.credentialsOf(await payments.loadSettings(models));
    if (!credentials) return sendPage(res, 409, { title: 'Online payment is off', body: 'Your school has turned off online payment. Pay at the school office.', extra: button(appReturnUrl(order), 'Back to the app', false) });
    const profile = models.SchoolProfile ? await models.SchoolProfile.findOne({}).select('schoolName logoUrl').lean() : null;
    const options = {
      key: credentials.keyId,
      order_id: order.razorpayOrderId,
      amount: order.amountPaise,
      currency: 'INR',
      name: profile?.schoolName || ctx.tenant.name || 'School fees',
      description: `Fees for ${order.studentSnapshot?.name || 'your child'}`.slice(0, 250),
      ...(profile?.logoUrl && /^https:/.test(profile.logoUrl) ? { image: profile.logoUrl } : {}),
      prefill: { name: order.createdBy?.name || '', email: order.createdBy?.email || '' },
      notes: { capabble_order: String(order._id) },
      callback_url: `${payments.apiUrl()}/school-payments/checkout/${req.params.token}/callback`,
      redirect: true,
      theme: { color: '#2458AA' }
    };
    const json = JSON.stringify(options).replace(/</g, '\\u003c');
    return sendPage(res, 200, {
      title: `Pay ${formatINR(order.amount)}`,
      body: `School fees for ${order.studentSnapshot?.name || 'your child'}. Razorpay opens to take the payment.`,
      extra: `<button id="pay" type="button" style="display:block;width:100%;margin:12px 0 0;padding:14px 16px;border:0;border-radius:12px;font:600 16px/22px inherit;background:#2458AA;color:#FFFFFF;cursor:pointer;">Pay ${escapeHtml(formatINR(order.amount))}</button>${button(appReturnUrl(order), 'Back to the app', false)}`,
      script: `(function(){var s=document.createElement('script');s.src='https://checkout.razorpay.com/v1/checkout.js';s.nonce=document.currentScript&&document.currentScript.nonce||'';s.onload=function(){var r=new Razorpay(${json});document.getElementById('pay').onclick=function(){r.open();};r.open();};document.head.appendChild(s);})();`
    });
  } catch (error) {
    console.error(`[school-payments] checkout page failed: ${error.message}`);
    return sendPage(res, 500, { title: 'Something went wrong', body: 'Nothing was charged. Go back to the app and try again.' });
  }
});

router.post('/checkout/:token/callback', express.urlencoded({ extended: true, limit: '16kb' }), async (req, res) => {
  const data = readToken(req.params.token);
  if (!data) return notValid(res);
  try {
    const ctx = await loadOrder(data);
    if (!ctx) return notValid(res);
    const { order, models, tenant } = ctx;
    if (order.status === 'paid') return paidPage(res, order);

    const body = req.body || {};
    const paymentId = String(body.razorpay_payment_id || '');
    if (!paymentId) {
      const reason = String(body.error?.description || body['error[description]'] || '').slice(0, 200);
      return sendPage(res, 200, {
        title: 'Payment didn’t go through',
        body: `${reason ? `${reason} ` : ''}No money was taken. You can try again.`,
        extra: `${button(`${payments.apiUrl()}/school-payments/checkout/${req.params.token}`, 'Try again')}${button(appReturnUrl(order), 'Back to the app', false)}`
      });
    }
    const credentials = payments.credentialsOf(await payments.loadSettings(models));
    const signed = credentials && String(body.razorpay_order_id || '') === order.razorpayOrderId
      && payments.verifyCheckoutSignature({ orderId: order.razorpayOrderId, paymentId, signature: body.razorpay_signature }, credentials.keySecret);
    if (!signed) return sendPage(res, 400, { title: 'We couldn’t confirm this payment', body: 'If money left your account, the school will see it within a few minutes. Open the app to check.', extra: button(appReturnUrl(order), 'Back to the app') });

    const settled = await payments.settleOrder(models, { order, paymentId, tenant, credentials });
    if (settled?.status === 'paid') return paidPage(res, settled);
    return sendPage(res, 200, { title: 'Payment received', body: payments.orderView(settled || order).message || 'Your payment reached the school. The receipt shows in the app shortly.', extra: button(appReturnUrl(order), 'Back to the app') });
  } catch (error) {
    console.error(`[school-payments] callback failed: ${error.message}`);
    return sendPage(res, 500, { title: 'We couldn’t confirm this payment yet', body: 'If money left your account, the school will see it within a few minutes. Open the app to check.' });
  }
});

module.exports = { router, tokenFor, readToken, checkoutUrl, setTenantResolver };
