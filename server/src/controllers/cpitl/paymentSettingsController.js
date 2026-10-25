/**
 * Settings → Payments: the school's own Razorpay account for online fee
 * payments. The key secret and webhook secret are stored encrypted and never
 * sent back. Off by default.
 */
const Joi = require('joi');
const asyncHandler = require('../../middleware/asyncHandler');
const payments = require('../../modules/cpitl/onlinePayments');

const schema = Joi.object({
  enabled: Joi.boolean().required(),
  keyId: Joi.string().trim().max(60).allow(''),
  // Leave empty to keep the stored secret.
  keySecret: Joi.string().trim().max(200).allow(''),
  webhookSecret: Joi.string().trim().max(200).allow('')
});

const recentOrders = async (models) => {
  const orders = await models.FeeOnlineOrder.find({ status: { $ne: 'created' } })
    .select('status amount studentSnapshot receiptNo paymentId paidAt method reviewReason createdAt createdBy.name')
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
  const needsReview = await models.FeeOnlineOrder.countDocuments({ status: 'review' });
  return {
    needsReview,
    recent: orders.map((order) => ({
      _id: order._id,
      status: order.status === 'settling' ? 'processing' : order.status,
      amount: order.amount,
      student: order.studentSnapshot?.name || '',
      admissionNo: order.studentSnapshot?.rollNumber || '',
      className: [order.studentSnapshot?.class, order.studentSnapshot?.section].filter(Boolean).join('-'),
      paidBy: order.createdBy?.name || '',
      receiptNo: order.receiptNo || '',
      paymentId: order.paymentId || '',
      method: order.method || '',
      paidAt: order.paidAt || order.createdAt,
      reviewReason: order.reviewReason || ''
    }))
  };
};

// GET /api/cpitl/payment-settings
const getSettings = asyncHandler(async (req, res) => {
  const settings = await payments.loadSettings(req.models);
  const orders = await recentOrders(req.models);
  res.json({ success: true, data: { ...payments.settingsView(settings, req.tenant.slug), ...orders } });
});

// PUT /api/cpitl/payment-settings
const saveSettings = asyncHandler(async (req, res) => {
  const { error, value } = schema.validate(req.body || {}, { abortEarly: true, stripUnknown: true });
  if (error) return res.status(400).json({ success: false, message: error.details[0].message.replace(/"/g, '') });
  const doc = await payments.saveSettings(req.models, value, req.user?._id);
  return res.json({ success: true, data: payments.settingsView(doc.toObject(), req.tenant.slug) });
});

// POST /api/cpitl/payment-settings/test — checks the keys with Razorpay.
const testSettings = asyncHandler(async (req, res) => {
  const settings = await payments.testSettings(req.models);
  res.json({ success: true, data: payments.settingsView(settings.toObject(), req.tenant.slug) });
});

module.exports = { getSettings, saveSettings, testSettings };
