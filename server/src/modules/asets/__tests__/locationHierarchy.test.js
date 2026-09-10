const {
  CAMPUS,
  BLOCK,
  FLOOR,
  ROOM,
  validateHierarchy,
  buildTree,
  compareRoomNumbers,
  countByType,
  childTypeForParent,
} = require('../locationHierarchy');

describe('ASETS location hierarchy', () => {
  it('allows valid parent-child relationships', () => {
    expect(validateHierarchy({ type: CAMPUS, parentType: null, parentId: null }).ok).toBe(true);
    expect(validateHierarchy({ type: BLOCK, parentType: CAMPUS, parentId: '1' }).ok).toBe(true);
    expect(validateHierarchy({ type: FLOOR, parentType: BLOCK, parentId: '1' }).ok).toBe(true);
    expect(validateHierarchy({ type: ROOM, parentType: FLOOR, parentId: '1' }).ok).toBe(true);
  });

  it('rejects invalid hierarchy combinations', () => {
    expect(validateHierarchy({ type: BLOCK, parentType: FLOOR, parentId: '1' }).ok).toBe(false);
    expect(validateHierarchy({ type: FLOOR, parentType: CAMPUS, parentId: '1' }).ok).toBe(false);
    expect(validateHierarchy({ type: ROOM, parentType: BLOCK, parentId: '1' }).ok).toBe(false);
    expect(validateHierarchy({ type: ROOM, parentType: CAMPUS, parentId: '1' }).ok).toBe(false);
    expect(validateHierarchy({ type: BLOCK, parentType: ROOM, parentId: '1' }).ok).toBe(false);
    expect(validateHierarchy({ type: CAMPUS, parentType: null, parentId: '1' }).ok).toBe(false);
  });

  it('maps child type from parent', () => {
    expect(childTypeForParent(CAMPUS)).toBe(BLOCK);
    expect(childTypeForParent(BLOCK)).toBe(FLOOR);
    expect(childTypeForParent(FLOOR)).toBe(ROOM);
    expect(childTypeForParent(ROOM)).toBeNull();
  });

  it('builds nested tree with asset totals', () => {
    const locations = [
      { _id: 'c1', name: 'Main', type: CAMPUS, parentId: null },
      { _id: 'b1', name: 'Junior', type: BLOCK, parentId: 'c1' },
      { _id: 'f1', name: 'Ground', type: FLOOR, parentId: 'b1' },
      { _id: 'r1', name: 'Class 1A', type: ROOM, parentId: 'f1' },
    ];
    const tree = buildTree(locations, { r1: { count: 2, value: 100 } });
    expect(tree).toHaveLength(1);
    expect(tree[0].children[0].children[0].children[0].totalAssetCount).toBe(2);
  });

  it('sorts rooms by room number under floors regardless of sortOrder', () => {
    const locations = [
      { _id: 'c1', name: 'Main', type: 'Campus', parentId: null },
      { _id: 'b1', name: 'Senior', type: 'Block', parentId: 'c1' },
      { _id: 'f1', name: 'Second', type: 'Floor', parentId: 'b1' },
      { _id: 'r1', name: 'Old SKT', type: 'Room', parentId: 'f1', roomNumber: '1', sortOrder: 4 },
      { _id: 'r2', name: '7 Tulip', type: 'Room', parentId: 'f1', roomNumber: '4', sortOrder: 1 },
      { _id: 'r3', name: 'New French', type: 'Room', parentId: 'f1', roomNumber: '2', sortOrder: 3 },
      { _id: 'r4', name: 'XI Comm', type: 'Room', parentId: 'f1', roomNumber: '3', sortOrder: 2 },
    ];
    const tree = buildTree(locations);
    const rooms = tree[0].children[0].children[0].children;
    expect(rooms.map((room) => room.roomNumber)).toEqual(['1', '2', '3', '4']);
  });

  it('falls back to code when roomNumber is missing', () => {
    const locations = [
      { _id: 'c1', name: 'Main', type: 'Campus', parentId: null },
      { _id: 'b1', name: 'Senior', type: 'Block', parentId: 'c1' },
      { _id: 'f1', name: 'Second', type: 'Floor', parentId: 'b1' },
      { _id: 'r1', name: 'Old SKT', type: 'Location', parentId: 'f1', code: '1' },
      { _id: 'r2', name: 'New French', type: 'Location', parentId: 'f1', code: '2' },
    ];
    const tree = buildTree(locations);
    const rooms = tree[0].children[0].children[0].children;
    expect(rooms.map((room) => room.code)).toEqual(['1', '2']);
  });

  it('compares room numbers numerically when possible', () => {
    expect(compareRoomNumbers({ roomNumber: '2' }, { roomNumber: '10' })).toBeLessThan(0);
    expect(compareRoomNumbers({ roomNumber: '10' }, { roomNumber: '2' })).toBeGreaterThan(0);
  });

  it('counts locations by normalized type', () => {
    const counts = countByType([
      { type: CAMPUS },
      { type: BLOCK },
      { type: FLOOR },
      { type: ROOM },
      { type: 'Classroom' },
    ]);
    expect(counts).toEqual({ campuses: 1, blocks: 1, floors: 1, rooms: 2 });
  });
});
