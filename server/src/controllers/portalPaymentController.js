/**
 * Family portal: paying fees online through the school's own Razorpay account.
 * Parents only, and only for their own linked child (`loadLinkedStudent` runs
 * first and 404s anything else). See modules/cpitl/onlinePayments.js.
 */
const Joi = require('joi');
const asyncHandler = require('../middleware/asyncHandler');
const { USER_KINDS } = require('../rbac/permissions');
const { featureOn, portalSections } = require('../rbac/portalSections');
const payments = require('../modules/cpitl/onlinePayments');
const { checkoutUrl } = require('../modules/cpitl/publicPayments');

const unavailable = (res, message) => res.status(404).json({ success: false, message, errorCode: 'not_available' });

const feesOpen = (req) => req.user.kind === USER_KINDS.PARENT
  && portalSections(req.user.kind).includes('fees')
  && featureOn(req, 'cpitl_fees')
  && Boolean(req.models?.FeeOnlineOrder);

const objectId = Joi.string().hex().length(24);
const startSchema = Joi.object({
  // The installments to pay; empty pays everything still due.
  demandIds: Joi.array().items(objectId).max(24).default([]),
  source: Joi.string().valid('app', 'web').default('web')
});
const verifySchema = Joi.object({
  razorpay_payment_id: Joi.string().trim().max(60).required(),
  razorpay_order_id: Joi.string().trim().max(60).required(),
  razorpay_signature: Joi.string().trim().hex().max(128).required()
});

const loadOrder = (req) => req.models.FeeOnlineOrder
  .findOne({ _id: req.params.orderId, student: req.portalStudent._id });

/** For GET /fees: whether the Pay action shows. */
const onlinePaymentStatus = async (req) => {
  if (!feesOpen(req)) return { enabled: false };
  const settings = await payments.loadSettings(req.models);
  return { enabled: payments.isConnected(settings), mode: settings?.keyId ? payments.modeOf(settings.keyId) : null };
};

// POST /api/portal/students/:studentId/fees/pay
const startPayment = asyncHandler(async (req, res) => {
  if (!feesOpen(req)) return unavailable(res, 'Fees are not available.');
  const { error, value } = startSchema.validate(req.body || {}, { abortEarly: true, stripUnknown: true });
  if (error) return res.status(400).json({ success: false, message: 'Choose the fees to pay.' });
  const account = await req.models.StudentFeeAccount.findOne({ student: req.portalStudent._id }).lean();
  if (!account) return res.status(404).json({ success: false, message: 'No fees are set up for this child yet.' });

  const { order, keyId, chosen } = await payments.createOrder(req.models, {
    account,
    demandIds: value.demandIds,
    sessionLabel: req.academicSession,
    user: req.user,
    source: value.source
  });
  const { SchoolProfile } = req.models;
  const school = SchoolProfile ? await SchoolProfile.findOne({}).select('schoolName').lean() : null;
  return res.status(201).json({
    success: true,
    data: {
      orderId: String(order._id),
      razorpayOrderId: order.razorpayOrderId,
      keyId,
      amount: order.amount,
      amountPaise: order.amountPaise,
      currency: 'INR',
      schoolName: school?.schoolName || req.tenant?.name || '',
      description: `Fees for ${req.portalStudent.name}`.slice(0, 250),
      installments: chosen.map((demand) => ({
        _id: demand._id, label: demand.label || demand.periodKey, amount: demand.balance
      })),
      prefill: { name: req.user.name || '', email: req.user.email || '', contact: req.user.phone || '' },
      // The app opens this page in the browser to pay (no native checkout needed).
      checkoutUrl: checkoutUrl({ slug: req.tenant.slug, orderId: order._id })
    }
  });
});

// POST /api/portal/students/:studentId/fees/pay/:orderId/verify — after web Checkout succeeds.
const verifyPayment = asyncHandler(async (req, res) => {
  if (!feesOpen(req)) return unavailable(res, 'Fees are not available.');
  const { error, value } = verifySchema.validate(req.body || {}, { abortEarly: true, stripUnknown: true });
  if (error) return res.status(400).json({ success: false, message: 'The payment details are incomplete.' });
  const order = await loadOrder(req);
  if (!order) return res.status(404).json({ success: false, message: 'Payment not found.' });
  if (order.status === 'paid' || order.status === 'review') {
    return res.json({ success: true, data: payments.orderView(order) });
  }

  const credentials = payments.credentialsOf(await payments.loadSettings(req.models));
  const paymentId = value.razorpay_payment_id;
  const signed = credentials && value.razorpay_order_id === order.razorpayOrderId
    && payments.verifyCheckoutSignature(
      { orderId: order.razorpayOrderId, paymentId, signature: value.razorpay_signature },
      credentials.keySecret
    );
  if (!signed) {
    const message = 'We could not confirm this payment. '
      + 'If money left your account, the school will see it within a few minutes.';
    return res.status(400).json({ success: false, message });
  }

  const settled = await payments.settleOrder(req.models, { order, paymentId, tenant: req.tenant, credentials });
  return res.json({ success: true, data: payments.orderView(settled || order) });
});

// GET /api/portal/students/:studentId/fees/pay/:orderId — the app checks this when the parent comes back.
const getPayment = asyncHandler(async (req, res) => {
  if (!feesOpen(req)) return unavailable(res, 'Fees are not available.');
  let order = await loadOrder(req);
  if (!order) return res.status(404).json({ success: false, message: 'Payment not found.' });
  if (order.status === 'created') {
    try {
      order = (await payments.syncOrder(req.models, order, { tenant: req.tenant })) || order;
    } catch (syncError) {
      // Razorpay unreachable: report what we know; the webhook still settles it.
    }
  }
  return res.json({ success: true, data: payments.orderView(order) });
});

module.exports = { onlinePaymentStatus, startPayment, verifyPayment, getPayment };
