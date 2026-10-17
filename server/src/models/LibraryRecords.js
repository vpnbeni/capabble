const mongoose = require('mongoose');
const createContextModelProxy = require('../tenancy/createContextModelProxy');

const titleSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 500 },
  subtitle: { type: String, trim: true, default: '' },
  authors: { type: [String], default: [] },
  isbn13: { type: String, trim: true, default: '' },
  publisher: { type: String, trim: true, default: '' },
  publicationYear: { type: Number, min: 0, max: 9999, default: null },
  language: { type: String, trim: true, default: 'English' },
  subjects: { type: [String], default: [] },
  classificationCode: { type: String, trim: true, default: '' },
  description: { type: String, trim: true, default: '' },
  resourceType: { type: String, enum: ['physical', 'digital'], default: 'physical' },
  isActive: { type: Boolean, default: true },
  createdBy: { type: String, trim: true, default: '' },
  updatedBy: { type: String, trim: true, default: '' },
}, { timestamps: true });
titleSchema.index({ title: 1, isActive: 1 });
titleSchema.index({ isbn13: 1 }, { sparse: true });

const copySchema = new mongoose.Schema({
  titleId: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryTitle', required: true, index: true },
  accessionNumber: { type: String, required: true, trim: true, unique: true },
  barcode: { type: String, trim: true, default: null },
  shelfLocation: { type: String, trim: true, default: '' },
  condition: { type: String, enum: ['new', 'good', 'fair', 'damaged'], default: 'good' },
  status: { type: String, enum: ['available', 'issued', 'reserved', 'inspection', 'lost', 'damaged', 'withdrawn'], default: 'available' },
  acquiredOn: { type: Date, default: null },
  price: { type: Number, min: 0, default: null },
  supplier: { type: String, trim: true, default: '' },
  note: { type: String, trim: true, default: '' },
  isActive: { type: Boolean, default: true },
  createdBy: { type: String, trim: true, default: '' },
  updatedBy: { type: String, trim: true, default: '' },
}, { timestamps: true });
copySchema.index({ barcode: 1 }, { sparse: true });
copySchema.index({ status: 1, isActive: 1 });

const memberSchema = new mongoose.Schema({
  memberType: { type: String, enum: ['student', 'teacher', 'staff', 'other'], required: true },
  memberId: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  className: { type: String, trim: true, default: '' },
  section: { type: String, trim: true, default: '' },
  email: { type: String, trim: true, default: '' },
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  isActive: { type: Boolean, default: true },
  createdBy: { type: String, trim: true, default: '' },
  updatedBy: { type: String, trim: true, default: '' },
}, { timestamps: true });
memberSchema.index({ memberType: 1, memberId: 1 }, { unique: true });
memberSchema.index({ name: 1, isActive: 1 });

const policySchema = new mongoose.Schema({
  memberType: { type: String, enum: ['student', 'teacher', 'staff', 'other'], required: true, unique: true },
  maxActiveLoans: { type: Number, required: true, min: 1, max: 50 },
  loanDays: { type: Number, required: true, min: 1, max: 180 },
  maxRenewals: { type: Number, required: true, min: 0, max: 20, default: 0 },
  isActive: { type: Boolean, default: true },
  updatedBy: { type: String, trim: true, default: '' },
}, { timestamps: true });

const loanSchema = new mongoose.Schema({
  copyId: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryCopy', required: true },
  memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryMember', required: true },
  issuedAt: { type: Date, required: true, default: Date.now },
  dueAt: { type: Date, required: true },
  returnedAt: { type: Date, default: null },
  renewals: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['active', 'returned'], default: 'active' },
  issuedBy: { type: String, trim: true, default: '' },
  returnedBy: { type: String, trim: true, default: '' },
}, { timestamps: true });
loanSchema.index({ copyId: 1, status: 1 });
loanSchema.index({ memberId: 1, status: 1, dueAt: 1 });
loanSchema.index({ dueAt: 1, status: 1 });

const reservationSchema = new mongoose.Schema({
  titleId: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryTitle', required: true },
  memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryMember', required: true },
  status: { type: String, enum: ['queued', 'cancelled', 'fulfilled'], default: 'queued' },
  createdBy: { type: String, trim: true, default: '' },
}, { timestamps: true });
reservationSchema.index({ titleId: 1, status: 1, createdAt: 1 });
reservationSchema.index({ titleId: 1, memberId: 1, status: 1 });

const fineSchema = new mongoose.Schema({
  loanId: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryLoan', default: null },
  memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryMember', required: true },
  kind: { type: String, enum: ['overdue', 'lost', 'damaged', 'other'], required: true },
  amount: { type: mongoose.Schema.Types.Decimal128, required: true, min: 0 },
  outstandingAmount: { type: mongoose.Schema.Types.Decimal128, required: true, min: 0 },
  reason: { type: String, trim: true, required: true, maxlength: 500 },
  status: { type: String, enum: ['open', 'waived', 'settled'], default: 'open' },
  assessedBy: { type: String, trim: true, default: '' },
  waivedBy: { type: String, trim: true, default: '' },
  waiverReason: { type: String, trim: true, default: '' },
}, { timestamps: true });
fineSchema.index({ memberId: 1, status: 1, createdAt: -1 });

const acquisitionSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 500 },
  author: { type: String, trim: true, default: '' },
  isbn13: { type: String, trim: true, default: '' },
  quantity: { type: Number, required: true, min: 1, max: 1000 },
  estimatedUnitCost: { type: mongoose.Schema.Types.Decimal128, default: null },
  purpose: { type: String, trim: true, required: true, maxlength: 1000 },
  status: { type: String, enum: ['requested', 'approved', 'rejected', 'ordered', 'received'], default: 'requested' },
  requestedBy: { type: String, trim: true, required: true },
  reviewedBy: { type: String, trim: true, default: '' },
  reviewNote: { type: String, trim: true, default: '' },
}, { timestamps: true });
acquisitionSchema.index({ status: 1, createdAt: -1 });

const supplierSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 200 },
  contactName: { type: String, trim: true, default: '' },
  email: { type: String, trim: true, default: '' },
  phone: { type: String, trim: true, default: '' },
  address: { type: String, trim: true, default: '' },
  isActive: { type: Boolean, default: true },
  createdBy: { type: String, trim: true, default: '' },
}, { timestamps: true });
supplierSchema.index({ name: 1, isActive: 1 });

const purchaseOrderLineSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  author: { type: String, trim: true, default: '' },
  isbn13: { type: String, trim: true, default: '' },
  quantity: { type: Number, required: true, min: 1 },
  receivedQuantity: { type: Number, default: 0, min: 0 },
  unitCost: { type: mongoose.Schema.Types.Decimal128, default: null },
}, { _id: true });
const purchaseOrderSchema = new mongoose.Schema({
  number: { type: String, required: true, trim: true, unique: true },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'LibrarySupplier', required: true },
  requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryAcquisitionRequest', default: null },
  lines: { type: [purchaseOrderLineSchema], default: [] },
  status: { type: String, enum: ['draft', 'ordered', 'partially_received', 'received', 'cancelled'], default: 'draft' },
  orderedAt: { type: Date, default: null },
  createdBy: { type: String, trim: true, default: '' },
}, { timestamps: true });
purchaseOrderSchema.index({ status: 1, createdAt: -1 });

const goodsReceiptSchema = new mongoose.Schema({
  purchaseOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryPurchaseOrder', required: true },
  receivedAt: { type: Date, default: Date.now },
  receivedBy: { type: String, trim: true, default: '' },
  copies: { type: [{ copyId: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryCopy' }, accessionNumber: String }], default: [] },
}, { timestamps: true });
goodsReceiptSchema.index({ purchaseOrderId: 1, receivedAt: -1 });

const stocktakeItemSchema = new mongoose.Schema({
  copyId: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryCopy', required: true },
  accessionNumber: { type: String, required: true, trim: true },
  expectedStatus: { type: String, required: true },
  state: { type: String, enum: ['pending', 'verified', 'missing'], default: 'pending' },
  scannedAt: { type: Date, default: null },
  note: { type: String, trim: true, default: '' },
}, { _id: true });
const stocktakeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 200 },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
  items: { type: [stocktakeItemSchema], default: [] },
  startedBy: { type: String, trim: true, default: '' },
  closedBy: { type: String, trim: true, default: '' },
  closedAt: { type: Date, default: null },
}, { timestamps: true });
stocktakeSchema.index({ status: 1, createdAt: -1 });

const auditSchema = new mongoose.Schema({
  action: { type: String, required: true, trim: true },
  entityType: { type: String, required: true, trim: true },
  entityId: { type: String, trim: true, default: '' },
  actor: { type: String, trim: true, default: '' },
  detail: { type: String, trim: true, default: '' },
}, { timestamps: true });
auditSchema.index({ createdAt: -1 });

const digitalResourceSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 500 },
  authors: { type: [String], default: [] },
  resourceType: { type: String, enum: ['ebook', 'pdf', 'link', 'audiobook', 'video'], required: true },
  url: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },
  audience: { type: String, enum: ['staff', 'students', 'all'], default: 'all' },
  accessStartsAt: { type: Date, default: null },
  accessEndsAt: { type: Date, default: null },
  licenceReference: { type: String, trim: true, default: '' },
  status: { type: String, enum: ['active', 'expired', 'revoked'], default: 'active' },
  createdBy: { type: String, trim: true, default: '' },
}, { timestamps: true });
digitalResourceSchema.index({ status: 1, audience: 1, title: 1 });

const readingListSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 300 },
  description: { type: String, trim: true, default: '' },
  audience: { type: String, enum: ['staff', 'students', 'all'], default: 'students' },
  items: { type: [{ titleId: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryTitle', default: null }, digitalResourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryDigitalResource', default: null }, note: String }], default: [] },
  createdBy: { type: String, trim: true, default: '' },
}, { timestamps: true });
readingListSchema.index({ audience: 1, createdAt: -1 });

const readingLogSchema = new mongoose.Schema({
  memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryMember', required: true },
  titleId: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryTitle', default: null },
  digitalResourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryDigitalResource', default: null },
  minutesRead: { type: Number, required: true, min: 1, max: 1440 },
  loggedOn: { type: Date, default: Date.now },
  note: { type: String, trim: true, default: '' },
}, { timestamps: true });
readingLogSchema.index({ memberId: 1, loggedOn: -1 });

const reviewSchema = new mongoose.Schema({
  memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryMember', required: true },
  titleId: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryTitle', required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  text: { type: String, trim: true, maxlength: 2000, default: '' },
  status: { type: String, enum: ['pending', 'published', 'rejected'], default: 'pending' },
  moderatedBy: { type: String, trim: true, default: '' },
}, { timestamps: true });
reviewSchema.index({ status: 1, createdAt: -1 });

const challengeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 300 },
  description: { type: String, trim: true, default: '' },
  targetMinutes: { type: Number, required: true, min: 1 },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  audience: { type: String, enum: ['students', 'all'], default: 'students' },
  isActive: { type: Boolean, default: true },
  createdBy: { type: String, trim: true, default: '' },
}, { timestamps: true });
challengeSchema.index({ isActive: 1, endsAt: 1 });

module.exports = {
  LibraryTitle: createContextModelProxy('LibraryTitle', titleSchema),
  LibraryCopy: createContextModelProxy('LibraryCopy', copySchema),
  LibraryMember: createContextModelProxy('LibraryMember', memberSchema),
  LibraryPolicy: createContextModelProxy('LibraryPolicy', policySchema),
  LibraryLoan: createContextModelProxy('LibraryLoan', loanSchema),
  LibraryReservation: createContextModelProxy('LibraryReservation', reservationSchema),
  LibraryFine: createContextModelProxy('LibraryFine', fineSchema),
  LibraryAcquisitionRequest: createContextModelProxy('LibraryAcquisitionRequest', acquisitionSchema),
  LibrarySupplier: createContextModelProxy('LibrarySupplier', supplierSchema),
  LibraryPurchaseOrder: createContextModelProxy('LibraryPurchaseOrder', purchaseOrderSchema),
  LibraryGoodsReceipt: createContextModelProxy('LibraryGoodsReceipt', goodsReceiptSchema),
  LibraryStocktake: createContextModelProxy('LibraryStocktake', stocktakeSchema),
  LibraryAuditLog: createContextModelProxy('LibraryAuditLog', auditSchema),
  LibraryDigitalResource: createContextModelProxy('LibraryDigitalResource', digitalResourceSchema),
  LibraryReadingList: createContextModelProxy('LibraryReadingList', readingListSchema),
  LibraryReadingLog: createContextModelProxy('LibraryReadingLog', readingLogSchema),
  LibraryBookReview: createContextModelProxy('LibraryBookReview', reviewSchema),
  LibraryReadingChallenge: createContextModelProxy('LibraryReadingChallenge', challengeSchema),
};
