const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { requireTenantFeature } = require('../middleware/tenantFeatureAccess');
const { requireAsetsPermission, ASETS_PERMISSIONS } = require('../middleware/asetsPermissions');
const ctrl = require('../controllers/asetsController');

const router = express.Router();
router.use(protect);
router.use(requireTenantFeature('asets_dashboard'));

router.get('/meta', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_VIEW), ctrl.getMeta);
router.get('/dashboard', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_VIEW), ctrl.getDashboard);
router.get('/lookup/:code', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_VIEW), ctrl.lookupByCode);

router.get('/assets', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_VIEW), ctrl.listAssets);
router.get('/assets/:id', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_VIEW), ctrl.getAsset);
router.post('/assets', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_CREATE), ctrl.createAsset);
router.post('/assets/bulk', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_CREATE), ctrl.bulkCreateAssets);
router.put('/assets/:id', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_EDIT), ctrl.updateAsset);
router.delete('/assets/:id', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_DELETE), ctrl.archiveAsset);

router.get('/categories', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_VIEW), ctrl.categories.list);
router.post('/categories', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_EDIT), ctrl.categories.create);
router.put('/categories/:id', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_EDIT), ctrl.categories.update);
router.delete('/categories/:id', authorize('admin'), requireAsetsPermission(ASETS_PERMISSIONS.ASETS_DELETE), ctrl.categories.remove);

router.get('/locations', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_VIEW), ctrl.locations.list);
router.post('/locations', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_EDIT), ctrl.locations.create);
router.get('/locations/:id', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_VIEW), ctrl.getLocationOverview);
router.put('/locations/:id', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_EDIT), ctrl.locations.update);
router.delete('/locations/:id', authorize('admin'), requireAsetsPermission(ASETS_PERMISSIONS.ASETS_DELETE), ctrl.locations.remove);

router.get('/vendors', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_VIEW), ctrl.vendors.list);
router.post('/vendors', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_EDIT), ctrl.vendors.create);
router.put('/vendors/:id', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_EDIT), ctrl.vendors.update);
router.delete('/vendors/:id', authorize('admin'), requireAsetsPermission(ASETS_PERMISSIONS.ASETS_DELETE), ctrl.vendors.remove);

router.get('/allocations', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_VIEW), ctrl.listAllocations);
router.post('/allocations', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_ALLOCATE), ctrl.createAllocation);
router.post('/allocations/:id/return', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_ALLOCATE), ctrl.returnAllocation);

router.get('/transfers', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_VIEW), ctrl.listTransfers);
router.post('/transfers', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_TRANSFER), ctrl.createTransfer);
router.post('/transfers/:id/complete', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_TRANSFER), ctrl.completeTransfer);

router.get('/maintenance', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_VIEW), ctrl.listMaintenance);
router.post('/maintenance', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_MAINTAIN), ctrl.createMaintenance);
router.put('/maintenance/:id', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_MAINTAIN), ctrl.updateMaintenance);

router.get('/audits', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_VIEW), ctrl.listAudits);
router.get('/audits/:id', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_VIEW), ctrl.getAudit);
router.post('/audits', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_AUDIT), ctrl.createAudit);
router.put('/audits/:id/items/:itemId', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_AUDIT), ctrl.updateAuditItem);
router.post('/audits/:id/scan', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_AUDIT), ctrl.scanAuditItem);
router.post('/audits/:id/close', authorize('admin'), requireAsetsPermission(ASETS_PERMISSIONS.ASETS_AUDIT), ctrl.closeAudit);

router.get('/stock', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_VIEW), ctrl.listStock);
router.post('/stock', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_EDIT), ctrl.createStockItem);
router.put('/stock/:id', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_EDIT), ctrl.updateStockItem);
router.post('/stock/:id/adjust', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_EDIT), ctrl.stockAdjust);

router.get('/procurement', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_VIEW), ctrl.listProcurement);
router.post('/procurement', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_PROCURE), ctrl.createProcurement);
router.post('/procurement/:id/receive', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_PROCURE), ctrl.receiveProcurement);

router.get('/disposals', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_VIEW), ctrl.listDisposals);
router.post('/disposals', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_DISPOSE), ctrl.createDisposal);
router.post('/disposals/:id/approve', authorize('admin'), requireAsetsPermission(ASETS_PERMISSIONS.ASETS_DISPOSE), ctrl.approveDisposal);

router.get('/reports/:type', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_REPORT), ctrl.getReport);

router.get('/settings', requireAsetsPermission(ASETS_PERMISSIONS.ASETS_VIEW), ctrl.getSettings);
router.put('/settings', authorize('admin'), requireAsetsPermission(ASETS_PERMISSIONS.ASETS_SETTINGS), ctrl.updateSettings);

module.exports = router;
