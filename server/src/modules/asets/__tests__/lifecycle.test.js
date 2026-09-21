const {
  canTransitionStatus,
  assertTransition,
  assertCanAllocate,
  assertCanTransfer,
  assertCanMaintain,
  assertNotDisposed,
  buildAssetId,
  roleHasPermission,
  ASETS_PERMISSIONS,
  STATUS_TRANSITIONS,
} = require('../lifecycle');

describe('ASETS lifecycle', () => {
  it('builds unique-style asset IDs', () => {
    expect(buildAssetId('fur', 1)).toBe('ASETS-FUR-000001');
    expect(buildAssetId('ICT', 42)).toBe('ASETS-ICT-000042');
  });

  it('allows valid transitions and rejects invalid ones', () => {
    expect(canTransitionStatus('IN_STOCK', 'IN_USE')).toBe(true);
    expect(canTransitionStatus('DISPOSED', 'IN_USE')).toBe(false);
    expect(() => assertTransition('LOST', 'ALLOCATED')).toThrow(/Invalid lifecycle transition/);
    expect(() => assertTransition('IN_USE', 'UNDER_MAINTENANCE')).not.toThrow();
  });

  it('defines no outgoing transitions from DISPOSED', () => {
    expect(STATUS_TRANSITIONS.DISPOSED).toEqual([]);
  });

  it('blocks allocate/transfer/maintain on disposed or lost assets', () => {
    expect(() => assertNotDisposed({ status: 'DISPOSED' })).toThrow(/disposed/);
    expect(() => assertCanAllocate({ status: 'LOST' })).toThrow(/lost/i);
    expect(() => assertCanTransfer({ status: 'LOST' })).toThrow(/lost/i);
    expect(() => assertCanMaintain({ status: 'DISPOSED' })).toThrow(/disposed/);
    expect(() => assertCanAllocate({ status: 'IN_STOCK' })).not.toThrow();
  });

  it('maps role permissions without granting dispose to operators', () => {
    expect(roleHasPermission('admin', ASETS_PERMISSIONS.ASETS_DISPOSE)).toBe(true);
    expect(roleHasPermission('admin', ASETS_PERMISSIONS.ASETS_SETTINGS)).toBe(true);
    expect(roleHasPermission('data_entry_operator', ASETS_PERMISSIONS.ASETS_VIEW)).toBe(true);
    expect(roleHasPermission('data_entry_operator', ASETS_PERMISSIONS.ASETS_ALLOCATE)).toBe(true);
    expect(roleHasPermission('data_entry_operator', ASETS_PERMISSIONS.ASETS_AUDIT)).toBe(true);
    expect(roleHasPermission('data_entry_operator', ASETS_PERMISSIONS.ASETS_DISPOSE)).toBe(false);
    expect(roleHasPermission('data_entry_operator', ASETS_PERMISSIONS.ASETS_SETTINGS)).toBe(false);
  });
});
