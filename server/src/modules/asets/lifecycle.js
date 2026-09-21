/**
 * ASETS lifecycle, condition, and permission helpers (pure / unit-testable).
 */

const ASSET_STATUSES = Object.freeze([
  'PROCURED',
  'RECEIVED',
  'IN_STOCK',
  'ALLOCATED',
  'IN_USE',
  'UNDER_MAINTENANCE',
  'DAMAGED',
  'LOST',
  'RETIRED',
  'DISPOSED',
]);

const ASSET_CONDITIONS = Object.freeze([
  'New',
  'Excellent',
  'Good',
  'Fair',
  'Poor',
  'Damaged',
  'Beyond Repair',
]);

const MAINTENANCE_STATUSES = Object.freeze([
  'Reported',
  'Assigned',
  'In Progress',
  'Awaiting Parts',
  'Completed',
  'Closed',
]);

const AUDIT_ITEM_STATES = Object.freeze([
  'Verified',
  'Missing',
  'Damaged',
  'Wrong Location',
  'Not Found',
  'Unverified',
]);

const DISPOSAL_REASONS = Object.freeze([
  'Beyond repair',
  'Obsolete',
  'Damaged',
  'Lost',
  'Sold',
  'Donated',
  'Scrapped',
  'Other',
]);

const OWNERSHIP_TYPES = Object.freeze(['Owned', 'Leased', 'Donated', 'On Loan', 'Other']);

const TRACKING_MODES = Object.freeze(['individual', 'consumable']);

/** Allowed status transitions. Key = from, value = allowed next statuses. */
const STATUS_TRANSITIONS = Object.freeze({
  PROCURED: ['RECEIVED', 'DISPOSED'],
  RECEIVED: ['IN_STOCK', 'ALLOCATED', 'IN_USE', 'DISPOSED'],
  IN_STOCK: ['ALLOCATED', 'IN_USE', 'UNDER_MAINTENANCE', 'DAMAGED', 'LOST', 'RETIRED', 'DISPOSED'],
  ALLOCATED: ['IN_USE', 'IN_STOCK', 'UNDER_MAINTENANCE', 'DAMAGED', 'LOST', 'RETIRED'],
  IN_USE: ['IN_STOCK', 'ALLOCATED', 'UNDER_MAINTENANCE', 'DAMAGED', 'LOST', 'RETIRED'],
  UNDER_MAINTENANCE: ['IN_USE', 'IN_STOCK', 'DAMAGED', 'RETIRED', 'DISPOSED'],
  DAMAGED: ['UNDER_MAINTENANCE', 'IN_USE', 'IN_STOCK', 'RETIRED', 'DISPOSED'],
  LOST: ['IN_STOCK', 'IN_USE', 'DISPOSED'],
  RETIRED: ['DISPOSED'],
  DISPOSED: [],
});

const ASETS_PERMISSIONS = Object.freeze({
  ASETS_VIEW: 'ASETS_VIEW',
  ASETS_CREATE: 'ASETS_CREATE',
  ASETS_EDIT: 'ASETS_EDIT',
  ASETS_DELETE: 'ASETS_DELETE',
  ASETS_ALLOCATE: 'ASETS_ALLOCATE',
  ASETS_TRANSFER: 'ASETS_TRANSFER',
  ASETS_MAINTAIN: 'ASETS_MAINTAIN',
  ASETS_AUDIT: 'ASETS_AUDIT',
  ASETS_DISPOSE: 'ASETS_DISPOSE',
  ASETS_PROCURE: 'ASETS_PROCURE',
  ASETS_REPORT: 'ASETS_REPORT',
  ASETS_SETTINGS: 'ASETS_SETTINGS',
});

/** Map Capabble roles → ASETS permissions until fine-grained RBAC lands. */
const ROLE_PERMISSIONS = Object.freeze({
  admin: Object.values(ASETS_PERMISSIONS),
  data_entry_operator: [
    ASETS_PERMISSIONS.ASETS_VIEW,
    ASETS_PERMISSIONS.ASETS_CREATE,
    ASETS_PERMISSIONS.ASETS_EDIT,
    ASETS_PERMISSIONS.ASETS_ALLOCATE,
    ASETS_PERMISSIONS.ASETS_TRANSFER,
    ASETS_PERMISSIONS.ASETS_MAINTAIN,
    ASETS_PERMISSIONS.ASETS_AUDIT,
    ASETS_PERMISSIONS.ASETS_PROCURE,
    ASETS_PERMISSIONS.ASETS_REPORT,
  ],
});

const canTransitionStatus = (fromStatus, toStatus) => {
  if (!fromStatus || !toStatus) return false;
  if (fromStatus === toStatus) return true;
  const allowed = STATUS_TRANSITIONS[fromStatus] || [];
  return allowed.includes(toStatus);
};

const assertTransition = (fromStatus, toStatus) => {
  if (!canTransitionStatus(fromStatus, toStatus)) {
    const error = new Error(`Invalid lifecycle transition: ${fromStatus} → ${toStatus}`);
    error.statusCode = 400;
    error.code = 'INVALID_LIFECYCLE_TRANSITION';
    throw error;
  }
};

const isTerminalStatus = (status) => status === 'DISPOSED';

const assertNotDisposed = (asset, action = 'modify') => {
  if (asset?.status === 'DISPOSED') {
    const error = new Error(`Cannot ${action} a disposed asset.`);
    error.statusCode = 400;
    error.code = 'ASSET_DISPOSED';
    throw error;
  }
};

const assertCanAllocate = (asset) => {
  assertNotDisposed(asset, 'allocate');
  if (asset.status === 'LOST') {
    const error = new Error('Cannot allocate a lost asset until it is recovered.');
    error.statusCode = 400;
    error.code = 'ASSET_LOST';
    throw error;
  }
  if (asset.status === 'RETIRED') {
    const error = new Error('Cannot allocate a retired asset.');
    error.statusCode = 400;
    error.code = 'ASSET_RETIRED';
    throw error;
  }
};

const assertCanTransfer = (asset) => {
  assertNotDisposed(asset, 'transfer');
  if (asset.status === 'LOST') {
    const error = new Error('Cannot transfer a lost asset.');
    error.statusCode = 400;
    error.code = 'ASSET_LOST';
    throw error;
  }
  if (asset.status === 'RETIRED') {
    const error = new Error('Cannot transfer a retired asset.');
    error.statusCode = 400;
    error.code = 'ASSET_RETIRED';
    throw error;
  }
};

const assertCanMaintain = (asset) => {
  assertNotDisposed(asset, 'maintain');
};

const roleHasPermission = (role, permission) => {
  const list = ROLE_PERMISSIONS[role] || [];
  return list.includes(permission);
};

const padSequence = (n, width = 6) => String(n).padStart(width, '0');

const buildAssetId = (categoryCode, sequence) => {
  const code = String(categoryCode || 'GEN')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6) || 'GEN';
  return `ASETS-${code}-${padSequence(sequence)}`;
};

const normalizeSerial = (value) => String(value || '').trim();

module.exports = {
  ASSET_STATUSES,
  ASSET_CONDITIONS,
  MAINTENANCE_STATUSES,
  AUDIT_ITEM_STATES,
  DISPOSAL_REASONS,
  OWNERSHIP_TYPES,
  TRACKING_MODES,
  STATUS_TRANSITIONS,
  ASETS_PERMISSIONS,
  ROLE_PERMISSIONS,
  canTransitionStatus,
  assertTransition,
  isTerminalStatus,
  assertNotDisposed,
  assertCanAllocate,
  assertCanTransfer,
  assertCanMaintain,
  roleHasPermission,
  padSequence,
  buildAssetId,
  normalizeSerial,
};
