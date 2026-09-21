const Room = require('../models/Room');
const { normalizeLocationType, compareRoomNumbers } = require('../modules/asets/locationHierarchy');
const {
  calculateLayoutCapacity,
  DEFAULT_SEATING_LAYOUT,
} = require('./roomSeatingLayout');

function formatExamFloorLabel(floorLocation) {
  if (!floorLocation) return 'First Floor';
  const name = String(floorLocation.name || floorLocation.floorNumber || '').trim();
  if (!name) return 'First Floor';
  if (/floor/i.test(name)) return name;
  const lower = name.toLowerCase();
  if (lower === 'ground') return 'Ground Floor';
  if (lower === 'first') return 'First Floor';
  if (lower === 'second') return 'Second Floor';
  if (lower === 'third') return 'Third Floor';
  return `${name} Floor`;
}

function findAncestorFloor(location, byId) {
  let current = location;
  let guard = 0;
  while (current && guard < 12) {
    if (normalizeLocationType(current.type) === 'Floor') return current;
    const parentId = current.parentId ? String(current.parentId) : null;
    current = parentId ? byId.get(parentId) : null;
    guard += 1;
  }
  return null;
}

function isExamCandidateLocation(location) {
  return normalizeLocationType(location?.type) === 'Room';
}

function mapLocationToRoomFields(location, floorLocation) {
  const roomNo = String(location.roomNumber || location.code || '').trim() || String(location.name || '').trim();
  const roomName = String(location.name || '').trim();
  const classSection = [location.className, location.section].filter(Boolean).join(' - ');
  const composedName = classSection && roomName ? `${roomName}` : roomName;

  return {
    roomNo,
    roomName: composedName || roomNo,
    floor: formatExamFloorLabel(floorLocation),
    capacity: Number(location.capacityHint) > 0 ? Number(location.capacityHint) : 24,
    assetLocationId: location._id,
  };
}

async function listAsetsExamRoomCandidates(req) {
  const Location = req.models?.AssetLocation;
  if (!Location) {
    return [];
  }

  const [locations, examRooms] = await Promise.all([
    Location.find({ isActive: { $ne: false }, isArchived: { $ne: true } }).lean(),
    Room.find({ assetLocationId: { $ne: null } }).lean(),
  ]);

  const byId = new Map(locations.map((row) => [String(row._id), row]));
  const examRoomByLocationId = new Map(
    examRooms
      .filter((row) => row.assetLocationId)
      .map((row) => [String(row.assetLocationId), row])
  );

  const candidates = locations
    .filter(isExamCandidateLocation)
    .map((location) => {
      const floorLocation = findAncestorFloor(location, byId);
      const linkedRoom = examRoomByLocationId.get(String(location._id));
      const classSection = [location.className, location.section].filter(Boolean).join(' - ');
      return {
        locationId: String(location._id),
        roomNumber: String(location.roomNumber || location.code || '').trim(),
        name: String(location.name || '').trim(),
        className: location.className || '',
        section: location.section || '',
        classSection,
        floor: formatExamFloorLabel(floorLocation),
        floorName: floorLocation?.name || '',
        blockName: (() => {
          const floor = floorLocation;
          if (!floor?.parentId) return '';
          const block = byId.get(String(floor.parentId));
          return block?.name || '';
        })(),
        path: location.path || '',
        capacity: Number(location.capacityHint) > 0 ? Number(location.capacityHint) : 24,
        useForExams: linkedRoom?.isActive === true,
        examRoomId: linkedRoom?._id ? String(linkedRoom._id) : null,
      };
    })
    .sort(compareRoomNumbers);

  return candidates;
}

async function deactivateLegacyRoomConflicts(roomNo, keepRoomId = null) {
  const normalizedRoomNo = String(roomNo || '').trim();
  if (!normalizedRoomNo) return 0;

  const legacyConflicts = await Room.find({
    roomNo: normalizedRoomNo,
    isActive: true,
    _id: keepRoomId ? { $ne: keepRoomId } : undefined,
    $or: [{ assetLocationId: null }, { assetLocationId: { $exists: false } }],
  }).select('_id');

  if (!legacyConflicts.length) return 0;

  await Room.updateMany(
    { _id: { $in: legacyConflicts.map((row) => row._id) } },
    { isActive: false },
  );

  return legacyConflicts.length;
}

async function findActiveAsetsRoomConflict(roomNo, locationId, keepRoomId = null) {
  const normalizedRoomNo = String(roomNo || '').trim();
  const normalizedLocationId = String(locationId || '').trim();
  if (!normalizedRoomNo || !normalizedLocationId) return null;

  const conflicts = await Room.find({
    roomNo: normalizedRoomNo,
    isActive: true,
    assetLocationId: { $exists: true, $ne: null },
    ...(keepRoomId ? { _id: { $ne: keepRoomId } } : {}),
  }).select('_id assetLocationId roomName').lean();

  return conflicts.find((row) => String(row.assetLocationId) !== normalizedLocationId) || null;
}

async function syncExamRoomsFromAsets(req, locationIds = []) {
  const Location = req.models?.AssetLocation;
  if (!Location) {
    const error = new Error('ASETS locations are not available for this tenant. Enable the ASETS module first.');
    error.statusCode = 400;
    throw error;
  }

  const selectedIds = new Set(
    (Array.isArray(locationIds) ? locationIds : [])
      .map((id) => String(id).trim())
      .filter(Boolean)
  );

  const candidates = await listAsetsExamRoomCandidates(req);
  const candidateMap = new Map(candidates.map((row) => [row.locationId, row]));
  const locations = await Location.find({
    _id: { $in: candidates.map((row) => row.locationId) },
    isActive: { $ne: false },
    isArchived: { $ne: true },
  }).lean();
  const byId = new Map(locations.map((row) => [String(row._id), row]));

  let activated = 0;
  let deactivated = 0;
  let created = 0;

  for (const candidate of candidates) {
    const location = byId.get(candidate.locationId);
    if (!location) continue;

    const shouldUse = selectedIds.has(candidate.locationId);
    const floorLocation = findAncestorFloor(location, byId);
    const mapped = mapLocationToRoomFields(location, floorLocation);

    if (shouldUse) {
      const existingRoom = candidate.examRoomId
        ? await Room.findById(candidate.examRoomId)
        : await Room.findOne({ assetLocationId: location._id });

      if (existingRoom) {
        await deactivateLegacyRoomConflicts(mapped.roomNo, existingRoom._id);

        const asetsConflict = await findActiveAsetsRoomConflict(
          mapped.roomNo,
          candidate.locationId,
          existingRoom._id,
        );
        if (asetsConflict) {
          const error = new Error(
            `Room number "${mapped.roomNo}" is already used by another ASETS exam room (${asetsConflict.roomName || 'unnamed'}). Use unique room numbers in ASETS Locations.`,
          );
          error.statusCode = 400;
          throw error;
        }

        await Room.findByIdAndUpdate(existingRoom._id, {
          ...mapped,
          isActive: true,
          assetLocationId: location._id,
        });
        await Location.findByIdAndUpdate(location._id, { roomRef: existingRoom._id });
        activated += 1;
      } else {
        await deactivateLegacyRoomConflicts(mapped.roomNo);

        const asetsConflict = await findActiveAsetsRoomConflict(mapped.roomNo, candidate.locationId);
        if (asetsConflict) {
          const error = new Error(
            `Room number "${mapped.roomNo}" is already used by another ASETS exam room (${asetsConflict.roomName || 'unnamed'}). Use unique room numbers in ASETS Locations.`,
          );
          error.statusCode = 400;
          throw error;
        }

        const room = await Room.create({
          ...mapped,
          isActive: true,
          allocatedExamDates: [],
          seatingLayout: DEFAULT_SEATING_LAYOUT,
          capacity: calculateLayoutCapacity(DEFAULT_SEATING_LAYOUT),
        });
        await Location.findByIdAndUpdate(location._id, { roomRef: room._id });
        created += 1;
      }
    } else if (candidate.examRoomId) {
      await Room.findByIdAndUpdate(candidate.examRoomId, { isActive: false });
      deactivated += 1;
    }
  }

  const invalidIds = [...selectedIds].filter((id) => !candidateMap.has(id));
  if (invalidIds.length) {
    const error = new Error('One or more selected locations are not valid ASETS rooms.');
    error.statusCode = 400;
    throw error;
  }

  return {
    activated,
    created,
    deactivated,
    totalSelected: selectedIds.size,
    totalCandidates: candidates.length,
  };
}

module.exports = {
  listAsetsExamRoomCandidates,
  syncExamRoomsFromAsets,
  formatExamFloorLabel,
};
