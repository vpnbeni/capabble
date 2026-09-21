const mongoose = require('mongoose');
const createContextModelProxy = require('../tenancy/createContextModelProxy');
const {
  ASSET_STATUSES,
  ASSET_CONDITIONS,
  MAINTENANCE_STATUSES,
  AUDIT_ITEM_STATES,
  DISPOSAL_REASONS,
  OWNERSHIP_TYPES,
  TRACKING_MODES,
} = require('../modules/asets/lifecycle');

const auditUserSchema = {
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  name: { type: String, trim: true, default: '' },
  email: { type: String, trim: true, default: '' },
};

const attachmentSchema = new mongoose.Schema({
  name: { type: String, trim: true, default: '' },
  url: { type: String, trim: true, default: '' },
  mimeType: { type: String, trim: true, default: '' },
  size: { type: Number, default: 0 },
  uploadedAt: { type: Date, default: Date.now },
}, { _id: true });

const withMeta = (definition) => new mongoose.Schema({
  ...definition,
  isActive: { type: Boolean, default: true },
  isArchived: { type: Boolean, default: false },
  createdBy: auditUserSchema,
  updatedBy: auditUserSchema,
}, { timestamps: true });

const assetCategorySchema = withMeta({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true, uppercase: true },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetCategory', default: null },
  description: { type: String, trim: true, default: '' },
  trackingModeDefault: { type: String, enum: TRACKING_MODES, default: 'individual' },
  requiredFields: [{ type: String, trim: true }],
  customFieldDefs: [{
    key: { type: String, trim: true },
    label: { type: String, trim: true },
    type: { type: String, enum: ['text', 'number', 'date', 'select'], default: 'text' },
    options: [{ type: String }],
    required: { type: Boolean, default: false },
  }],
  sortOrder: { type: Number, default: 0 },
});
assetCategorySchema.index({ code: 1 }, { unique: true });
assetCategorySchema.index({ parentId: 1, name: 1 });
assetCategorySchema.index({ isActive: 1, isArchived: 1 });

const assetLocationSchema = withMeta({
  name: { type: String, required: true, trim: true },
  code: { type: String, trim: true, default: '' },
  type: {
    type: String,
    enum: ['School', 'Campus', 'Block', 'Building', 'Floor', 'Wing', 'Location', 'Room', 'Classroom', 'Store', 'Lab', 'Office', 'Other'],
    default: 'Room',
  },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetLocation', default: null },
  path: { type: String, trim: true, default: '' },
  department: { type: String, trim: true, default: '' },
  roomRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', default: null },
  capacityHint: { type: Number, default: 0 },
  isStore: { type: Boolean, default: false },
  notes: { type: String, trim: true, default: '' },
  address: { type: String, trim: true, default: '' },
  floorNumber: { type: String, trim: true, default: '' },
  roomNumber: { type: String, trim: true, default: '' },
  className: { type: String, trim: true, default: '' },
  section: { type: String, trim: true, default: '' },
  roomType: {
    type: String,
    enum: ['', 'Classroom', 'Laboratory', 'Office', 'Staff Room', 'Store', 'Library', 'Activity Room', 'Hall', 'Auditorium', 'Reception', 'Other'],
    default: '',
  },
  locationStatus: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
});
assetLocationSchema.index({ parentId: 1, name: 1 });
assetLocationSchema.index({ parentId: 1, code: 1 });
assetLocationSchema.index({ className: 1, section: 1 });
assetLocationSchema.index({ type: 1, isActive: 1 });
assetLocationSchema.index({ path: 1 });
assetLocationSchema.index({ isStore: 1, isActive: 1 });

const assetVendorSchema = withMeta({
  name: { type: String, required: true, trim: true },
  code: { type: String, trim: true, default: '' },
  contactPerson: { type: String, trim: true, default: '' },
  phone: { type: String, trim: true, default: '' },
  email: { type: String, trim: true, default: '' },
  address: { type: String, trim: true, default: '' },
  gstin: { type: String, trim: true, default: '' },
  productsServices: { type: String, trim: true, default: '' },
  notes: { type: String, trim: true, default: '' },
});
assetVendorSchema.index({ name: 1 });
assetVendorSchema.index({ code: 1 }, { sparse: true });

const warrantySchema = new mongoose.Schema({
  provider: { type: String, trim: true, default: '' },
  warrantyNumber: { type: String, trim: true, default: '' },
  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null },
  coverage: { type: String, trim: true, default: '' },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetVendor', default: null },
  documents: [attachmentSchema],
}, { _id: false });

const depreciationSchema = new mongoose.Schema({
  method: { type: String, enum: ['none', 'straight_line', 'reducing_balance'], default: 'none' },
  usefulLifeYears: { type: Number, default: 0 },
  salvageValue: { type: Number, default: 0 },
  ratePercent: { type: Number, default: 0 },
}, { _id: false });

const assetSchema = withMeta({
  assetId: { type: String, required: true, trim: true, uppercase: true },
  assetTag: { type: String, trim: true, default: '' },
  name: { type: String, required: true, trim: true },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetCategory', required: true },
  subcategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetCategory', default: null },
  assetType: { type: String, trim: true, default: '' },
  trackingMode: { type: String, enum: TRACKING_MODES, default: 'individual' },
  brand: { type: String, trim: true, default: '' },
  model: { type: String, trim: true, default: '' },
  serialNumber: { type: String, trim: true, default: '' },
  barcode: { type: String, trim: true, default: '' },
  qrPayload: { type: String, trim: true, default: '' },
  batchId: { type: String, trim: true, default: '' },
  batchIndex: { type: Number, default: null },
  purchaseDate: { type: Date, default: null },
  acquisitionDate: { type: Date, default: null },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetVendor', default: null },
  purchaseOrder: { type: String, trim: true, default: '' },
  invoiceNumber: { type: String, trim: true, default: '' },
  purchaseCost: { type: Number, default: 0 },
  currentValue: { type: Number, default: 0 },
  depreciation: { type: depreciationSchema, default: () => ({}) },
  warranty: { type: warrantySchema, default: () => ({}) },
  expectedLifeYears: { type: Number, default: 0 },
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetLocation', default: null },
  locationPath: { type: String, trim: true, default: '' },
  department: { type: String, trim: true, default: '' },
  roomLabel: { type: String, trim: true, default: '' },
  custodianTeacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', default: null },
  custodianName: { type: String, trim: true, default: '' },
  custodianUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  status: { type: String, enum: ASSET_STATUSES, default: 'IN_STOCK', index: true },
  condition: { type: String, enum: ASSET_CONDITIONS, default: 'New', index: true },
  ownershipType: { type: String, enum: OWNERSHIP_TYPES, default: 'Owned' },
  fundingSource: { type: String, trim: true, default: '' },
  description: { type: String, trim: true, default: '' },
  notes: { type: String, trim: true, default: '' },
  images: [attachmentSchema],
  documents: [attachmentSchema],
  customFields: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
  lastAuditAt: { type: Date, default: null },
  lastAuditStatus: { type: String, trim: true, default: '' },
  nextMaintenanceDue: { type: Date, default: null },
  disposedAt: { type: Date, default: null },
});
assetSchema.index({ assetId: 1 }, { unique: true });
assetSchema.index({ assetTag: 1 }, { sparse: true });
assetSchema.index({ barcode: 1 }, { sparse: true });
assetSchema.index({ serialNumber: 1 }, { sparse: true });
assetSchema.index({ categoryId: 1, status: 1 });
assetSchema.index({ locationId: 1, status: 1 });
assetSchema.index({ vendorId: 1 });
assetSchema.index({ batchId: 1 });
assetSchema.index({ name: 'text', assetId: 'text', serialNumber: 'text', barcode: 'text', brand: 'text', model: 'text' });
assetSchema.index({ 'warranty.endDate': 1 });
assetSchema.index({ nextMaintenanceDue: 1 });
assetSchema.index({ isActive: 1, isArchived: 1, status: 1 });

const assetAllocationSchema = withMeta({
  assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true, index: true },
  fromLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetLocation', default: null },
  toLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetLocation', required: true },
  previousCustodianName: { type: String, trim: true, default: '' },
  newCustodianName: { type: String, trim: true, default: '' },
  previousCustodianTeacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', default: null },
  newCustodianTeacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', default: null },
  allocationDate: { type: Date, default: Date.now },
  effectiveDate: { type: Date, default: Date.now },
  returnDate: { type: Date, default: null },
  reason: { type: String, trim: true, default: '' },
  approvedBy: { type: String, trim: true, default: '' },
  notes: { type: String, trim: true, default: '' },
  status: { type: String, enum: ['Active', 'Returned', 'Cancelled'], default: 'Active' },
});
assetAllocationSchema.index({ assetId: 1, allocationDate: -1 });

const assetTransferSchema = withMeta({
  assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true, index: true },
  sourceLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetLocation', default: null },
  destinationLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetLocation', required: true },
  requestedBy: { type: String, trim: true, default: '' },
  approvedBy: { type: String, trim: true, default: '' },
  transferDate: { type: Date, default: Date.now },
  reason: { type: String, trim: true, default: '' },
  notes: { type: String, trim: true, default: '' },
  status: { type: String, enum: ['Pending', 'Approved', 'Completed', 'Rejected'], default: 'Completed' },
});
assetTransferSchema.index({ assetId: 1, transferDate: -1 });
assetTransferSchema.index({ status: 1 });

const assetMaintenanceSchema = withMeta({
  assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true, index: true },
  issue: { type: String, required: true, trim: true },
  reportedDate: { type: Date, default: Date.now },
  reportedBy: { type: String, trim: true, default: '' },
  priority: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'], default: 'Medium' },
  assignedTo: { type: String, trim: true, default: '' },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetVendor', default: null },
  status: { type: String, enum: MAINTENANCE_STATUSES, default: 'Reported', index: true },
  startDate: { type: Date, default: null },
  completionDate: { type: Date, default: null },
  cost: { type: Number, default: 0 },
  warrantyClaim: { type: Boolean, default: false },
  partsUsed: { type: String, trim: true, default: '' },
  notes: { type: String, trim: true, default: '' },
  isPreventive: { type: Boolean, default: false },
  nextDueDate: { type: Date, default: null },
  attachments: [attachmentSchema],
});
assetMaintenanceSchema.index({ nextDueDate: 1 });

const assetAuditSchema = withMeta({
  title: { type: String, required: true, trim: true },
  scopeType: {
    type: String,
    enum: ['Full', 'Campus', 'Building', 'Department', 'Classroom', 'Category', 'Custom'],
    default: 'Full',
  },
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetLocation', default: null },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetCategory', default: null },
  department: { type: String, trim: true, default: '' },
  startedAt: { type: Date, default: Date.now },
  closedAt: { type: Date, default: null },
  status: { type: String, enum: ['Draft', 'In Progress', 'Closed'], default: 'In Progress', index: true },
  conductedBy: { type: String, trim: true, default: '' },
  notes: { type: String, trim: true, default: '' },
  summary: {
    expected: { type: Number, default: 0 },
    found: { type: Number, default: 0 },
    missing: { type: Number, default: 0 },
    damaged: { type: Number, default: 0 },
    wrongLocation: { type: Number, default: 0 },
    unverified: { type: Number, default: 0 },
  },
});

const assetAuditItemSchema = withMeta({
  auditId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetAudit', required: true, index: true },
  assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true, index: true },
  expectedLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetLocation', default: null },
  foundLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetLocation', default: null },
  state: { type: String, enum: AUDIT_ITEM_STATES, default: 'Unverified', index: true },
  scannedCode: { type: String, trim: true, default: '' },
  notes: { type: String, trim: true, default: '' },
  verifiedAt: { type: Date, default: null },
});
assetAuditItemSchema.index({ auditId: 1, assetId: 1 }, { unique: true });

const assetProcurementSchema = withMeta({
  title: { type: String, required: true, trim: true },
  requestNumber: { type: String, trim: true, default: '' },
  purchaseOrder: { type: String, trim: true, default: '' },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetVendor', default: null },
  invoiceNumber: { type: String, trim: true, default: '' },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetCategory', default: null },
  itemName: { type: String, trim: true, default: '' },
  quantity: { type: Number, default: 1 },
  unitCost: { type: Number, default: 0 },
  totalCost: { type: Number, default: 0 },
  receiptDate: { type: Date, default: null },
  warrantyMonths: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['Draft', 'Requested', 'Ordered', 'Received', 'Cancelled'],
    default: 'Requested',
  },
  generateAssets: { type: Boolean, default: true },
  trackingMode: { type: String, enum: TRACKING_MODES, default: 'individual' },
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetLocation', default: null },
  notes: { type: String, trim: true, default: '' },
  generatedAssetIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Asset' }],
});
assetProcurementSchema.index({ status: 1, receiptDate: -1 });

const assetDisposalSchema = withMeta({
  assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true, index: true },
  disposalDate: { type: Date, default: Date.now },
  reason: { type: String, enum: DISPOSAL_REASONS, required: true },
  method: { type: String, trim: true, default: '' },
  residualValue: { type: Number, default: 0 },
  approvedBy: { type: String, trim: true, default: '' },
  approvalRequired: { type: Boolean, default: true },
  status: { type: String, enum: ['Pending', 'Approved', 'Completed', 'Rejected'], default: 'Pending' },
  notes: { type: String, trim: true, default: '' },
  documents: [attachmentSchema],
});
assetDisposalSchema.index({ status: 1, disposalDate: -1 });

const assetLifecycleEventSchema = withMeta({
  assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true, index: true },
  eventType: { type: String, required: true, trim: true, index: true },
  previousValue: { type: mongoose.Schema.Types.Mixed, default: null },
  newValue: { type: mongoose.Schema.Types.Mixed, default: null },
  reason: { type: String, trim: true, default: '' },
  referenceType: { type: String, trim: true, default: '' },
  referenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
  actor: auditUserSchema,
  occurredAt: { type: Date, default: Date.now, index: true },
});
assetLifecycleEventSchema.index({ assetId: 1, occurredAt: -1 });

const assetStockItemSchema = withMeta({
  name: { type: String, required: true, trim: true },
  sku: { type: String, trim: true, default: '' },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetCategory', default: null },
  unit: { type: String, trim: true, default: 'pcs' },
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetLocation', default: null },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetVendor', default: null },
  openingStock: { type: Number, default: 0 },
  quantityOnHand: { type: Number, default: 0 },
  reservedQuantity: { type: Number, default: 0 },
  issuedQuantity: { type: Number, default: 0 },
  reorderLevel: { type: Number, default: 0 },
  minimumStock: { type: Number, default: 0 },
  maximumStock: { type: Number, default: 0 },
  unitCost: { type: Number, default: 0 },
  expiryDate: { type: Date, default: null },
  allowNegative: { type: Boolean, default: false },
  notes: { type: String, trim: true, default: '' },
});
assetStockItemSchema.index({ name: 1 });
assetStockItemSchema.index({ sku: 1 }, { sparse: true });
assetStockItemSchema.index({ quantityOnHand: 1, reorderLevel: 1 });

const assetStockTransactionSchema = withMeta({
  stockItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetStockItem', required: true, index: true },
  type: { type: String, enum: ['receipt', 'issue', 'adjustment', 'reserve', 'release'], required: true },
  quantity: { type: Number, required: true },
  balanceAfter: { type: Number, default: 0 },
  reference: { type: String, trim: true, default: '' },
  notes: { type: String, trim: true, default: '' },
  occurredAt: { type: Date, default: Date.now },
});
assetStockTransactionSchema.index({ stockItemId: 1, occurredAt: -1 });

const assetSettingsSchema = withMeta({
  key: { type: String, default: 'default', unique: true },
  idPrefix: { type: String, default: 'ASETS' },
  defaultWarrantyAlertDays: { type: Number, default: 30 },
  auditDueDays: { type: Number, default: 365 },
  allowNegativeStock: { type: Boolean, default: false },
  requireApprovalForDisposal: { type: Boolean, default: true },
  requireApprovalForTransfer: { type: Boolean, default: false },
  categorySequences: { type: Map, of: Number, default: {} },
  notifications: {
    lowStock: { type: Boolean, default: true },
    warrantyExpiry: { type: Boolean, default: true },
    maintenanceDue: { type: Boolean, default: true },
    auditDue: { type: Boolean, default: true },
  },
});

module.exports = {
  AssetCategory: createContextModelProxy('AssetCategory', assetCategorySchema),
  AssetLocation: createContextModelProxy('AssetLocation', assetLocationSchema),
  AssetVendor: createContextModelProxy('AssetVendor', assetVendorSchema),
  Asset: createContextModelProxy('Asset', assetSchema),
  AssetAllocation: createContextModelProxy('AssetAllocation', assetAllocationSchema),
  AssetTransfer: createContextModelProxy('AssetTransfer', assetTransferSchema),
  AssetMaintenance: createContextModelProxy('AssetMaintenance', assetMaintenanceSchema),
  AssetAudit: createContextModelProxy('AssetAudit', assetAuditSchema),
  AssetAuditItem: createContextModelProxy('AssetAuditItem', assetAuditItemSchema),
  AssetProcurement: createContextModelProxy('AssetProcurement', assetProcurementSchema),
  AssetDisposal: createContextModelProxy('AssetDisposal', assetDisposalSchema),
  AssetLifecycleEvent: createContextModelProxy('AssetLifecycleEvent', assetLifecycleEventSchema),
  AssetStockItem: createContextModelProxy('AssetStockItem', assetStockItemSchema),
  AssetStockTransaction: createContextModelProxy('AssetStockTransaction', assetStockTransactionSchema),
  AssetSettings: createContextModelProxy('AssetSettings', assetSettingsSchema),
};
