/**
 * Seed realistic ASETS development data into a tenant model map.
 * @param {Record<string, import('mongoose').Model>} models
 */
const seedAsets = async (models) => {
  const {
    AssetCategory,
    AssetLocation,
    AssetVendor,
    Asset,
    AssetAllocation,
    AssetTransfer,
    AssetMaintenance,
    AssetStockItem,
    AssetSettings,
    AssetLifecycleEvent,
  } = models;

  if (!AssetCategory || !Asset) {
    throw new Error('ASETS models are not registered on this connection.');
  }

  const existing = await Asset.countDocuments();
  if (existing >= 50) {
    return { skipped: true, reason: 'Assets already present', count: existing };
  }

  await Promise.all([
    AssetCategory.deleteMany({}),
    AssetLocation.deleteMany({}),
    AssetVendor.deleteMany({}),
    Asset.deleteMany({}),
    AssetAllocation.deleteMany({}),
    AssetTransfer.deleteMany({}),
    AssetMaintenance.deleteMany({}),
    AssetStockItem.deleteMany({}),
    AssetLifecycleEvent.deleteMany({}),
    AssetSettings.deleteMany({}),
  ]);

  const categories = await AssetCategory.insertMany([
    { name: 'Furniture', code: 'FUR', sortOrder: 1 },
    { name: 'ICT', code: 'ICT', sortOrder: 2 },
    { name: 'Laboratory', code: 'LAB', sortOrder: 3 },
    { name: 'Sports', code: 'SPT', sortOrder: 4 },
    { name: 'Office', code: 'OFF', sortOrder: 5 },
    { name: 'Electrical', code: 'ELC', sortOrder: 6 },
    { name: 'Teaching Equipment', code: 'TCH', sortOrder: 7 },
    { name: 'Cleaning', code: 'CLN', sortOrder: 8 },
    { name: 'Other', code: 'OTH', sortOrder: 9 },
  ]);

  const byCode = Object.fromEntries(categories.map((c) => [c.code, c]));

  const subcats = await AssetCategory.insertMany([
    { name: 'Bench', code: 'FUR-BEN', parentId: byCode.FUR._id },
    { name: 'Desk', code: 'FUR-DSK', parentId: byCode.FUR._id },
    { name: 'Chair', code: 'FUR-CHR', parentId: byCode.FUR._id },
    { name: 'Laptop', code: 'ICT-LAP', parentId: byCode.ICT._id },
    { name: 'Projector', code: 'ICT-PRJ', parentId: byCode.ICT._id },
    { name: 'Printer', code: 'ICT-PRT', parentId: byCode.ICT._id },
    { name: 'Chemistry', code: 'LAB-CHM', parentId: byCode.LAB._id },
    { name: 'Physics', code: 'LAB-PHY', parentId: byCode.LAB._id },
    { name: 'Cricket', code: 'SPT-CRI', parentId: byCode.SPT._id },
  ]);

  const campus = await AssetLocation.create({ name: 'Main Campus', code: 'MC', type: 'Campus', path: 'Main Campus' });
  const academic = await AssetLocation.create({
    name: 'Academic Block', code: 'AB', type: 'Building', parentId: campus._id, path: 'Main Campus › Academic Block',
  });
  const floor1 = await AssetLocation.create({
    name: 'First Floor', code: 'F1', type: 'Floor', parentId: academic._id, path: 'Main Campus › Academic Block › First Floor',
  });
  const store = await AssetLocation.create({
    name: 'Central Store', code: 'STORE', type: 'Store', parentId: campus._id, path: 'Main Campus › Central Store', isStore: true,
  });
  const class8a = await AssetLocation.create({
    name: 'Class 8A', code: 'C8A', type: 'Classroom', parentId: floor1._id, path: 'Main Campus › Academic Block › First Floor › Class 8A',
  });
  const class9b = await AssetLocation.create({
    name: 'Class 9B', code: 'C9B', type: 'Classroom', parentId: floor1._id, path: 'Main Campus › Academic Block › First Floor › Class 9B',
  });
  const ictLab = await AssetLocation.create({
    name: 'ICT Lab', code: 'ICTLAB', type: 'Lab', parentId: floor1._id, path: 'Main Campus › Academic Block › First Floor › ICT Lab',
  });
  const office = await AssetLocation.create({
    name: 'Admin Office', code: 'ADMIN', type: 'Office', parentId: academic._id, path: 'Main Campus › Academic Block › Admin Office',
  });

  const vendors = await AssetVendor.insertMany([
    { name: 'Bharat School Furniture', code: 'V-FUR', contactPerson: 'Ramesh Kumar', phone: '9876500001', email: 'sales@bsf.example' },
    { name: 'TechNova Systems', code: 'V-ICT', contactPerson: 'Anita Sharma', phone: '9876500002', email: 'orders@technova.example' },
    { name: 'LabEquip India', code: 'V-LAB', contactPerson: 'Suresh Patel', phone: '9876500003', email: 'lab@labequip.example' },
  ]);

  const sequences = {};
  const nextId = (code) => {
    sequences[code] = (sequences[code] || 0) + 1;
    return `ASETS-${code}-${String(sequences[code]).padStart(6, '0')}`;
  };

  const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  const daysFromNow = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

  const templates = [
    { name: 'Student Bench', cat: 'FUR', sub: 'FUR-BEN', cost: 2200, brand: 'Bharat', count: 12, location: store, status: 'IN_STOCK', condition: 'New' },
    { name: 'Teacher Desk', cat: 'FUR', sub: 'FUR-DSK', cost: 4500, brand: 'Bharat', count: 4, location: class8a, status: 'IN_USE', condition: 'Good' },
    { name: 'Plastic Chair', cat: 'FUR', sub: 'FUR-CHR', cost: 800, brand: 'Neelkamal', count: 10, location: store, status: 'IN_STOCK', condition: 'Excellent' },
    { name: 'Dell Latitude Laptop', cat: 'ICT', sub: 'ICT-LAP', cost: 52000, brand: 'Dell', count: 8, location: ictLab, status: 'IN_USE', condition: 'Good', warrantyDays: 40 },
    { name: 'Epson Projector', cat: 'ICT', sub: 'ICT-PRJ', cost: 38000, brand: 'Epson', count: 3, location: class9b, status: 'IN_USE', condition: 'Fair', warrantyDays: 20 },
    { name: 'HP LaserJet Printer', cat: 'ICT', sub: 'ICT-PRT', cost: 18000, brand: 'HP', count: 2, location: office, status: 'UNDER_MAINTENANCE', condition: 'Poor' },
    { name: 'Bunsen Burner', cat: 'LAB', sub: 'LAB-CHM', cost: 650, brand: 'LabEquip', count: 6, location: store, status: 'IN_STOCK', condition: 'New' },
    { name: 'Vernier Caliper', cat: 'LAB', sub: 'LAB-PHY', cost: 1200, brand: 'LabEquip', count: 4, location: store, status: 'ALLOCATED', condition: 'Good' },
    { name: 'Cricket Bat', cat: 'SPT', sub: 'SPT-CRI', cost: 1800, brand: 'SS', count: 5, location: store, status: 'IN_STOCK', condition: 'Good' },
    { name: 'Smart Board', cat: 'TCH', cost: 95000, brand: 'Promethean', count: 2, location: class8a, status: 'IN_USE', condition: 'Excellent', warrantyDays: 90 },
    { name: 'Ceiling Fan', cat: 'ELC', cost: 2500, brand: 'Havells', count: 4, location: class9b, status: 'IN_USE', condition: 'Fair' },
    { name: 'Vacuum Cleaner', cat: 'CLN', cost: 7500, brand: 'Eureka', count: 2, location: store, status: 'IN_STOCK', condition: 'Good' },
    { name: 'School Flag Pole Set', cat: 'OTH', cost: 3500, brand: 'Generic', count: 1, location: campus, status: 'IN_USE', condition: 'Good' },
    { name: 'Damaged Projector', cat: 'ICT', sub: 'ICT-PRJ', cost: 25000, brand: 'BenQ', count: 1, location: store, status: 'DAMAGED', condition: 'Damaged' },
    { name: 'Missing Tablet', cat: 'ICT', sub: 'ICT-LAP', cost: 18000, brand: 'Lenovo', count: 1, location: ictLab, status: 'LOST', condition: 'Fair' },
    { name: 'Retired Typewriter', cat: 'OFF', cost: 500, brand: 'Godrej', count: 1, location: store, status: 'RETIRED', condition: 'Beyond Repair' },
    { name: 'Disposed CRT Monitor', cat: 'ICT', cost: 0, brand: 'Samsung', count: 1, location: store, status: 'DISPOSED', condition: 'Beyond Repair' },
  ];

  const subByCode = Object.fromEntries(subcats.map((s) => [s.code, s]));
  const assets = [];
  let serialCounter = 1000;

  for (const tpl of templates) {
    for (let i = 0; i < tpl.count; i += 1) {
      const assetId = nextId(tpl.cat);
      const purchaseDate = daysAgo(120 + i * 3);
      const warrantyEnd = tpl.warrantyDays ? daysFromNow(tpl.warrantyDays - i * 5) : null;
      assets.push({
        assetId,
        assetTag: assetId,
        name: tpl.count > 1 ? `${tpl.name} #${i + 1}` : tpl.name,
        categoryId: byCode[tpl.cat]._id,
        subcategoryId: tpl.sub ? subByCode[tpl.sub]?._id : null,
        brand: tpl.brand,
        model: `${tpl.brand}-M${i + 1}`,
        serialNumber: `SN-${serialCounter++}`,
        barcode: assetId,
        qrPayload: `asets://asset/${assetId}`,
        purchaseDate,
        acquisitionDate: purchaseDate,
        vendorId: vendors[tpl.cat === 'LAB' ? 2 : tpl.cat === 'ICT' || tpl.cat === 'TCH' ? 1 : 0]._id,
        purchaseCost: tpl.cost,
        currentValue: Math.round(tpl.cost * (tpl.status === 'DISPOSED' ? 0 : 0.85)),
        warranty: warrantyEnd ? { provider: tpl.brand, startDate: purchaseDate, endDate: warrantyEnd, coverage: 'Manufacturer' } : {},
        locationId: tpl.location._id,
        locationPath: tpl.location.path,
        department: tpl.location.type === 'Classroom' ? 'Academics' : tpl.location.type === 'Office' ? 'Administration' : 'General',
        custodianName: tpl.status === 'IN_USE' ? 'Class Teacher' : 'Store Keeper',
        status: tpl.status,
        condition: tpl.condition,
        ownershipType: 'Owned',
        fundingSource: 'School Fund',
        disposedAt: tpl.status === 'DISPOSED' ? daysAgo(10) : null,
        lastAuditAt: tpl.status === 'IN_USE' ? daysAgo(200) : null,
        nextMaintenanceDue: tpl.status === 'UNDER_MAINTENANCE' ? daysFromNow(7) : daysFromNow(60),
      });
    }
  }

  const createdAssets = await Asset.insertMany(assets);

  await AssetSettings.create({
    key: 'default',
    categorySequences: sequences,
    defaultWarrantyAlertDays: 30,
    auditDueDays: 180,
    requireApprovalForDisposal: true,
  });

  const inUse = createdAssets.filter((a) => a.status === 'IN_USE').slice(0, 5);
  for (const asset of inUse) {
    await AssetAllocation.create({
      assetId: asset._id,
      fromLocationId: store._id,
      toLocationId: asset.locationId,
      previousCustodianName: 'Store Keeper',
      newCustodianName: asset.custodianName,
      reason: 'Classroom allocation',
      approvedBy: 'admin@sems.com',
      status: 'Active',
    });
  }

  const transferable = createdAssets.find((a) => a.name.includes('Teacher Desk'));
  if (transferable) {
    await AssetTransfer.create({
      assetId: transferable._id,
      sourceLocationId: class8a._id,
      destinationLocationId: class9b._id,
      requestedBy: 'operator@sems.com',
      approvedBy: 'admin@sems.com',
      reason: 'Section reallocation',
      status: 'Completed',
    });
  }

  const printer = createdAssets.find((a) => a.status === 'UNDER_MAINTENANCE');
  if (printer) {
    await AssetMaintenance.create({
      assetId: printer._id,
      issue: 'Paper jam and toner sensor fault',
      reportedBy: 'admin@sems.com',
      priority: 'High',
      assignedTo: 'TechNova Support',
      status: 'In Progress',
      startDate: daysAgo(2),
      cost: 1500,
    });
  }

  await AssetStockItem.insertMany([
    { name: 'A4 Paper Ream', sku: 'ST-PAPER', unit: 'ream', quantityOnHand: 12, reorderLevel: 20, minimumStock: 10, maximumStock: 100, unitCost: 280, locationId: store._id, vendorId: vendors[0]._id },
    { name: 'Printer Toner HP', sku: 'ST-TONER', unit: 'pcs', quantityOnHand: 3, reorderLevel: 5, minimumStock: 2, maximumStock: 20, unitCost: 3200, locationId: store._id, vendorId: vendors[1]._id },
    { name: 'White Chalk Box', sku: 'ST-CHALK', unit: 'box', quantityOnHand: 40, reorderLevel: 15, minimumStock: 10, maximumStock: 80, unitCost: 45, locationId: store._id },
    { name: 'Floor Cleaner 5L', sku: 'ST-CLEAN', unit: 'can', quantityOnHand: 4, reorderLevel: 6, minimumStock: 3, maximumStock: 24, unitCost: 390, locationId: store._id, expiryDate: daysFromNow(120) },
  ]);

  for (const asset of createdAssets.slice(0, 20)) {
    await AssetLifecycleEvent.create({
      assetId: asset._id,
      eventType: 'asset.created',
      newValue: { assetId: asset.assetId, status: asset.status },
      reason: 'Seed data',
      occurredAt: asset.purchaseDate || new Date(),
    });
  }

  return {
    skipped: false,
    categories: categories.length + subcats.length,
    locations: 8,
    vendors: vendors.length,
    assets: createdAssets.length,
    stockItems: 4,
  };
};

module.exports = { seedAsets };
