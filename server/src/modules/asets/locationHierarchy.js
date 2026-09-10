const CAMPUS = 'Campus';
const BLOCK = 'Block';
const FLOOR = 'Floor';
const ROOM = 'Room';

/** Leaf location types stored as `type` in legacy data; new records use Room + roomType. */
const LEGACY_LEAF_TYPES = new Set([
  'Location',
  'Room',
  'Classroom',
  'Lab',
  'Office',
  'Store',
  'Other',
]);

const ROOM_TYPE_VALUES = [
  'Classroom',
  'Laboratory',
  'Office',
  'Staff Room',
  'Store',
  'Library',
  'Activity Room',
  'Hall',
  'Auditorium',
  'Reception',
  'Other',
];

const HIERARCHY_PARENT = {
  [CAMPUS]: null,
  [BLOCK]: CAMPUS,
  [FLOOR]: BLOCK,
  [ROOM]: FLOOR,
};

function normalizeLocationType(type) {
  if (!type) return null;
  if (type === CAMPUS || type === BLOCK || type === FLOOR) return type;
  if (type === ROOM || LEGACY_LEAF_TYPES.has(type)) return ROOM;
  return type;
}

function isLeafType(type) {
  const normalized = normalizeLocationType(type);
  return normalized === ROOM;
}

function expectedParentType(childType) {
  const normalized = normalizeLocationType(childType);
  return HIERARCHY_PARENT[normalized] ?? null;
}

function childTypeForParent(parentType) {
  if (parentType === CAMPUS) return BLOCK;
  if (parentType === BLOCK) return FLOOR;
  if (parentType === FLOOR) return ROOM;
  return null;
}

function validateHierarchy({ type, parentType, parentId }) {
  const normalized = normalizeLocationType(type);
  const expectedParent = expectedParentType(normalized);

  if (normalized === CAMPUS) {
    if (parentId) {
      return { ok: false, message: 'Campus cannot have a parent location.' };
    }
    return { ok: true };
  }

  if (!parentId) {
    return { ok: false, message: `${normalized} must have a parent location.` };
  }

  if (!expectedParent) {
    return { ok: false, message: `Invalid location type: ${type}.` };
  }

  const normalizedParent = normalizeLocationType(parentType);
  if (normalizedParent !== expectedParent) {
    return {
      ok: false,
      message: `${normalized} must be created under a ${expectedParent}, not ${parentType || 'none'}.`,
    };
  }

  return { ok: true };
}

function getRoomSortKey(node) {
  const explicit = String(node?.roomNumber || node?.code || '').trim();
  if (explicit) return explicit;
  const fromName = String(node?.name || '').trim().match(/^(\d+)/);
  return fromName ? fromName[1] : '';
}

function compareRoomNumbers(a, b) {
  const left = getRoomSortKey(a);
  const right = getRoomSortKey(b);
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  const numericCompare = left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
  if (numericCompare !== 0) return numericCompare;
  return String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' });
}

function shouldSortChildrenByRoomNumber(parentType) {
  return normalizeLocationType(parentType) === FLOOR;
}

function buildTree(locations, assetCountMap = {}) {
  const byId = new Map();
  const roots = [];

  locations.forEach((loc) => {
    const id = String(loc._id);
    byId.set(id, {
      ...loc,
      _id: id,
      children: [],
      directAssetCount: assetCountMap[id]?.count || 0,
      directAssetValue: assetCountMap[id]?.value || 0,
      totalAssetCount: 0,
      totalAssetValue: 0,
    });
  });

  byId.forEach((node) => {
    const parentId = node.parentId ? String(node.parentId) : null;
    if (parentId && byId.has(parentId)) {
      byId.get(parentId).children.push(node);
    } else if (!parentId && normalizeLocationType(node.type) === CAMPUS) {
      roots.push(node);
    }
  });

  const sortNodes = (nodes, parentType = null) => {
    nodes.sort((a, b) => {
      if (shouldSortChildrenByRoomNumber(parentType)) {
        const roomCmp = compareRoomNumbers(a, b);
        if (roomCmp !== 0) return roomCmp;
      }
      const orderA = a.sortOrder ?? 0;
      const orderB = b.sortOrder ?? 0;
      if (orderA !== orderB) return orderA - orderB;
      return String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' });
    });
    nodes.forEach((node) => {
      sortNodes(node.children, node.type);
      let totalCount = node.directAssetCount;
      let totalValue = node.directAssetValue;
      node.children.forEach((child) => {
        totalCount += child.totalAssetCount;
        totalValue += child.totalAssetValue;
      });
      node.totalAssetCount = totalCount;
      node.totalAssetValue = totalValue;
    });
  };

  sortNodes(roots);
  return roots;
}

function countByType(locations) {
  const counts = { campuses: 0, blocks: 0, floors: 0, rooms: 0 };
  locations.forEach((loc) => {
    const t = normalizeLocationType(loc.type);
    if (t === CAMPUS) counts.campuses += 1;
    else if (t === BLOCK) counts.blocks += 1;
    else if (t === FLOOR) counts.floors += 1;
    else if (t === ROOM) counts.rooms += 1;
  });
  return counts;
}

function buildPathSegments(location, byId) {
  const segments = [];
  let current = location;
  const seen = new Set();
  while (current) {
    const id = String(current._id);
    if (seen.has(id)) break;
    seen.add(id);
    segments.unshift({
      _id: id,
      name: current.name,
      type: current.type,
    });
    const parentId = current.parentId ? String(current.parentId) : null;
    current = parentId ? byId.get(parentId) : null;
  }
  return segments;
}

module.exports = {
  CAMPUS,
  BLOCK,
  FLOOR,
  ROOM,
  LEGACY_LEAF_TYPES,
  ROOM_TYPE_VALUES,
  normalizeLocationType,
  isLeafType,
  expectedParentType,
  childTypeForParent,
  validateHierarchy,
  getRoomSortKey,
  compareRoomNumbers,
  shouldSortChildrenByRoomNumber,
  buildTree,
  countByType,
  buildPathSegments,
};
