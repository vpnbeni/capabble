const mongoose = require('mongoose');
const createContextModelProxy = require('../tenancy/createContextModelProxy');

/**
 * Online fee payments: the school's own Razorpay account (keys stored encrypted)
 * and one order per "Pay" a parent starts. Money goes straight to the school;
 * Capabble never holds it. Only src/modules/cpitl/onlinePayments.js writes these.
 */
const { ObjectId } = mongoose.Schema.Types;

const secretSchema = new mongoose.Schema({
  iv: String,
  tag: String,
  data: String
}, { _id: false });

// One document per school.
const schoolPaymentSettingsSchema = new mongoose.Schema({
  key: { type: String, default: 'default', unique: true },
  enabled: { type: Boolean, default: false },
  provider: { type: String, enum: ['razorpay'], default: 'razorpay' },
  keyId: { type: String, trim: true, maxlength: 60, default: '' },
  keySecret: { type: secretSchema, default: undefined },
  webhookSecret: { type: secretSchema, default: undefined },
  lastTestAt: { type: Date, default: null },
  lastTestOk: { type: Boolean, default: null },
  lastError: { type: String, trim: true, maxlength: 300, default: '' },
  // The last signed webhook that arrived, so the school can see the link works.
  lastWebhookAt: { type: Date, default: null },
  updatedBy: { type: ObjectId, ref: 'User', default: null }
}, { timestamps: true, collection: 'school_payment_settings' });

const ORDER_STATUSES = ['created', 'settling', 'paid', 'review'];

const feeOnlineOrderSchema = new mongoose.Schema({
  provider: { type: String, enum: ['razorpay'], default: 'razorpay' },
  razorpayOrderId: { type: String, required: true, trim: true },
  // Set once a payment for the order is seen; unique so one payment is recorded once.
  paymentId: { type: String, trim: true, default: undefined },
  status: { type: String, enum: ORDER_STATUSES, default: 'created', index: true },
  settlingAt: { type: Date, default: null },
  accountId: { type: ObjectId, ref: 'StudentFeeAccount', required: true, index: true },
  student: { type: ObjectId, ref: 'Student', required: true },
  studentSnapshot: {
    name: { type: String, trim: true, default: '' },
    rollNumber: { type: String, trim: true, default: '' },
    class: { type: String, trim: true, default: '' },
    section: { type: String, trim: true, default: '' }
  },
  // The installments the parent chose, earliest first.
  demandIds: { type: [ObjectId], default: [] },
  amount: { type: Number, required: true, min: 1 },
  amountPaise: { type: Number, required: true, min: 100 },
  currency: { type: String, default: 'INR' },
  // Not filled by the session plugin: the webhook arrives outside any request.
  academicSession: { type: String, trim: true, default: '' },
  source: { type: String, enum: ['app', 'web'], default: 'web' },
  createdBy: {
    userId: { type: ObjectId, ref: 'User', default: null },
    name: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, default: '' }
  },
  feePaymentId: { type: ObjectId, ref: 'FeePayment', default: null },
  receiptNo: { type: String, trim: true, default: '' },
  paidAt: { type: Date, default: null },
  method: { type: String, trim: true, default: '' },
  // Why a paid order could not become a receipt (staff refund or record it by hand).
  reviewReason: { type: String, trim: true, maxlength: 300, default: '' },
  lastError: { type: String, trim: true, maxlength: 300, default: '' }
}, { timestamps: true, collection: 'fee_online_orders' });
feeOnlineOrderSchema.index({ razorpayOrderId: 1 }, { unique: true });
feeOnlineOrderSchema.index(
  { paymentId: 1 },
  { unique: true, partialFilterExpression: { paymentId: { $type: 'string' } } }
);
feeOnlineOrderSchema.index({ createdAt: -1 });

module.exports = {
  ORDER_STATUSES,
  SchoolPaymentSettings: createContextModelProxy('SchoolPaymentSettings', schoolPaymentSettingsSchema),
  FeeOnlineOrder: createContextModelProxy('FeeOnlineOrder', feeOnlineOrderSchema)
};
