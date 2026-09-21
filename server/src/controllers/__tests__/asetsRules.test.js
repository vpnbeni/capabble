const {
  canTransitionStatus,
  assertCanAllocate,
  assertCanTransfer,
  buildAssetId,
} = require('../../modules/asets/lifecycle');

describe('ASETS controller domain rules', () => {
  it('rejects lost-asset transfer and allocate paths', () => {
    expect(() => assertCanAllocate({ status: 'LOST' })).toThrow(/lost/i);
    expect(() => assertCanTransfer({ status: 'DISPOSED' })).toThrow(/disposed/i);
  });

  it('keeps asset identity format stable for QR/barcode architecture', () => {
    const id = buildAssetId('LAB', 7);
    expect(id).toBe('ASETS-LAB-000007');
    expect(id.startsWith('ASETS-')).toBe(true);
  });

  it('does not allow disposed assets back into use without explicit transition support', () => {
    expect(canTransitionStatus('DISPOSED', 'IN_USE')).toBe(false);
    expect(canTransitionStatus('RETIRED', 'DISPOSED')).toBe(true);
  });
});
