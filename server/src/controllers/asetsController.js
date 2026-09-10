const mongoose = require('mongoose');
const {
  ASSET_STATUSES,
  ASSET_CONDITIONS,
  assertTransition,
  assertCanAllocate,
  assertCanTransfer,
  assertCanMaintain,
  assertNotDisposed,
  buildAssetId,
  normalizeSerial,
  canTransitionStatus,
} = require('../modules/asets/lifecycle');
const {
  CAMPUS,
  BLOCK,
  FLOOR,
  ROOM,
  ROOM_TYPE_VALUES,
  normalizeLocationType,
  validateHierarchy,
  buildTree,
  countByType,
  buildPathSegments,
} = require('../modules/asets/locationHierarchy');
const {
  buildClassSectionOptions,
  getClassSectionLookupFromRequest,
  validateRoomClassSection,
} = require('../utils/classSectionMatrix');

const MODEL_KEYS = {
  Category: 'AssetCategory',
  Location: 'AssetLocation',
  Vendor: 'AssetVendor',
  Asset: 'Asset',
  Allocation: 'AssetAllocation',
  Transfer: 'AssetTransfer',
  Maintenance: 'AssetMaintenance',
  Audit: 'AssetAudit',
  AuditItem: 'AssetAuditItem',
  Procurement: 'AssetProcurement',
  Disposal: 'AssetDisposal',
  Lifecycle: 'AssetLifecycleEvent',
  Stock: 'AssetStockItem',
  StockTxn: 'AssetStockTransaction',
  Settings: 'AssetSettings',
};

const getModel = (req, key) => {
  const Model = req.models?.[key];
  if (!Model) {
    const error = new Error(`${key} is not available for this tenant. Enable the ASETS module.`);
    error.statusCode = 500;
    throw error;
  }
  return Model;
};

const actorFromReq = (req) => ({
  userId: req.user?._id || null,
  name: req.user?.name || req.user?.email || '',
  email: req.user?.email || '',
});

const sendError = (res, error, fallback = 'ASETS request failed.') => {
  const status = error.statusCode || 500;
  return res.status(status).json({
    success: false,
    message: error.message || fallback,
    code: error.code || undefined,
    error: process.env.NODE_ENV === 'development' ? error.message : undefined,
  });
};

const parsePagination = (query) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 25));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildLocationPath = async (Location, locationId) => {
  if (!locationId) return '';
  const names = [];
  let current = await Location.findById(locationId).lean();
  let guard = 0;
  while (current && guard < 12) {
    names.unshift(current.name);
    if (!current.parentId) break;
    current = await Location.findById(current.parentId).lean();
    guard += 1;
  }
  return names.join(' › ');
};

const getOrCreateSettings = async (req) => {
  const Settings = getModel(req, MODEL_KEYS.Settings);
  let settings = await Settings.findOne({ key: 'default' });
  if (!settings) {
    settings = await Settings.create({ key: 'default', createdBy: actorFromReq(req) });
  }
  return settings;
};

const nextAssetSequence = async (req, categoryCode) => {
  const settings = await getOrCreateSettings(req);
  const code = String(categoryCode || 'GEN').toUpperCase();
  const map = settings.categorySequences || new Map();
  const current = Number(map.get?.(code) ?? map[code] ?? 0) + 1;
  if (typeof map.set === 'function') {
    map.set(code, current);
  } else {
    settings.categorySequences = { ...map, [code]: current };
  }
  settings.markModified('categorySequences');
  await settings.save();
  return current;
};

const recordLifecycle = async (req, {
  assetId,
  eventType,
  previousValue = null,
  newValue = null,
  reason = '',
  referenceType = '',
  referenceId = null,
}) => {
  const Lifecycle = getModel(req, MODEL_KEYS.Lifecycle);
  await Lifecycle.create({
    assetId,
    eventType,
    previousValue,
    newValue,
    reason,
    referenceType,
    referenceId,
    actor: actorFromReq(req),
    occurredAt: new Date(),
    createdBy: actorFromReq(req),
  });
};

const ensureUniqueSerial = async (req, serialNumber, excludeId = null) => {
  const serial = normalizeSerial(serialNumber);
  if (!serial) return;
  const Asset = getModel(req, MODEL_KEYS.Asset);
  const filter = { serialNumber: serial, isActive: { $ne: false } };
  if (excludeId) filter._id = { $ne: excludeId };
  const existing = await Asset.findOne(filter).select('_id assetId').lean();
  if (existing) {
    const error = new Error(`Serial number already used by ${existing.assetId}.`);
    error.statusCode = 409;
    error.code = 'DUPLICATE_SERIAL';
    throw error;
  }
};

const populateAsset = (query) => query
  .populate('categoryId', 'name code')
  .populate('subcategoryId', 'name code')
  .populate('locationId', 'name path type isStore')
  .populate('vendorId', 'name code')
  .populate('custodianTeacherId', 'name employeeId');

const createSingleAsset = async (req, payload, options = {}) => {
  const Asset = getModel(req, MODEL_KEYS.Asset);
  const Category = getModel(req, MODEL_KEYS.Category);
  const Location = getModel(req, MODEL_KEYS.Location);

  const category = await Category.findById(payload.categoryId);
  if (!category || category.isActive === false) {
    const error = new Error('Valid category is required.');
    error.statusCode = 400;
    throw error;
  }

  await ensureUniqueSerial(req, payload.serialNumber);

  const sequence = options.sequence || await nextAssetSequence(req, category.code);
  const assetId = options.assetId || buildAssetId(category.code, sequence);
  const existingId = await Asset.findOne({ assetId }).select('_id').lean();
  if (existingId) {
    const error = new Error(`Asset ID ${assetId} already exists.`);
    error.statusCode = 409;
    error.code = 'DUPLICATE_ASSET_ID';
    throw error;
  }

  const locationPath = payload.locationId
    ? await buildLocationPath(Location, payload.locationId)
    : (payload.locationPath || '');

  const status = payload.status || 'IN_STOCK';
  if (!ASSET_STATUSES.includes(status)) {
    const error = new Error('Invalid asset status.');
    error.statusCode = 400;
    throw error;
  }

  const asset = await Asset.create({
    ...payload,
    assetId,
    assetTag: payload.assetTag || assetId,
    barcode: payload.barcode || assetId,
    qrPayload: payload.qrPayload || `asets://asset/${assetId}`,
    locationPath,
    currentValue: payload.currentValue ?? payload.purchaseCost ?? 0,
    trackingMode: payload.trackingMode || category.trackingModeDefault || 'individual',
    status,
    condition: payload.condition || 'New',
    createdBy: actorFromReq(req),
    updatedBy: actorFromReq(req),
  });

  await recordLifecycle(req, {
    assetId: asset._id,
    eventType: 'asset.created',
    newValue: { assetId: asset.assetId, status: asset.status, name: asset.name },
    reason: options.reason || 'Asset created',
  });

  return asset;
};

/* ----------------------------- Dashboard ----------------------------- */

const getDashboard = async (req, res) => {
  try {
    const Asset = getModel(req, MODEL_KEYS.Asset);
    const Allocation = getModel(req, MODEL_KEYS.Allocation);
    const Transfer = getModel(req, MODEL_KEYS.Transfer);
    const Maintenance = getModel(req, MODEL_KEYS.Maintenance);
    const Stock = getModel(req, MODEL_KEYS.Stock);
    const Disposal = getModel(req, MODEL_KEYS.Disposal);
    const settings = await getOrCreateSettings(req);

    const base = { isActive: { $ne: false }, isArchived: { $ne: false } };
    const [
      totalAssets,
      statusGroups,
      conditionGroups,
      categoryGroups,
      locationGroups,
      valueAgg,
      recentAllocations,
      recentTransfers,
      maintenanceDue,
      recentlyAdded,
      recentlyDisposed,
      lowStock,
      warrantySoon,
      auditDue,
    ] = await Promise.all([
      Asset.countDocuments(base),
      Asset.aggregate([{ $match: base }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Asset.aggregate([{ $match: base }, { $group: { _id: '$condition', count: { $sum: 1 } } }]),
      Asset.aggregate([
        { $match: base },
        { $group: { _id: '$categoryId', count: { $sum: 1 }, value: { $sum: '$currentValue' } } },
        { $lookup: { from: 'assetcategories', localField: '_id', foreignField: '_id', as: 'category' } },
        { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
        { $project: { count: 1, value: 1, name: '$category.name', code: '$category.code' } },
        { $sort: { count: -1 } },
        { $limit: 12 },
      ]),
      Asset.aggregate([
        { $match: base },
        { $group: { _id: '$locationId', count: { $sum: 1 } } },
        { $lookup: { from: 'assetlocations', localField: '_id', foreignField: '_id', as: 'location' } },
        { $unwind: { path: '$location', preserveNullAndEmptyArrays: true } },
        { $project: { count: 1, name: '$location.name', path: '$location.path' } },
        { $sort: { count: -1 } },
        { $limit: 12 },
      ]),
      Asset.aggregate([
        { $match: { ...base, status: { $ne: 'DISPOSED' } } },
        { $group: { _id: null, total: { $sum: '$currentValue' }, purchase: { $sum: '$purchaseCost' } } },
      ]),
      Allocation.find({ isActive: { $ne: false } }).sort({ createdAt: -1 }).limit(8)
        .populate('assetId', 'assetId name status')
        .populate('toLocationId', 'name path')
        .lean(),
      Transfer.find({ isActive: { $ne: false } }).sort({ createdAt: -1 }).limit(8)
        .populate('assetId', 'assetId name')
        .populate('sourceLocationId', 'name')
        .populate('destinationLocationId', 'name')
        .lean(),
      Maintenance.find({
        isActive: { $ne: false },
        $or: [
          { status: { $in: ['Reported', 'Assigned', 'In Progress', 'Awaiting Parts'] } },
          { nextDueDate: { $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } },
        ],
      }).sort({ nextDueDate: 1, reportedDate: -1 }).limit(10)
        .populate('assetId', 'assetId name status')
        .lean(),
      Asset.find(base).sort({ createdAt: -1 }).limit(8)
        .populate('categoryId', 'name code')
        .populate('locationId', 'name')
        .lean(),
      Disposal.find({ status: 'Completed', isActive: { $ne: false } }).sort({ disposalDate: -1 }).limit(8)
        .populate('assetId', 'assetId name')
        .lean(),
      Stock.find({
        isActive: { $ne: false },
        $expr: { $lte: ['$quantityOnHand', '$reorderLevel'] },
      }).sort({ quantityOnHand: 1 }).limit(10).lean(),
      Asset.find({
        ...base,
        status: { $ne: 'DISPOSED' },
        'warranty.endDate': {
          $gte: new Date(),
          $lte: new Date(Date.now() + (settings.defaultWarrantyAlertDays || 30) * 24 * 60 * 60 * 1000),
        },
      }).sort({ 'warranty.endDate': 1 }).limit(10).select('assetId name warranty status').lean(),
      Asset.find({
        ...base,
        status: { $nin: ['DISPOSED'] },
        $or: [
          { lastAuditAt: null },
          { lastAuditAt: { $lte: new Date(Date.now() - (settings.auditDueDays || 365) * 24 * 60 * 60 * 1000) } },
        ],
      }).countDocuments(),
    ]);

    const byStatus = Object.fromEntries(ASSET_STATUSES.map((s) => [s, 0]));
    statusGroups.forEach((row) => { byStatus[row._id] = row.count; });

    const alerts = [];
    if (lowStock.length) alerts.push({ type: 'low_stock', count: lowStock.length, message: `${lowStock.length} stock items at/below reorder level` });
    if (warrantySoon.length) alerts.push({ type: 'warranty', count: warrantySoon.length, message: `${warrantySoon.length} warranties expiring soon` });
    if (maintenanceDue.length) alerts.push({ type: 'maintenance', count: maintenanceDue.length, message: `${maintenanceDue.length} maintenance items need attention` });
    if (auditDue) alerts.push({ type: 'audit', count: auditDue, message: `${auditDue} assets are due for audit` });
    if (byStatus.LOST) alerts.push({ type: 'missing', count: byStatus.LOST, message: `${byStatus.LOST} assets marked lost` });
    if (byStatus.DAMAGED) alerts.push({ type: 'damaged', count: byStatus.DAMAGED, message: `${byStatus.DAMAGED} assets marked damaged` });

    return res.json({
      success: true,
      data: {
        kpis: {
          totalAssets,
          inUse: byStatus.IN_USE || 0,
          inStock: byStatus.IN_STOCK || 0,
          underMaintenance: byStatus.UNDER_MAINTENANCE || 0,
          damaged: byStatus.DAMAGED || 0,
          lost: byStatus.LOST || 0,
          assetValue: valueAgg[0]?.total || 0,
          purchaseValue: valueAgg[0]?.purchase || 0,
          assetsDueForAudit: auditDue,
        },
        byStatus,
        byCondition: conditionGroups,
        byCategory: categoryGroups,
        byLocation: locationGroups,
        recentAllocations,
        recentTransfers,
        maintenanceDue,
        recentlyAdded,
        recentlyDisposed,
        lowStock,
        warrantySoon,
        alerts,
      },
    });
  } catch (error) {
    return sendError(res, error, 'Failed to load ASETS dashboard.');
  }
};

/* ----------------------------- Assets CRUD ----------------------------- */

const listAssets = async (req, res) => {
  try {
    const Asset = getModel(req, MODEL_KEYS.Asset);
    const { page, limit, skip } = parsePagination(req.query);
    const filter = { isActive: { $ne: false } };

    if (req.query.includeArchived !== 'true') filter.isArchived = { $ne: true };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.condition) filter.condition = req.query.condition;
    if (req.query.categoryId) filter.categoryId = req.query.categoryId;
    if (req.query.subcategoryId) filter.subcategoryId = req.query.subcategoryId;
    if (req.query.locationId) filter.locationId = req.query.locationId;
    if (req.query.vendorId) filter.vendorId = req.query.vendorId;
    if (req.query.custodian) {
      filter.custodianName = new RegExp(escapeRegex(req.query.custodian), 'i');
    }
    if (req.query.batchId) filter.batchId = req.query.batchId;
    if (req.query.warranty === 'expiring') {
      filter['warranty.endDate'] = {
        $gte: new Date(),
        $lte: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      };
    }
    if (req.query.warranty === 'expired') {
      filter['warranty.endDate'] = { $lt: new Date() };
    }
    if (req.query.q) {
      const q = escapeRegex(req.query.q.trim());
      filter.$or = [
        { assetId: new RegExp(q, 'i') },
        { assetTag: new RegExp(q, 'i') },
        { name: new RegExp(q, 'i') },
        { serialNumber: new RegExp(q, 'i') },
        { barcode: new RegExp(q, 'i') },
        { brand: new RegExp(q, 'i') },
        { model: new RegExp(q, 'i') },
        { custodianName: new RegExp(q, 'i') },
      ];
    }

    const sortField = req.query.sort || '-createdAt';
    const [total, items] = await Promise.all([
      Asset.countDocuments(filter),
      populateAsset(Asset.find(filter).sort(sortField).skip(skip).limit(limit)).lean(),
    ]);

    return res.json({
      success: true,
      data: {
        items,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
      },
    });
  } catch (error) {
    return sendError(res, error, 'Failed to list assets.');
  }
};

const getAsset = async (req, res) => {
  try {
    const Asset = getModel(req, MODEL_KEYS.Asset);
    const Lifecycle = getModel(req, MODEL_KEYS.Lifecycle);
    const Allocation = getModel(req, MODEL_KEYS.Allocation);
    const Transfer = getModel(req, MODEL_KEYS.Transfer);
    const Maintenance = getModel(req, MODEL_KEYS.Maintenance);
    const AuditItem = getModel(req, MODEL_KEYS.AuditItem);
    const Disposal = getModel(req, MODEL_KEYS.Disposal);

    const asset = await populateAsset(Asset.findById(req.params.id)).lean();
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found.' });

    const [timeline, allocations, transfers, maintenance, audits, disposals] = await Promise.all([
      Lifecycle.find({ assetId: asset._id }).sort({ occurredAt: -1 }).limit(100).lean(),
      Allocation.find({ assetId: asset._id }).sort({ allocationDate: -1 }).limit(50)
        .populate('fromLocationId', 'name path')
        .populate('toLocationId', 'name path')
        .lean(),
      Transfer.find({ assetId: asset._id }).sort({ transferDate: -1 }).limit(50)
        .populate('sourceLocationId', 'name')
        .populate('destinationLocationId', 'name')
        .lean(),
      Maintenance.find({ assetId: asset._id }).sort({ reportedDate: -1 }).limit(50).lean(),
      AuditItem.find({ assetId: asset._id }).sort({ updatedAt: -1 }).limit(50)
        .populate('auditId', 'title status startedAt closedAt')
        .lean(),
      Disposal.find({ assetId: asset._id }).sort({ disposalDate: -1 }).lean(),
    ]);

    return res.json({
      success: true,
      data: {
        asset,
        timeline,
        allocations,
        transfers,
        maintenance,
        audits,
        disposals,
      },
    });
  } catch (error) {
    return sendError(res, error, 'Failed to load asset.');
  }
};

const createAsset = async (req, res) => {
  try {
    const asset = await createSingleAsset(req, req.body);
    return res.status(201).json({ success: true, data: asset, message: 'Asset created.' });
  } catch (error) {
    return sendError(res, error, 'Failed to create asset.');
  }
};

const bulkCreateAssets = async (req, res) => {
  try {
    const {
      quantity = 1,
      name,
      categoryId,
      subcategoryId,
      locationId,
      vendorId,
      purchaseCost = 0,
      purchaseDate,
      brand = '',
      model = '',
      condition = 'New',
      status = 'IN_STOCK',
      warranty,
      department = '',
      notes = '',
    } = req.body;

    const qty = Math.min(500, Math.max(1, Number(quantity) || 1));
    if (!name || !categoryId) {
      return res.status(400).json({ success: false, message: 'name and categoryId are required.' });
    }

    const batchId = `BATCH-${Date.now()}`;
    const created = [];
    for (let i = 0; i < qty; i += 1) {
      const asset = await createSingleAsset(req, {
        name,
        categoryId,
        subcategoryId,
        locationId,
        vendorId,
        purchaseCost,
        currentValue: purchaseCost,
        purchaseDate,
        brand,
        model,
        condition,
        status,
        warranty,
        department,
        notes,
        batchId,
        batchIndex: i + 1,
      }, { reason: `Batch create ${batchId}` });
      created.push(asset);
    }

    return res.status(201).json({
      success: true,
      data: { batchId, count: created.length, assets: created },
      message: `Created ${created.length} assets.`,
    });
  } catch (error) {
    return sendError(res, error, 'Failed to bulk create assets.');
  }
};

const updateAsset = async (req, res) => {
  try {
    const Asset = getModel(req, MODEL_KEYS.Asset);
    const Location = getModel(req, MODEL_KEYS.Location);
    const asset = await Asset.findById(req.params.id);
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found.' });
    assertNotDisposed(asset, 'edit');

    const previous = {
      status: asset.status,
      condition: asset.condition,
      locationId: asset.locationId,
      custodianName: asset.custodianName,
    };

    if (req.body.serialNumber !== undefined) {
      await ensureUniqueSerial(req, req.body.serialNumber, asset._id);
      asset.serialNumber = normalizeSerial(req.body.serialNumber);
    }

    const editable = [
      'name', 'assetTag', 'subcategoryId', 'assetType', 'brand', 'model', 'barcode',
      'purchaseDate', 'acquisitionDate', 'vendorId', 'purchaseOrder', 'invoiceNumber',
      'purchaseCost', 'currentValue', 'depreciation', 'warranty', 'expectedLifeYears',
      'department', 'roomLabel', 'custodianTeacherId', 'custodianName', 'custodianUserId',
      'ownershipType', 'fundingSource', 'description', 'notes', 'images', 'documents',
      'customFields', 'nextMaintenanceDue', 'trackingMode',
    ];
    editable.forEach((field) => {
      if (req.body[field] !== undefined) asset[field] = req.body[field];
    });

    if (req.body.condition !== undefined) {
      if (!ASSET_CONDITIONS.includes(req.body.condition)) {
        return res.status(400).json({ success: false, message: 'Invalid condition.' });
      }
      if (asset.condition !== req.body.condition) {
        await recordLifecycle(req, {
          assetId: asset._id,
          eventType: 'condition.changed',
          previousValue: asset.condition,
          newValue: req.body.condition,
          reason: req.body.conditionReason || 'Condition updated',
        });
        asset.condition = req.body.condition;
      }
    }

    if (req.body.status !== undefined && req.body.status !== asset.status) {
      assertTransition(asset.status, req.body.status);
      await recordLifecycle(req, {
        assetId: asset._id,
        eventType: 'status.changed',
        previousValue: asset.status,
        newValue: req.body.status,
        reason: req.body.statusReason || 'Status updated',
      });
      asset.status = req.body.status;
    }

    if (req.body.locationId !== undefined && String(req.body.locationId || '') !== String(asset.locationId || '')) {
      const previousLocation = asset.locationId;
      asset.locationId = req.body.locationId || null;
      asset.locationPath = await buildLocationPath(Location, asset.locationId);
      await recordLifecycle(req, {
        assetId: asset._id,
        eventType: 'location.changed',
        previousValue: previousLocation,
        newValue: asset.locationId,
        reason: req.body.locationReason || 'Location updated via edit',
      });
    }

    asset.updatedBy = actorFromReq(req);
    await asset.save();

    await recordLifecycle(req, {
      assetId: asset._id,
      eventType: 'asset.updated',
      previousValue: previous,
      newValue: {
        status: asset.status,
        condition: asset.condition,
        locationId: asset.locationId,
        custodianName: asset.custodianName,
      },
      reason: req.body.reason || 'Asset updated',
    });

    return res.json({ success: true, data: asset, message: 'Asset updated.' });
  } catch (error) {
    return sendError(res, error, 'Failed to update asset.');
  }
};

const archiveAsset = async (req, res) => {
  try {
    const Asset = getModel(req, MODEL_KEYS.Asset);
    const asset = await Asset.findById(req.params.id);
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found.' });
    asset.isArchived = true;
    asset.isActive = false;
    asset.updatedBy = actorFromReq(req);
    await asset.save();
    await recordLifecycle(req, {
      assetId: asset._id,
      eventType: 'asset.archived',
      newValue: { isArchived: true },
      reason: req.body?.reason || 'Asset archived',
    });
    return res.json({ success: true, message: 'Asset archived.' });
  } catch (error) {
    return sendError(res, error, 'Failed to archive asset.');
  }
};

/* ----------------------------- Categories / Locations / Vendors ----------------------------- */

const makeSimpleCrud = (modelKey, fields, options = {}) => ({
  list: async (req, res) => {
    try {
      const Model = getModel(req, modelKey);
      const filter = { isActive: { $ne: false } };
      if (req.query.includeArchived !== 'true') filter.isArchived = { $ne: true };
      if (req.query.parentId === 'null') filter.parentId = null;
      else if (req.query.parentId) filter.parentId = req.query.parentId;
      if (req.query.q) {
        const q = escapeRegex(req.query.q.trim());
        filter.$or = [{ name: new RegExp(q, 'i') }, { code: new RegExp(q, 'i') }];
      }
      const items = await Model.find(filter).sort(options.sort || { sortOrder: 1, name: 1 }).lean();
      return res.json({ success: true, data: items });
    } catch (error) {
      return sendError(res, error);
    }
  },
  create: async (req, res) => {
    try {
      const Model = getModel(req, modelKey);
      const payload = {};
      fields.forEach((field) => {
        if (req.body[field] !== undefined) payload[field] = req.body[field];
      });
      if (options.beforeCreate) await options.beforeCreate(req, payload);
      const record = await Model.create({
        ...payload,
        createdBy: actorFromReq(req),
        updatedBy: actorFromReq(req),
      });
      if (options.afterCreate) await options.afterCreate(req, record);
      return res.status(201).json({ success: true, data: record, message: 'Saved.' });
    } catch (error) {
      return sendError(res, error);
    }
  },
  update: async (req, res) => {
    try {
      const Model = getModel(req, modelKey);
      const record = await Model.findById(req.params.id);
      if (!record) return res.status(404).json({ success: false, message: 'Not found.' });
      fields.forEach((field) => {
        if (req.body[field] !== undefined) record[field] = req.body[field];
      });
      if (req.body.isArchived !== undefined) record.isArchived = req.body.isArchived;
      if (req.body.isActive !== undefined) record.isActive = req.body.isActive;
      record.updatedBy = actorFromReq(req);
      if (options.beforeUpdate) await options.beforeUpdate(req, record);
      await record.save();
      return res.json({ success: true, data: record, message: 'Updated.' });
    } catch (error) {
      return sendError(res, error);
    }
  },
  remove: async (req, res) => {
    try {
      const Model = getModel(req, modelKey);
      const record = await Model.findByIdAndUpdate(
        req.params.id,
        { isActive: false, isArchived: true, updatedBy: actorFromReq(req) },
        { new: true }
      );
      if (!record) return res.status(404).json({ success: false, message: 'Not found.' });
      return res.json({ success: true, message: 'Archived.' });
    } catch (error) {
      return sendError(res, error);
    }
  },
});

const categories = makeSimpleCrud(MODEL_KEYS.Category, [
  'name', 'code', 'parentId', 'description', 'trackingModeDefault', 'requiredFields', 'customFieldDefs', 'sortOrder',
]);

const LEGACY_LEAF_TYPES = ['Location', 'Classroom', 'Lab', 'Office', 'Store', 'Other'];

const normalizeRoomPayload = (payload) => {
  if (LEGACY_LEAF_TYPES.includes(payload.type)) {
    const legacy = payload.type;
    payload.roomType = payload.roomType || (
      legacy === 'Lab' ? 'Laboratory'
        : legacy === 'Location' ? 'Other'
          : legacy === 'Store' ? 'Store'
            : legacy
    );
    payload.type = ROOM;
  }
  if (payload.type === ROOM && !payload.roomType) payload.roomType = 'Other';
  if (payload.locationStatus === 'Inactive') payload.isActive = false;
  if (payload.locationStatus === 'Active') payload.isActive = true;
};

const assertUniqueLocationCode = async (Location, payload, excludeId = null) => {
  const code = String(payload.code || '').trim();
  if (!code) return;
  const filter = {
    parentId: payload.parentId || null,
    code,
    isArchived: { $ne: true },
  };
  if (excludeId) filter._id = { $ne: excludeId };
  const duplicate = await Location.findOne(filter).select('_id name').lean();
  if (duplicate) {
    const error = new Error(`Location code "${code}" already exists at this level.`);
    error.statusCode = 400;
    throw error;
  }
};

const validateCampusHierarchy = async (req, payload, { isUpdate = false } = {}) => {
  const Location = getModel(req, MODEL_KEYS.Location);
  normalizeRoomPayload(payload);

  if (!String(payload.name || '').trim()) {
    const error = new Error('Location name is required.');
    error.statusCode = 400;
    throw error;
  }

  const parent = payload.parentId ? await Location.findById(payload.parentId).lean() : null;
  if (payload.parentId && !parent) {
    const error = new Error('Selected parent location no longer exists.');
    error.statusCode = 400;
    throw error;
  }

  const hierarchyCheck = validateHierarchy({
    type: payload.type,
    parentType: parent?.type,
    parentId: payload.parentId,
  });
  if (!hierarchyCheck.ok) {
    const error = new Error(hierarchyCheck.message);
    error.statusCode = 400;
    throw error;
  }

  if (!isUpdate && normalizeLocationType(payload.type) === ROOM && !String(payload.roomNumber || '').trim()) {
    const error = new Error('Room number is required.');
    error.statusCode = 400;
    throw error;
  }

  if (normalizeLocationType(payload.type) === ROOM) {
    const lookup = await getClassSectionLookupFromRequest(req);
    const classSectionCheck = validateRoomClassSection(lookup, payload.className, payload.section);
    if (!classSectionCheck.ok) {
      const error = new Error(classSectionCheck.error);
      error.statusCode = 400;
      throw error;
    }
    payload.className = classSectionCheck.className || '';
    payload.section = classSectionCheck.section || '';

    if (payload.className && payload.section) {
      const duplicateFilter = {
        className: payload.className,
        section: payload.section,
        isArchived: { $ne: true },
        type: { $in: [ROOM, 'Location', 'Classroom', 'Lab', 'Office', 'Store', 'Other'] },
      };
      const excludeId = payload._id || (isUpdate ? req.params?.id : null);
      if (excludeId) duplicateFilter._id = { $ne: excludeId };
      const duplicateRoom = await Location.findOne(duplicateFilter).select('name').lean();
      if (duplicateRoom) {
        const error = new Error(`A room is already linked to ${payload.className} - ${payload.section}.`);
        error.statusCode = 400;
        throw error;
      }
    }
  } else {
    payload.className = '';
    payload.section = '';
  }

  if (!isUpdate) {
    await assertUniqueLocationCode(Location, payload, payload._id);
  }
};

const collectDescendantIds = async (Location, rootId) => {
  const all = await Location.find({ isArchived: { $ne: true } }).select('_id parentId').lean();
  const childrenMap = new Map();
  all.forEach((row) => {
    const parentKey = row.parentId ? String(row.parentId) : '';
    if (!childrenMap.has(parentKey)) childrenMap.set(parentKey, []);
    childrenMap.get(parentKey).push(String(row._id));
  });
  const ids = [];
  const queue = [String(rootId)];
  while (queue.length) {
    const current = queue.shift();
    ids.push(current);
    const kids = childrenMap.get(current) || [];
    kids.forEach((kid) => queue.push(kid));
  }
  return ids;
};

const ensureDefaultCampus = async (req) => {
  const Location = getModel(req, MODEL_KEYS.Location);
  const existing = await Location.findOne({ type: 'Campus', parentId: null, isActive: { $ne: false }, isArchived: { $ne: true } });
  if (existing) return existing;
  const SchoolProfile = req.models?.SchoolProfile;
  const profile = SchoolProfile ? await SchoolProfile.findOne({}).select('schoolName').lean() : null;
  const name = profile?.schoolName || req.tenant?.name || 'Main Campus';
  return Location.create({
    name,
    code: 'CAMPUS',
    type: 'Campus',
    path: name,
    createdBy: actorFromReq(req),
    updatedBy: actorFromReq(req),
  });
};

const locations = makeSimpleCrud(MODEL_KEYS.Location, [
  'name', 'code', 'type', 'parentId', 'department', 'roomRef', 'capacityHint', 'isStore', 'notes',
  'address', 'floorNumber', 'roomNumber', 'className', 'section', 'roomType', 'locationStatus',
], {
  beforeCreate: async (req, payload) => {
    await validateCampusHierarchy(req, payload);
    const Location = getModel(req, MODEL_KEYS.Location);
    payload.path = payload.parentId
      ? `${await buildLocationPath(Location, payload.parentId)} › ${payload.name}`
      : payload.name;
  },
  beforeUpdate: async (req, record) => {
    const Location = getModel(req, MODEL_KEYS.Location);
    if (req.body.parentId !== undefined && String(req.body.parentId || '') !== String(record.parentId || '')) {
      const error = new Error('Parent location cannot be changed here. Use Move Location when available.');
      error.statusCode = 400;
      throw error;
    }
    record.path = record.parentId
      ? `${await buildLocationPath(Location, record.parentId)} › ${record.name}`
      : record.name;
    await validateCampusHierarchy(req, record, { isUpdate: true });
    await assertUniqueLocationCode(Location, record, record._id);
  },
});
const listLocations = locations.list;
locations.list = async (req, res) => {
  try {
    await ensureDefaultCampus(req);
    return listLocations(req, res);
  } catch (error) {
    return sendError(res, error, 'Failed to prepare default campus.');
  }
};

locations.remove = async (req, res) => {
  try {
    const Location = getModel(req, MODEL_KEYS.Location);
    const Asset = getModel(req, MODEL_KEYS.Asset);
    const record = await Location.findById(req.params.id);
    if (!record || record.isArchived) {
      return res.status(404).json({ success: false, message: 'Location not found.' });
    }

    const childCount = await Location.countDocuments({
      parentId: record._id,
      isArchived: { $ne: true },
    });
    if (childCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot archive location with ${childCount} sub-location(s). Archive or move children first.`,
        data: { childCount },
      });
    }

    const descendantIds = await collectDescendantIds(Location, record._id);
    const assetCount = await Asset.countDocuments({
      locationId: { $in: descendantIds },
      isActive: { $ne: false },
    });
    if (assetCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot archive location with ${assetCount} assigned asset(s).`,
        data: { assetCount },
      });
    }

    record.isActive = false;
    record.isArchived = true;
    record.locationStatus = 'Inactive';
    record.updatedBy = actorFromReq(req);
    await record.save();
    return res.json({ success: true, message: 'Location archived.' });
  } catch (error) {
    return sendError(res, error, 'Failed to archive location.');
  }
};

const getSchoolDisplayName = async (req) => {
  const SchoolProfile = req.models?.SchoolProfile;
  const profile = SchoolProfile ? await SchoolProfile.findOne({}).select('schoolName').lean() : null;
  return profile?.schoolName || req.tenant?.name || 'School';
};

const getLocationAssetCountMap = async (Asset) => {
  const rows = await Asset.aggregate([
    { $match: { isActive: { $ne: false }, locationId: { $ne: null } } },
    {
      $group: {
        _id: '$locationId',
        count: { $sum: 1 },
        value: { $sum: { $ifNull: ['$currentValue', 0] } },
      },
    },
  ]);
  const map = {};
  rows.forEach((row) => {
    map[String(row._id)] = { count: row.count, value: row.value };
  });
  return map;
};

const getLocationClassSections = async (req, res) => {
  try {
    if (!req.models?.TimetableState) {
      return res.json({ success: true, data: [] });
    }
    const filter = req.academicSession ? { academicSession: req.academicSession } : { academicSession: null };
    const state = await req.models.TimetableState.findOne(filter)
      .sort({ updatedAt: -1 })
      .select('matrixClasses matrixSections matrixSelection')
      .lean();
    return res.json({ success: true, data: buildClassSectionOptions(state) });
  } catch (error) {
    return sendError(res, error, 'Failed to load class-section options.');
  }
};

const getLocationTree = async (req, res) => {
  try {
    await ensureDefaultCampus(req);
    const Location = getModel(req, MODEL_KEYS.Location);
    const Asset = getModel(req, MODEL_KEYS.Asset);
    const [locations, assetCountMap, schoolName] = await Promise.all([
      Location.find({ isActive: { $ne: false }, isArchived: { $ne: true } }).sort({ sortOrder: 1, name: 1 }).lean(),
      getLocationAssetCountMap(Asset),
      getSchoolDisplayName(req),
    ]);
    const tree = buildTree(locations, assetCountMap);
    return res.json({
      success: true,
      data: {
        schoolName,
        tree,
        counts: countByType(locations),
      },
    });
  } catch (error) {
    return sendError(res, error, 'Failed to load location tree.');
  }
};

const getLocationSummary = async (req, res) => {
  try {
    await ensureDefaultCampus(req);
    const Location = getModel(req, MODEL_KEYS.Location);
    const Asset = getModel(req, MODEL_KEYS.Asset);
    const locations = await Location.find({ isActive: { $ne: false }, isArchived: { $ne: true } }).select('type').lean();
    const assetsAssigned = await Asset.countDocuments({ isActive: { $ne: false }, locationId: { $ne: null } });
    return res.json({
      success: true,
      data: {
        ...countByType(locations),
        assetsAssigned,
      },
    });
  } catch (error) {
    return sendError(res, error, 'Failed to load location summary.');
  }
};

const searchLocations = async (req, res) => {
  try {
    await ensureDefaultCampus(req);
    const Location = getModel(req, MODEL_KEYS.Location);
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ success: true, data: [] });
    const regex = new RegExp(escapeRegex(q), 'i');
    const [matches, all] = await Promise.all([
      Location.find({
        isArchived: { $ne: true },
        isActive: { $ne: false },
        $or: [{ name: regex }, { code: regex }, { roomNumber: regex }, { className: regex }, { section: regex }],
      }).sort({ name: 1 }).limit(50).lean(),
      Location.find({ isArchived: { $ne: true }, isActive: { $ne: false } }).select('_id name type parentId').lean(),
    ]);
    const byId = new Map(all.map((row) => [String(row._id), row]));
    const data = matches.map((row) => {
      const pathSegments = buildPathSegments(row, byId);
      return {
        ...row,
        pathSegments,
        pathLabel: pathSegments.map((segment) => segment.name).join(' › '),
      };
    });
    return res.json({ success: true, data });
  } catch (error) {
    return sendError(res, error, 'Failed to search locations.');
  }
};

const getLocationOverview = async (req, res) => {
  try {
    const Location = getModel(req, MODEL_KEYS.Location);
    const Asset = getModel(req, MODEL_KEYS.Asset);
    const Allocation = getModel(req, MODEL_KEYS.Allocation);
    const Transfer = getModel(req, MODEL_KEYS.Transfer);
    const location = await Location.findOne({ _id: req.params.id, isActive: { $ne: false }, isArchived: { $ne: true } }).lean();
    if (!location) return res.status(404).json({ success: false, message: 'Location not found.' });
    const locationId = location._id;
    const active = { isActive: { $ne: false } };
    const [assets, allocations, transfers, children, allLocations, descendantIds] = await Promise.all([
      Asset.find({ ...active, locationId }).sort({ name: 1 }).limit(500)
        .populate('categoryId', 'name code').lean(),
      Allocation.find({ ...active, $or: [{ fromLocationId: locationId }, { toLocationId: locationId }] })
        .sort({ allocationDate: -1 }).limit(100).populate('assetId', 'assetId name').populate('fromLocationId', 'name path').populate('toLocationId', 'name path').lean(),
      Transfer.find({ ...active, $or: [{ sourceLocationId: locationId }, { destinationLocationId: locationId }] })
        .sort({ transferDate: -1 }).limit(100).populate('assetId', 'assetId name').populate('sourceLocationId', 'name path').populate('destinationLocationId', 'name path').lean(),
      Location.find({ ...active, parentId: locationId }).sort({ type: 1, name: 1 }).lean(),
      Location.find({ isArchived: { $ne: true } }).select('_id name type parentId').lean(),
      collectDescendantIds(Location, locationId),
    ]);
    const byId = new Map(allLocations.map((row) => [String(row._id), row]));
    const pathSegments = buildPathSegments(location, byId);
    const parent = location.parentId ? await Location.findById(location.parentId).select('name type _id').lean() : null;
    const normalizedType = normalizeLocationType(location.type);
    const typeCounts = {
      blocks: children.filter((child) => normalizeLocationType(child.type) === BLOCK).length,
      floors: children.filter((child) => normalizeLocationType(child.type) === FLOOR).length,
      rooms: children.filter((child) => normalizeLocationType(child.type) === ROOM).length,
    };
    const descendantAssets = await Asset.find({ ...active, locationId: { $in: descendantIds } }).select('currentValue').lean();
    const custodians = [...new Set(assets.map((asset) => asset.custodianName).filter(Boolean))];
    return res.json({ success: true, data: {
      location,
      parent,
      pathSegments,
      assets,
      allocations,
      transfers,
      custodians,
      children,
      summary: {
        assetCount: assets.length,
        assetValue: assets.reduce((total, asset) => total + (asset.currentValue || 0), 0),
        childCount: children.length,
        totalAssetCount: descendantAssets.length,
        totalAssetValue: descendantAssets.reduce((total, asset) => total + (asset.currentValue || 0), 0),
        ...typeCounts,
      },
    } });
  } catch (error) {
    return sendError(res, error, 'Failed to load location overview.');
  }
};

const vendors = makeSimpleCrud(MODEL_KEYS.Vendor, [
  'name', 'code', 'contactPerson', 'phone', 'email', 'address', 'gstin', 'productsServices', 'notes',
]);

/* ----------------------------- Allocations / Transfers ----------------------------- */

const listAllocations = async (req, res) => {
  try {
    const Allocation = getModel(req, MODEL_KEYS.Allocation);
    const { page, limit, skip } = parsePagination(req.query);
    const filter = { isActive: { $ne: false } };
    if (req.query.assetId) filter.assetId = req.query.assetId;
    if (req.query.status) filter.status = req.query.status;
    const [total, items] = await Promise.all([
      Allocation.countDocuments(filter),
      Allocation.find(filter).sort({ allocationDate: -1 }).skip(skip).limit(limit)
        .populate('assetId', 'assetId name status')
        .populate('fromLocationId', 'name path')
        .populate('toLocationId', 'name path')
        .lean(),
    ]);
    return res.json({ success: true, data: { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } } });
  } catch (error) {
    return sendError(res, error);
  }
};

const createAllocation = async (req, res) => {
  try {
    const Asset = getModel(req, MODEL_KEYS.Asset);
    const Allocation = getModel(req, MODEL_KEYS.Allocation);
    const Location = getModel(req, MODEL_KEYS.Location);

    const asset = await Asset.findById(req.body.assetId);
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found.' });
    assertCanAllocate(asset);

    if (!req.body.toLocationId) {
      return res.status(400).json({ success: false, message: 'toLocationId is required.' });
    }

    const fromLocationId = asset.locationId;
    const allocation = await Allocation.create({
      assetId: asset._id,
      fromLocationId,
      toLocationId: req.body.toLocationId,
      previousCustodianName: asset.custodianName,
      newCustodianName: req.body.newCustodianName || '',
      previousCustodianTeacherId: asset.custodianTeacherId,
      newCustodianTeacherId: req.body.newCustodianTeacherId || null,
      allocationDate: req.body.allocationDate || new Date(),
      effectiveDate: req.body.effectiveDate || new Date(),
      returnDate: req.body.returnDate || null,
      reason: req.body.reason || '',
      approvedBy: req.body.approvedBy || '',
      notes: req.body.notes || '',
      status: 'Active',
      createdBy: actorFromReq(req),
    });

    asset.locationId = req.body.toLocationId;
    asset.locationPath = await buildLocationPath(Location, asset.locationId);
    asset.custodianName = req.body.newCustodianName || asset.custodianName;
    asset.custodianTeacherId = req.body.newCustodianTeacherId || asset.custodianTeacherId;
    asset.department = req.body.department || asset.department;
    if (canTransitionStatus(asset.status, 'ALLOCATED')) asset.status = 'ALLOCATED';
    if (req.body.markInUse && canTransitionStatus(asset.status, 'IN_USE')) asset.status = 'IN_USE';
    else if (!req.body.markInUse && canTransitionStatus(asset.status, 'IN_USE')) asset.status = 'IN_USE';
    asset.updatedBy = actorFromReq(req);
    await asset.save();

    await recordLifecycle(req, {
      assetId: asset._id,
      eventType: 'asset.allocated',
      previousValue: { locationId: fromLocationId },
      newValue: { locationId: asset.locationId, custodianName: asset.custodianName, status: asset.status },
      reason: req.body.reason || 'Allocated',
      referenceType: 'AssetAllocation',
      referenceId: allocation._id,
    });

    return res.status(201).json({ success: true, data: allocation, message: 'Asset allocated.' });
  } catch (error) {
    return sendError(res, error);
  }
};

const returnAllocation = async (req, res) => {
  try {
    const Allocation = getModel(req, MODEL_KEYS.Allocation);
    const Asset = getModel(req, MODEL_KEYS.Asset);
    const Location = getModel(req, MODEL_KEYS.Location);
    const allocation = await Allocation.findById(req.params.id);
    if (!allocation) return res.status(404).json({ success: false, message: 'Allocation not found.' });

    allocation.status = 'Returned';
    allocation.returnDate = req.body.returnDate || new Date();
    allocation.updatedBy = actorFromReq(req);
    await allocation.save();

    const asset = await Asset.findById(allocation.assetId);
    if (asset) {
      assertNotDisposed(asset, 'return');
      if (req.body.toLocationId || allocation.fromLocationId) {
        asset.locationId = req.body.toLocationId || allocation.fromLocationId;
        asset.locationPath = await buildLocationPath(Location, asset.locationId);
      }
      if (canTransitionStatus(asset.status, 'IN_STOCK')) asset.status = 'IN_STOCK';
      asset.updatedBy = actorFromReq(req);
      await asset.save();
      await recordLifecycle(req, {
        assetId: asset._id,
        eventType: 'asset.returned',
        newValue: { locationId: asset.locationId, status: asset.status },
        reason: req.body.reason || 'Returned from allocation',
        referenceType: 'AssetAllocation',
        referenceId: allocation._id,
      });
    }

    return res.json({ success: true, data: allocation, message: 'Allocation returned.' });
  } catch (error) {
    return sendError(res, error);
  }
};

const listTransfers = async (req, res) => {
  try {
    const Transfer = getModel(req, MODEL_KEYS.Transfer);
    const { page, limit, skip } = parsePagination(req.query);
    const filter = { isActive: { $ne: false } };
    if (req.query.assetId) filter.assetId = req.query.assetId;
    if (req.query.status) filter.status = req.query.status;
    const [total, items] = await Promise.all([
      Transfer.countDocuments(filter),
      Transfer.find(filter).sort({ transferDate: -1 }).skip(skip).limit(limit)
        .populate('assetId', 'assetId name status')
        .populate('sourceLocationId', 'name path')
        .populate('destinationLocationId', 'name path')
        .lean(),
    ]);
    return res.json({ success: true, data: { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } } });
  } catch (error) {
    return sendError(res, error);
  }
};

const createTransfer = async (req, res) => {
  try {
    const Asset = getModel(req, MODEL_KEYS.Asset);
    const Transfer = getModel(req, MODEL_KEYS.Transfer);
    const Location = getModel(req, MODEL_KEYS.Location);
    const settings = await getOrCreateSettings(req);

    const asset = await Asset.findById(req.body.assetId);
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found.' });
    assertCanTransfer(asset);

    if (!req.body.destinationLocationId) {
      return res.status(400).json({ success: false, message: 'destinationLocationId is required.' });
    }
    if (String(req.body.destinationLocationId) === String(asset.locationId || '')) {
      return res.status(400).json({ success: false, message: 'Source and destination must differ.' });
    }

    const status = settings.requireApprovalForTransfer && !req.body.approvedBy
      ? 'Pending'
      : 'Completed';

    const transfer = await Transfer.create({
      assetId: asset._id,
      sourceLocationId: asset.locationId,
      destinationLocationId: req.body.destinationLocationId,
      requestedBy: req.body.requestedBy || actorFromReq(req).email,
      approvedBy: req.body.approvedBy || '',
      transferDate: req.body.transferDate || new Date(),
      reason: req.body.reason || '',
      notes: req.body.notes || '',
      status,
      createdBy: actorFromReq(req),
    });

    if (status === 'Completed') {
      const previous = asset.locationId;
      asset.locationId = req.body.destinationLocationId;
      asset.locationPath = await buildLocationPath(Location, asset.locationId);
      asset.updatedBy = actorFromReq(req);
      await asset.save();
      await recordLifecycle(req, {
        assetId: asset._id,
        eventType: 'asset.transferred',
        previousValue: { locationId: previous },
        newValue: { locationId: asset.locationId },
        reason: req.body.reason || 'Transferred',
        referenceType: 'AssetTransfer',
        referenceId: transfer._id,
      });
    }

    return res.status(201).json({ success: true, data: transfer, message: status === 'Pending' ? 'Transfer pending approval.' : 'Transfer completed.' });
  } catch (error) {
    return sendError(res, error);
  }
};

const completeTransfer = async (req, res) => {
  try {
    const Transfer = getModel(req, MODEL_KEYS.Transfer);
    const Asset = getModel(req, MODEL_KEYS.Asset);
    const Location = getModel(req, MODEL_KEYS.Location);
    const transfer = await Transfer.findById(req.params.id);
    if (!transfer) return res.status(404).json({ success: false, message: 'Transfer not found.' });
    if (transfer.status === 'Completed') {
      return res.json({ success: true, data: transfer, message: 'Already completed.' });
    }

    const asset = await Asset.findById(transfer.assetId);
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found.' });
    assertCanTransfer(asset);

    transfer.status = 'Completed';
    transfer.approvedBy = req.body.approvedBy || actorFromReq(req).email;
    transfer.updatedBy = actorFromReq(req);
    await transfer.save();

    const previous = asset.locationId;
    asset.locationId = transfer.destinationLocationId;
    asset.locationPath = await buildLocationPath(Location, asset.locationId);
    asset.updatedBy = actorFromReq(req);
    await asset.save();

    await recordLifecycle(req, {
      assetId: asset._id,
      eventType: 'asset.transferred',
      previousValue: { locationId: previous },
      newValue: { locationId: asset.locationId },
      reason: transfer.reason || 'Transfer approved',
      referenceType: 'AssetTransfer',
      referenceId: transfer._id,
    });

    return res.json({ success: true, data: transfer, message: 'Transfer completed.' });
  } catch (error) {
    return sendError(res, error);
  }
};

/* ----------------------------- Maintenance ----------------------------- */

const listMaintenance = async (req, res) => {
  try {
    const Maintenance = getModel(req, MODEL_KEYS.Maintenance);
    const { page, limit, skip } = parsePagination(req.query);
    const filter = { isActive: { $ne: false } };
    if (req.query.assetId) filter.assetId = req.query.assetId;
    if (req.query.status) filter.status = req.query.status;
    const [total, items] = await Promise.all([
      Maintenance.countDocuments(filter),
      Maintenance.find(filter).sort({ reportedDate: -1 }).skip(skip).limit(limit)
        .populate('assetId', 'assetId name status condition')
        .populate('vendorId', 'name')
        .lean(),
    ]);
    return res.json({ success: true, data: { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } } });
  } catch (error) {
    return sendError(res, error);
  }
};

const createMaintenance = async (req, res) => {
  try {
    const Asset = getModel(req, MODEL_KEYS.Asset);
    const Maintenance = getModel(req, MODEL_KEYS.Maintenance);
    const asset = await Asset.findById(req.body.assetId);
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found.' });
    assertCanMaintain(asset);
    if (!req.body.issue) return res.status(400).json({ success: false, message: 'issue is required.' });

    const record = await Maintenance.create({
      ...req.body,
      reportedDate: req.body.reportedDate || new Date(),
      reportedBy: req.body.reportedBy || actorFromReq(req).email,
      createdBy: actorFromReq(req),
    });

    if (canTransitionStatus(asset.status, 'UNDER_MAINTENANCE')) {
      const prev = asset.status;
      asset.status = 'UNDER_MAINTENANCE';
      asset.updatedBy = actorFromReq(req);
      await asset.save();
      await recordLifecycle(req, {
        assetId: asset._id,
        eventType: 'maintenance.started',
        previousValue: prev,
        newValue: 'UNDER_MAINTENANCE',
        reason: req.body.issue,
        referenceType: 'AssetMaintenance',
        referenceId: record._id,
      });
    }

    return res.status(201).json({ success: true, data: record, message: 'Maintenance recorded.' });
  } catch (error) {
    return sendError(res, error);
  }
};

const updateMaintenance = async (req, res) => {
  try {
    const Maintenance = getModel(req, MODEL_KEYS.Maintenance);
    const Asset = getModel(req, MODEL_KEYS.Asset);
    const record = await Maintenance.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: 'Not found.' });

    const fields = [
      'issue', 'priority', 'assignedTo', 'vendorId', 'status', 'startDate', 'completionDate',
      'cost', 'warrantyClaim', 'partsUsed', 'notes', 'isPreventive', 'nextDueDate', 'attachments',
    ];
    fields.forEach((field) => {
      if (req.body[field] !== undefined) record[field] = req.body[field];
    });
    record.updatedBy = actorFromReq(req);
    await record.save();

    if (['Completed', 'Closed'].includes(record.status)) {
      const asset = await Asset.findById(record.assetId);
      if (asset && asset.status === 'UNDER_MAINTENANCE' && canTransitionStatus(asset.status, 'IN_USE')) {
        asset.status = 'IN_USE';
        if (record.nextDueDate) asset.nextMaintenanceDue = record.nextDueDate;
        asset.updatedBy = actorFromReq(req);
        await asset.save();
        await recordLifecycle(req, {
          assetId: asset._id,
          eventType: 'maintenance.completed',
          newValue: record.status,
          reason: record.issue,
          referenceType: 'AssetMaintenance',
          referenceId: record._id,
        });
      }
    }

    return res.json({ success: true, data: record, message: 'Maintenance updated.' });
  } catch (error) {
    return sendError(res, error);
  }
};

/* ----------------------------- Audits ----------------------------- */

const listAudits = async (req, res) => {
  try {
    const Audit = getModel(req, MODEL_KEYS.Audit);
    const items = await Audit.find({ isActive: { $ne: false } }).sort({ startedAt: -1 }).limit(100).lean();
    return res.json({ success: true, data: items });
  } catch (error) {
    return sendError(res, error);
  }
};

const getAudit = async (req, res) => {
  try {
    const Audit = getModel(req, MODEL_KEYS.Audit);
    const AuditItem = getModel(req, MODEL_KEYS.AuditItem);
    const audit = await Audit.findById(req.params.id).lean();
    if (!audit) return res.status(404).json({ success: false, message: 'Audit not found.' });
    const items = await AuditItem.find({ auditId: audit._id })
      .populate('assetId', 'assetId name status condition locationPath barcode')
      .populate('expectedLocationId', 'name path')
      .populate('foundLocationId', 'name path')
      .lean();
    return res.json({ success: true, data: { audit, items } });
  } catch (error) {
    return sendError(res, error);
  }
};

const createAudit = async (req, res) => {
  try {
    const Audit = getModel(req, MODEL_KEYS.Audit);
    const AuditItem = getModel(req, MODEL_KEYS.AuditItem);
    const Asset = getModel(req, MODEL_KEYS.Asset);

    const assetFilter = { isActive: { $ne: false }, isArchived: { $ne: true }, status: { $ne: 'DISPOSED' } };
    if (req.body.locationId) assetFilter.locationId = req.body.locationId;
    if (req.body.categoryId) assetFilter.categoryId = req.body.categoryId;
    if (req.body.department) assetFilter.department = req.body.department;

    const assets = await Asset.find(assetFilter).select('_id locationId').lean();
    const audit = await Audit.create({
      title: req.body.title || `Asset Audit ${new Date().toISOString().slice(0, 10)}`,
      scopeType: req.body.scopeType || 'Full',
      locationId: req.body.locationId || null,
      categoryId: req.body.categoryId || null,
      department: req.body.department || '',
      conductedBy: req.body.conductedBy || actorFromReq(req).email,
      notes: req.body.notes || '',
      status: 'In Progress',
      summary: {
        expected: assets.length,
        found: 0,
        missing: 0,
        damaged: 0,
        wrongLocation: 0,
        unverified: assets.length,
      },
      createdBy: actorFromReq(req),
    });

    if (assets.length) {
      await AuditItem.insertMany(assets.map((asset) => ({
        auditId: audit._id,
        assetId: asset._id,
        expectedLocationId: asset.locationId,
        state: 'Unverified',
        createdBy: actorFromReq(req),
      })));
    }

    return res.status(201).json({ success: true, data: audit, message: 'Audit started.' });
  } catch (error) {
    return sendError(res, error);
  }
};

const refreshAuditSummary = async (req, auditId) => {
  const Audit = getModel(req, MODEL_KEYS.Audit);
  const AuditItem = getModel(req, MODEL_KEYS.AuditItem);
  const groups = await AuditItem.aggregate([
    { $match: { auditId: new mongoose.Types.ObjectId(String(auditId)) } },
    { $group: { _id: '$state', count: { $sum: 1 } } },
  ]);
  const counts = Object.fromEntries(groups.map((g) => [g._id, g.count]));
  const expected = Object.values(counts).reduce((a, b) => a + b, 0);
  await Audit.findByIdAndUpdate(auditId, {
    summary: {
      expected,
      found: counts.Verified || 0,
      missing: (counts.Missing || 0) + (counts['Not Found'] || 0),
      damaged: counts.Damaged || 0,
      wrongLocation: counts['Wrong Location'] || 0,
      unverified: counts.Unverified || 0,
    },
  });
};

const updateAuditItem = async (req, res) => {
  try {
    const Audit = getModel(req, MODEL_KEYS.Audit);
    const AuditItem = getModel(req, MODEL_KEYS.AuditItem);
    const Asset = getModel(req, MODEL_KEYS.Asset);

    const audit = await Audit.findById(req.params.id);
    if (!audit) return res.status(404).json({ success: false, message: 'Audit not found.' });
    if (audit.status === 'Closed') {
      return res.status(400).json({ success: false, message: 'Closed audits are immutable.' });
    }

    const item = await AuditItem.findOne({ auditId: audit._id, _id: req.params.itemId });
    if (!item) return res.status(404).json({ success: false, message: 'Audit item not found.' });

    if (req.body.state) item.state = req.body.state;
    if (req.body.foundLocationId !== undefined) item.foundLocationId = req.body.foundLocationId;
    if (req.body.scannedCode !== undefined) item.scannedCode = req.body.scannedCode;
    if (req.body.notes !== undefined) item.notes = req.body.notes;
    item.verifiedAt = new Date();
    item.updatedBy = actorFromReq(req);
    await item.save();

    const asset = await Asset.findById(item.assetId);
    if (asset) {
      asset.lastAuditAt = new Date();
      asset.lastAuditStatus = item.state;
      if (item.state === 'Missing' || item.state === 'Not Found') {
        if (canTransitionStatus(asset.status, 'LOST')) asset.status = 'LOST';
      }
      if (item.state === 'Damaged' && canTransitionStatus(asset.status, 'DAMAGED')) {
        asset.status = 'DAMAGED';
        asset.condition = 'Damaged';
      }
      asset.updatedBy = actorFromReq(req);
      await asset.save();
      await recordLifecycle(req, {
        assetId: asset._id,
        eventType: 'audit.item_updated',
        newValue: item.state,
        reason: req.body.notes || 'Audit verification',
        referenceType: 'AssetAudit',
        referenceId: audit._id,
      });
    }

    await refreshAuditSummary(req, audit._id);
    return res.json({ success: true, data: item, message: 'Audit item updated.' });
  } catch (error) {
    return sendError(res, error);
  }
};

const scanAuditItem = async (req, res) => {
  try {
    const Audit = getModel(req, MODEL_KEYS.Audit);
    const AuditItem = getModel(req, MODEL_KEYS.AuditItem);
    const Asset = getModel(req, MODEL_KEYS.Asset);
    const audit = await Audit.findById(req.params.id);
    if (!audit) return res.status(404).json({ success: false, message: 'Audit not found.' });
    if (audit.status === 'Closed') {
      return res.status(400).json({ success: false, message: 'Closed audits are immutable.' });
    }

    const code = String(req.body.code || '').trim();
    if (!code) return res.status(400).json({ success: false, message: 'Scan code is required.' });

    const asset = await Asset.findOne({
      $or: [{ assetId: code }, { barcode: code }, { assetTag: code }, { qrPayload: code }],
      isActive: { $ne: false },
    });
    if (!asset) return res.status(404).json({ success: false, message: 'No asset matches this code.' });

    let item = await AuditItem.findOne({ auditId: audit._id, assetId: asset._id });
    if (!item) {
      item = await AuditItem.create({
        auditId: audit._id,
        assetId: asset._id,
        expectedLocationId: asset.locationId,
        foundLocationId: asset.locationId,
        state: 'Verified',
        scannedCode: code,
        verifiedAt: new Date(),
        createdBy: actorFromReq(req),
      });
    } else {
      item.state = req.body.state || 'Verified';
      item.scannedCode = code;
      item.foundLocationId = req.body.foundLocationId || asset.locationId;
      item.verifiedAt = new Date();
      item.updatedBy = actorFromReq(req);
      await item.save();
    }

    asset.lastAuditAt = new Date();
    asset.lastAuditStatus = item.state;
    await asset.save();
    await refreshAuditSummary(req, audit._id);

    return res.json({ success: true, data: { item, asset }, message: 'Scan recorded.' });
  } catch (error) {
    return sendError(res, error);
  }
};

const closeAudit = async (req, res) => {
  try {
    const Audit = getModel(req, MODEL_KEYS.Audit);
    const audit = await Audit.findById(req.params.id);
    if (!audit) return res.status(404).json({ success: false, message: 'Audit not found.' });
    if (audit.status === 'Closed') {
      return res.status(400).json({ success: false, message: 'Audit already closed.' });
    }
    await refreshAuditSummary(req, audit._id);
    audit.status = 'Closed';
    audit.closedAt = new Date();
    audit.updatedBy = actorFromReq(req);
    await audit.save();
    return res.json({ success: true, data: audit, message: 'Audit closed.' });
  } catch (error) {
    return sendError(res, error);
  }
};

/* ----------------------------- Stock ----------------------------- */

const listStock = async (req, res) => {
  try {
    const Stock = getModel(req, MODEL_KEYS.Stock);
    const items = await Stock.find({ isActive: { $ne: false } })
      .populate('categoryId', 'name code')
      .populate('locationId', 'name path')
      .populate('vendorId', 'name')
      .sort({ name: 1 })
      .lean();
    return res.json({ success: true, data: items });
  } catch (error) {
    return sendError(res, error);
  }
};

const createStockItem = async (req, res) => {
  try {
    const Stock = getModel(req, MODEL_KEYS.Stock);
    const opening = Number(req.body.openingStock || req.body.quantityOnHand || 0);
    const item = await Stock.create({
      ...req.body,
      openingStock: opening,
      quantityOnHand: opening,
      createdBy: actorFromReq(req),
    });
    return res.status(201).json({ success: true, data: item, message: 'Stock item created.' });
  } catch (error) {
    return sendError(res, error);
  }
};

const updateStockItem = async (req, res) => {
  try {
    const Stock = getModel(req, MODEL_KEYS.Stock);
    const item = await Stock.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Not found.' });
    [
      'name', 'sku', 'categoryId', 'unit', 'locationId', 'vendorId', 'reorderLevel',
      'minimumStock', 'maximumStock', 'unitCost', 'expiryDate', 'allowNegative', 'notes', 'reservedQuantity',
    ].forEach((field) => {
      if (req.body[field] !== undefined) item[field] = req.body[field];
    });
    item.updatedBy = actorFromReq(req);
    await item.save();
    return res.json({ success: true, data: item, message: 'Stock item updated.' });
  } catch (error) {
    return sendError(res, error);
  }
};

const stockAdjust = async (req, res) => {
  try {
    const Stock = getModel(req, MODEL_KEYS.Stock);
    const StockTxn = getModel(req, MODEL_KEYS.StockTxn);
    const settings = await getOrCreateSettings(req);
    const item = await Stock.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Stock item not found.' });

    const type = req.body.type;
    const quantity = Number(req.body.quantity);
    if (!['receipt', 'issue', 'adjustment', 'reserve', 'release'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Invalid transaction type.' });
    }
    if (!Number.isFinite(quantity) || quantity === 0) {
      return res.status(400).json({ success: false, message: 'quantity must be a non-zero number.' });
    }

    let delta = quantity;
    if (type === 'issue') delta = -Math.abs(quantity);
    if (type === 'receipt') delta = Math.abs(quantity);
    if (type === 'reserve') {
      item.reservedQuantity = Number(item.reservedQuantity || 0) + Math.abs(quantity);
      delta = 0;
    }
    if (type === 'release') {
      item.reservedQuantity = Math.max(0, Number(item.reservedQuantity || 0) - Math.abs(quantity));
      delta = 0;
    }

    const nextQty = Number(item.quantityOnHand || 0) + delta;
    const allowNegative = item.allowNegative || settings.allowNegativeStock;
    if (nextQty < 0 && !allowNegative) {
      return res.status(400).json({ success: false, message: 'Stock cannot go negative.', code: 'NEGATIVE_STOCK' });
    }

    item.quantityOnHand = nextQty;
    if (type === 'issue') item.issuedQuantity = Number(item.issuedQuantity || 0) + Math.abs(quantity);
    item.updatedBy = actorFromReq(req);
    await item.save();

    const txn = await StockTxn.create({
      stockItemId: item._id,
      type,
      quantity: delta || quantity,
      balanceAfter: item.quantityOnHand,
      reference: req.body.reference || '',
      notes: req.body.notes || '',
      createdBy: actorFromReq(req),
    });

    return res.json({ success: true, data: { item, txn }, message: 'Stock updated.' });
  } catch (error) {
    return sendError(res, error);
  }
};

/* ----------------------------- Procurement ----------------------------- */

const listProcurement = async (req, res) => {
  try {
    const Procurement = getModel(req, MODEL_KEYS.Procurement);
    const items = await Procurement.find({ isActive: { $ne: false } })
      .populate('vendorId', 'name')
      .populate('categoryId', 'name code')
      .populate('locationId', 'name')
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ success: true, data: items });
  } catch (error) {
    return sendError(res, error);
  }
};

const createProcurement = async (req, res) => {
  try {
    const Procurement = getModel(req, MODEL_KEYS.Procurement);
    const quantity = Number(req.body.quantity || 1);
    const unitCost = Number(req.body.unitCost || 0);
    const record = await Procurement.create({
      ...req.body,
      quantity,
      unitCost,
      totalCost: req.body.totalCost ?? quantity * unitCost,
      createdBy: actorFromReq(req),
    });
    return res.status(201).json({ success: true, data: record, message: 'Procurement saved.' });
  } catch (error) {
    return sendError(res, error);
  }
};

const receiveProcurement = async (req, res) => {
  try {
    const Procurement = getModel(req, MODEL_KEYS.Procurement);
    const Stock = getModel(req, MODEL_KEYS.Stock);
    const record = await Procurement.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: 'Not found.' });
    if (record.status === 'Received') {
      return res.status(400).json({ success: false, message: 'Already received.' });
    }

    const generated = [];
    if (record.generateAssets && record.trackingMode === 'individual' && record.categoryId) {
      const qty = Math.min(500, Math.max(1, Number(record.quantity) || 1));
      const warrantyEnd = record.warrantyMonths
        ? new Date(Date.now() + record.warrantyMonths * 30 * 24 * 60 * 60 * 1000)
        : null;
      for (let i = 0; i < qty; i += 1) {
        const asset = await createSingleAsset(req, {
          name: record.itemName || record.title,
          categoryId: record.categoryId,
          vendorId: record.vendorId,
          purchaseOrder: record.purchaseOrder,
          invoiceNumber: record.invoiceNumber,
          purchaseCost: record.unitCost,
          currentValue: record.unitCost,
          purchaseDate: record.receiptDate || new Date(),
          acquisitionDate: record.receiptDate || new Date(),
          locationId: record.locationId,
          status: 'IN_STOCK',
          warranty: warrantyEnd ? { startDate: new Date(), endDate: warrantyEnd } : {},
          batchId: `PO-${record._id}`,
          batchIndex: i + 1,
        }, { reason: `Received from procurement ${record.requestNumber || record._id}` });
        generated.push(asset._id);
      }
      record.generatedAssetIds = generated;
    } else if (record.trackingMode === 'consumable') {
      const item = await Stock.create({
        name: record.itemName || record.title,
        categoryId: record.categoryId,
        vendorId: record.vendorId,
        locationId: record.locationId,
        openingStock: record.quantity,
        quantityOnHand: record.quantity,
        unitCost: record.unitCost,
        createdBy: actorFromReq(req),
      });
      record.notes = `${record.notes || ''}\nStock item ${item._id}`.trim();
    }

    record.status = 'Received';
    record.receiptDate = req.body.receiptDate || new Date();
    record.updatedBy = actorFromReq(req);
    await record.save();

    return res.json({
      success: true,
      data: { procurement: record, generatedCount: generated.length },
      message: 'Procurement received.',
    });
  } catch (error) {
    return sendError(res, error);
  }
};

/* ----------------------------- Disposal ----------------------------- */

const listDisposals = async (req, res) => {
  try {
    const Disposal = getModel(req, MODEL_KEYS.Disposal);
    const items = await Disposal.find({ isActive: { $ne: false } })
      .populate('assetId', 'assetId name status')
      .sort({ disposalDate: -1 })
      .lean();
    return res.json({ success: true, data: items });
  } catch (error) {
    return sendError(res, error);
  }
};

const createDisposal = async (req, res) => {
  try {
    const Asset = getModel(req, MODEL_KEYS.Asset);
    const Disposal = getModel(req, MODEL_KEYS.Disposal);
    const settings = await getOrCreateSettings(req);
    const asset = await Asset.findById(req.body.assetId);
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found.' });
    assertNotDisposed(asset, 'dispose');
    if (!req.body.reason) return res.status(400).json({ success: false, message: 'Disposal reason is required.' });

    const needsApproval = settings.requireApprovalForDisposal !== false;
    if (needsApproval && !req.body.approvedBy) {
      const pending = await Disposal.create({
        ...req.body,
        status: 'Pending',
        approvalRequired: true,
        createdBy: actorFromReq(req),
      });
      return res.status(201).json({ success: true, data: pending, message: 'Disposal pending approval.' });
    }

    assertTransition(asset.status, 'DISPOSED');
    const disposal = await Disposal.create({
      ...req.body,
      status: 'Completed',
      approvedBy: req.body.approvedBy || actorFromReq(req).email,
      disposalDate: req.body.disposalDate || new Date(),
      createdBy: actorFromReq(req),
    });

    const prev = asset.status;
    asset.status = 'DISPOSED';
    asset.disposedAt = disposal.disposalDate;
    asset.updatedBy = actorFromReq(req);
    await asset.save();

    await recordLifecycle(req, {
      assetId: asset._id,
      eventType: 'asset.disposed',
      previousValue: prev,
      newValue: 'DISPOSED',
      reason: req.body.reason,
      referenceType: 'AssetDisposal',
      referenceId: disposal._id,
    });

    return res.status(201).json({ success: true, data: disposal, message: 'Asset disposed.' });
  } catch (error) {
    return sendError(res, error);
  }
};

const approveDisposal = async (req, res) => {
  try {
    const Disposal = getModel(req, MODEL_KEYS.Disposal);
    const Asset = getModel(req, MODEL_KEYS.Asset);
    const disposal = await Disposal.findById(req.params.id);
    if (!disposal) return res.status(404).json({ success: false, message: 'Not found.' });
    if (disposal.status === 'Completed') {
      return res.json({ success: true, data: disposal, message: 'Already completed.' });
    }

    const asset = await Asset.findById(disposal.assetId);
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found.' });
    assertNotDisposed(asset, 'dispose');
    assertTransition(asset.status, 'DISPOSED');

    disposal.status = 'Completed';
    disposal.approvedBy = req.body.approvedBy || actorFromReq(req).email;
    disposal.updatedBy = actorFromReq(req);
    await disposal.save();

    const prev = asset.status;
    asset.status = 'DISPOSED';
    asset.disposedAt = disposal.disposalDate || new Date();
    asset.updatedBy = actorFromReq(req);
    await asset.save();

    await recordLifecycle(req, {
      assetId: asset._id,
      eventType: 'asset.disposed',
      previousValue: prev,
      newValue: 'DISPOSED',
      reason: disposal.reason,
      referenceType: 'AssetDisposal',
      referenceId: disposal._id,
    });

    return res.json({ success: true, data: disposal, message: 'Disposal approved and completed.' });
  } catch (error) {
    return sendError(res, error);
  }
};

/* ----------------------------- Reports / Settings / Lookup ----------------------------- */

const getReport = async (req, res) => {
  try {
    const Asset = getModel(req, MODEL_KEYS.Asset);
    const type = req.params.type;
    const base = { isActive: { $ne: false }, isArchived: { $ne: true } };

    const handlers = {
      register: async () => populateAsset(Asset.find(base).sort({ assetId: 1 }).limit(5000)).lean(),
      'by-category': async () => Asset.aggregate([
        { $match: base },
        { $group: { _id: '$categoryId', count: { $sum: 1 }, value: { $sum: '$currentValue' } } },
        { $lookup: { from: 'assetcategories', localField: '_id', foreignField: '_id', as: 'category' } },
        { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
        { $project: { count: 1, value: 1, name: '$category.name', code: '$category.code' } },
        { $sort: { count: -1 } },
      ]),
      'by-location': async () => Asset.aggregate([
        { $match: base },
        { $group: { _id: '$locationId', count: { $sum: 1 }, value: { $sum: '$currentValue' } } },
        { $lookup: { from: 'assetlocations', localField: '_id', foreignField: '_id', as: 'location' } },
        { $unwind: { path: '$location', preserveNullAndEmptyArrays: true } },
        { $project: { count: 1, value: 1, name: '$location.name', path: '$location.path' } },
        { $sort: { count: -1 } },
      ]),
      'by-department': async () => Asset.aggregate([
        { $match: base },
        { $group: { _id: '$department', count: { $sum: 1 }, value: { $sum: '$currentValue' } } },
        { $sort: { count: -1 } },
      ]),
      'by-custodian': async () => Asset.aggregate([
        { $match: base },
        { $group: { _id: '$custodianName', count: { $sum: 1 }, value: { $sum: '$currentValue' } } },
        { $sort: { count: -1 } },
      ]),
      valuation: async () => Asset.aggregate([
        { $match: { ...base, status: { $ne: 'DISPOSED' } } },
        { $group: { _id: '$status', count: { $sum: 1 }, purchase: { $sum: '$purchaseCost' }, current: { $sum: '$currentValue' } } },
      ]),
      maintenance: async () => getModel(req, MODEL_KEYS.Maintenance).find({ isActive: { $ne: false } })
        .populate('assetId', 'assetId name').sort({ reportedDate: -1 }).limit(1000).lean(),
      warranty: async () => Asset.find({ ...base, 'warranty.endDate': { $ne: null } })
        .select('assetId name warranty status').sort({ 'warranty.endDate': 1 }).limit(2000).lean(),
      transfers: async () => getModel(req, MODEL_KEYS.Transfer).find({ isActive: { $ne: false } })
        .populate('assetId', 'assetId name')
        .populate('sourceLocationId', 'name')
        .populate('destinationLocationId', 'name')
        .sort({ transferDate: -1 }).limit(1000).lean(),
      audits: async () => getModel(req, MODEL_KEYS.Audit).find({ isActive: { $ne: false } }).sort({ startedAt: -1 }).lean(),
      missing: async () => populateAsset(Asset.find({ ...base, status: 'LOST' })).lean(),
      damaged: async () => populateAsset(Asset.find({ ...base, status: 'DAMAGED' })).lean(),
      disposal: async () => getModel(req, MODEL_KEYS.Disposal).find({ isActive: { $ne: false } })
        .populate('assetId', 'assetId name').sort({ disposalDate: -1 }).lean(),
      procurement: async () => getModel(req, MODEL_KEYS.Procurement).find({ isActive: { $ne: false } })
        .populate('vendorId', 'name').sort({ createdAt: -1 }).lean(),
      stock: async () => getModel(req, MODEL_KEYS.Stock).find({ isActive: { $ne: false } }).lean(),
      lifecycle: async () => getModel(req, MODEL_KEYS.Lifecycle).find({})
        .sort({ occurredAt: -1 }).limit(2000).lean(),
    };

    if (!handlers[type]) {
      return res.status(400).json({ success: false, message: `Unknown report type: ${type}` });
    }

    const rows = await handlers[type]();
    return res.json({ success: true, data: { type, rows, generatedAt: new Date().toISOString() } });
  } catch (error) {
    return sendError(res, error, 'Failed to generate report.');
  }
};

const getSettings = async (req, res) => {
  try {
    const settings = await getOrCreateSettings(req);
    return res.json({ success: true, data: settings });
  } catch (error) {
    return sendError(res, error);
  }
};

const updateSettings = async (req, res) => {
  try {
    const settings = await getOrCreateSettings(req);
    [
      'idPrefix', 'defaultWarrantyAlertDays', 'auditDueDays', 'allowNegativeStock',
      'requireApprovalForDisposal', 'requireApprovalForTransfer', 'notifications',
    ].forEach((field) => {
      if (req.body[field] !== undefined) settings[field] = req.body[field];
    });
    settings.updatedBy = actorFromReq(req);
    await settings.save();
    return res.json({ success: true, data: settings, message: 'Settings saved.' });
  } catch (error) {
    return sendError(res, error);
  }
};

const lookupByCode = async (req, res) => {
  try {
    const Asset = getModel(req, MODEL_KEYS.Asset);
    const code = String(req.params.code || '').trim();
    const asset = await populateAsset(Asset.findOne({
      $or: [{ assetId: code }, { barcode: code }, { assetTag: code }, { qrPayload: code }],
      isActive: { $ne: false },
    })).lean();
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found for code.' });
    return res.json({ success: true, data: asset });
  } catch (error) {
    return sendError(res, error);
  }
};

const getMeta = async (_req, res) => {
  return res.json({
    success: true,
    data: {
      statuses: ASSET_STATUSES,
      conditions: ASSET_CONDITIONS,
      transitions: require('../modules/asets/lifecycle').STATUS_TRANSITIONS,
      locationTypes: [CAMPUS, BLOCK, FLOOR, ROOM],
      roomTypes: ROOM_TYPE_VALUES,
    },
  });
};

module.exports = {
  getDashboard,
  listAssets,
  getAsset,
  createAsset,
  bulkCreateAssets,
  updateAsset,
  archiveAsset,
  categories,
  locations,
  getLocationTree,
  getLocationSummary,
  getLocationClassSections,
  searchLocations,
  getLocationOverview,
  vendors,
  listAllocations,
  createAllocation,
  returnAllocation,
  listTransfers,
  createTransfer,
  completeTransfer,
  listMaintenance,
  createMaintenance,
  updateMaintenance,
  listAudits,
  getAudit,
  createAudit,
  updateAuditItem,
  scanAuditItem,
  closeAudit,
  listStock,
  createStockItem,
  updateStockItem,
  stockAdjust,
  listProcurement,
  createProcurement,
  receiveProcurement,
  listDisposals,
  createDisposal,
  approveDisposal,
  getReport,
  getSettings,
  updateSettings,
  lookupByCode,
  getMeta,
  // exported for tests
  _internal: {
    createSingleAsset,
    ensureUniqueSerial,
    nextAssetSequence,
    canTransitionStatus,
  },
};
