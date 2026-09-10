const pdfGenerator = require('../utils/pdfGenerator');
const seatingPlanBuilder = require('../utils/seatingPlanBuilder');
const Room = require('../models/Room');
const {
  listAsetsExamRoomCandidates,
  syncExamRoomsFromAsets,
} = require('../utils/asetsExamRoomSync');
const {
  calculateLayoutCapacity,
  normalizeSeatingLayout,
  DEFAULT_SEATING_LAYOUT,
} = require('../utils/roomSeatingLayout');

const DEFAULT_TEMPLATE_SETTINGS = Object.freeze({
  roomAllocationMode: 'auto',
  seatingPlanMode: 'different_per_day',
  functionaryDutyList: {
    pageSize: 'A4',
    orientation: 'landscape',
    columnWidths: {
      srNo: 50,
      roomNo: 70,
      roomName: 120,
      floor: 70,
      inv1School: 90,
      inv1Teacher: 130,
      inv1TeacherId: 100,
      inv1Signature: 130,
      inv2School: 90,
      inv2Teacher: 130,
      inv2TeacherId: 100,
      inv2Signature: 130,
    },
  },
  mainGate: {
    col1Width: 16,
    col2Width: 28,
    col3Width: 28,
    col4Width: 28,
    rowHeight: 22,
  },
  cbseCopy: {
    infoCol1Width: 20,
    infoCol2Width: 26,
    infoCol3Width: 26,
    infoCol4Width: 14,
    infoCol5Width: 14,
    col1Width: 23,
    col2Width: 10,
    col3Width: 23,
    col4Width: 10,
    col5Width: 23,
    col6Width: 11,
    rowHeight: 28,
    cellPaddingY: 6,
    cellPaddingX: 8,
    headerFontSize: 12,
    subHeaderFontSize: 11,
    bodyFontSize: 11,
  },
  roomFolderSlip: {
    infoCol1Width: 14.3,
    infoCol2Width: 19.05,
    infoCol3Width: 19.05,
    infoCol4Width: 14.3,
    infoCol5Width: 9.5,
    infoCol6Width: 9.5,
    infoCol7Width: 14.3,
    col1Width: 14.14,
    col2Width: 8.08,
    col3Width: 11.11,
    col4Width: 14.14,
    col5Width: 8.08,
    col6Width: 11.11,
    col7Width: 14.14,
    col8Width: 8.08,
    col9Width: 11.12,
    rowHeight: 24,
  },
  roomDoorSlip: {
    infoCol1Width: 16.67,
    infoCol2Width: 20.83,
    infoCol3Width: 20.83,
    infoCol4Width: 16.67,
    infoCol5Width: 12.5,
    infoCol6Width: 12.5,
    col1Width: 33.33,
    col2Width: 33.33,
    col3Width: 33.34,
    rowHeight: 30,
  },
});

const clampNumber = (value, min, max, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
};

const normalizePercentageWidths = (widths, fallbackWidths) => {
  const total = widths.reduce((sum, width) => sum + width, 0);
  if (total <= 0) return fallbackWidths;
  return widths.map((width) => Number(((width * 100) / total).toFixed(2)));
};

const normalizeCbseCopySettings = (input = {}) => {
  const source = input || {};
  const fallback = DEFAULT_TEMPLATE_SETTINGS.cbseCopy;
  const normalizedInfoWidths = normalizePercentageWidths(
    [
      clampNumber(source.infoCol1Width, 1, 90, fallback.infoCol1Width),
      clampNumber(source.infoCol2Width, 1, 90, fallback.infoCol2Width),
      clampNumber(source.infoCol3Width, 1, 90, fallback.infoCol3Width),
      clampNumber(source.infoCol4Width, 1, 90, fallback.infoCol4Width),
      clampNumber(source.infoCol5Width, 1, 90, fallback.infoCol5Width),
    ],
    [
      fallback.infoCol1Width,
      fallback.infoCol2Width,
      fallback.infoCol3Width,
      fallback.infoCol4Width,
      fallback.infoCol5Width,
    ]
  );

  const normalizedWidths = [
    clampNumber(source.col1Width, 1, 90, fallback.col1Width),
    clampNumber(source.col2Width, 1, 90, fallback.col2Width),
    clampNumber(source.col3Width, 1, 90, fallback.col3Width),
    clampNumber(source.col4Width, 1, 90, fallback.col4Width),
    clampNumber(source.col5Width, 1, 90, fallback.col5Width),
    clampNumber(source.col6Width, 1, 90, fallback.col6Width),
  ];
  const safeWidths = normalizePercentageWidths(
    normalizedWidths,
    [
      fallback.col1Width,
      fallback.col2Width,
      fallback.col3Width,
      fallback.col4Width,
      fallback.col5Width,
      fallback.col6Width,
    ]
  );

  return {
    infoCol1Width: normalizedInfoWidths[0],
    infoCol2Width: normalizedInfoWidths[1],
    infoCol3Width: normalizedInfoWidths[2],
    infoCol4Width: normalizedInfoWidths[3],
    infoCol5Width: normalizedInfoWidths[4],
    col1Width: safeWidths[0],
    col2Width: safeWidths[1],
    col3Width: safeWidths[2],
    col4Width: safeWidths[3],
    col5Width: safeWidths[4],
    col6Width: safeWidths[5],
    rowHeight: clampNumber(source.rowHeight, 18, 60, fallback.rowHeight),
    cellPaddingY: clampNumber(source.cellPaddingY, 2, 16, fallback.cellPaddingY),
    cellPaddingX: clampNumber(source.cellPaddingX, 2, 20, fallback.cellPaddingX),
    headerFontSize: clampNumber(source.headerFontSize, 8, 20, fallback.headerFontSize),
    subHeaderFontSize: clampNumber(source.subHeaderFontSize, 8, 20, fallback.subHeaderFontSize),
    bodyFontSize: clampNumber(source.bodyFontSize, 8, 20, fallback.bodyFontSize),
  };
};

const normalizeMainGateSettings = (input = {}) => {
  const source = input || {};
  const fallback = DEFAULT_TEMPLATE_SETTINGS.mainGate;
  const normalizedWidths = normalizePercentageWidths(
    [
      clampNumber(source.col1Width, 1, 90, fallback.col1Width),
      clampNumber(source.col2Width, 1, 90, fallback.col2Width),
      clampNumber(source.col3Width, 1, 90, fallback.col3Width),
      clampNumber(source.col4Width, 1, 90, fallback.col4Width),
    ],
    [fallback.col1Width, fallback.col2Width, fallback.col3Width, fallback.col4Width]
  );

  return {
    col1Width: normalizedWidths[0],
    col2Width: normalizedWidths[1],
    col3Width: normalizedWidths[2],
    col4Width: normalizedWidths[3],
    rowHeight: clampNumber(source.rowHeight, 16, 50, fallback.rowHeight),
  };
};

const normalizeRoomFolderSlipSettings = (input = {}) => {
  const source = input || {};
  const fallback = DEFAULT_TEMPLATE_SETTINGS.roomFolderSlip;
  const normalizedInfoWidths = normalizePercentageWidths(
    [
      clampNumber(source.infoCol1Width, 1, 90, fallback.infoCol1Width),
      clampNumber(source.infoCol2Width, 1, 90, fallback.infoCol2Width),
      clampNumber(source.infoCol3Width, 1, 90, fallback.infoCol3Width),
      clampNumber(source.infoCol4Width, 1, 90, fallback.infoCol4Width),
      clampNumber(source.infoCol5Width, 1, 90, fallback.infoCol5Width),
      clampNumber(source.infoCol6Width, 1, 90, fallback.infoCol6Width),
      clampNumber(source.infoCol7Width, 1, 90, fallback.infoCol7Width),
    ],
    [
      fallback.infoCol1Width,
      fallback.infoCol2Width,
      fallback.infoCol3Width,
      fallback.infoCol4Width,
      fallback.infoCol5Width,
      fallback.infoCol6Width,
      fallback.infoCol7Width,
    ]
  );

  const normalizedWidths = normalizePercentageWidths(
    [
      clampNumber(source.col1Width, 1, 90, fallback.col1Width),
      clampNumber(source.col2Width, 1, 90, fallback.col2Width),
      clampNumber(source.col3Width, 1, 90, fallback.col3Width),
      clampNumber(source.col4Width, 1, 90, fallback.col4Width),
      clampNumber(source.col5Width, 1, 90, fallback.col5Width),
      clampNumber(source.col6Width, 1, 90, fallback.col6Width),
      clampNumber(source.col7Width, 1, 90, fallback.col7Width),
      clampNumber(source.col8Width, 1, 90, fallback.col8Width),
      clampNumber(source.col9Width, 1, 90, fallback.col9Width),
    ],
    [
      fallback.col1Width,
      fallback.col2Width,
      fallback.col3Width,
      fallback.col4Width,
      fallback.col5Width,
      fallback.col6Width,
      fallback.col7Width,
      fallback.col8Width,
      fallback.col9Width,
    ]
  );

  return {
    infoCol1Width: normalizedInfoWidths[0],
    infoCol2Width: normalizedInfoWidths[1],
    infoCol3Width: normalizedInfoWidths[2],
    infoCol4Width: normalizedInfoWidths[3],
    infoCol5Width: normalizedInfoWidths[4],
    infoCol6Width: normalizedInfoWidths[5],
    infoCol7Width: normalizedInfoWidths[6],
    col1Width: normalizedWidths[0],
    col2Width: normalizedWidths[1],
    col3Width: normalizedWidths[2],
    col4Width: normalizedWidths[3],
    col5Width: normalizedWidths[4],
    col6Width: normalizedWidths[5],
    col7Width: normalizedWidths[6],
    col8Width: normalizedWidths[7],
    col9Width: normalizedWidths[8],
    rowHeight: clampNumber(source.rowHeight, 18, 60, fallback.rowHeight),
  };
};

const normalizeRoomDoorSlipSettings = (input = {}) => {
  const source = input || {};
  const fallback = DEFAULT_TEMPLATE_SETTINGS.roomDoorSlip;
  const normalizedInfoWidths = normalizePercentageWidths(
    [
      clampNumber(source.infoCol1Width, 1, 90, fallback.infoCol1Width),
      clampNumber(source.infoCol2Width, 1, 90, fallback.infoCol2Width),
      clampNumber(source.infoCol3Width, 1, 90, fallback.infoCol3Width),
      clampNumber(source.infoCol4Width, 1, 90, fallback.infoCol4Width),
      clampNumber(source.infoCol5Width, 1, 90, fallback.infoCol5Width),
      clampNumber(source.infoCol6Width, 1, 90, fallback.infoCol6Width),
    ],
    [
      fallback.infoCol1Width,
      fallback.infoCol2Width,
      fallback.infoCol3Width,
      fallback.infoCol4Width,
      fallback.infoCol5Width,
      fallback.infoCol6Width,
    ]
  );
  const normalizedWidths = normalizePercentageWidths(
    [
      clampNumber(source.col1Width, 1, 98, fallback.col1Width),
      clampNumber(source.col2Width, 1, 98, fallback.col2Width),
      clampNumber(source.col3Width, 1, 98, fallback.col3Width),
    ],
    [fallback.col1Width, fallback.col2Width, fallback.col3Width]
  );

  return {
    infoCol1Width: normalizedInfoWidths[0],
    infoCol2Width: normalizedInfoWidths[1],
    infoCol3Width: normalizedInfoWidths[2],
    infoCol4Width: normalizedInfoWidths[3],
    infoCol5Width: normalizedInfoWidths[4],
    infoCol6Width: normalizedInfoWidths[5],
    col1Width: normalizedWidths[0],
    col2Width: normalizedWidths[1],
    col3Width: normalizedWidths[2],
    rowHeight: clampNumber(source.rowHeight, 18, 80, fallback.rowHeight),
  };
};

const normalizeFunctionaryDutyListSettings = (input = {}) => {
  const source = input || {};
  const fallback = DEFAULT_TEMPLATE_SETTINGS.functionaryDutyList;
  const orientation = String(source.orientation || fallback.orientation).toLowerCase() === 'portrait'
    ? 'portrait'
    : 'landscape';
  const pageSize = String(source.pageSize || fallback.pageSize).toUpperCase() === 'A4'
    ? 'A4'
    : fallback.pageSize;

  return {
    pageSize,
    orientation,
    columnWidths: {
      srNo: clampNumber(source?.columnWidths?.srNo, 40, 220, fallback.columnWidths.srNo),
      roomNo: clampNumber(source?.columnWidths?.roomNo, 50, 220, fallback.columnWidths.roomNo),
      roomName: clampNumber(source?.columnWidths?.roomName, 80, 300, fallback.columnWidths.roomName),
      floor: clampNumber(source?.columnWidths?.floor, 50, 220, fallback.columnWidths.floor),
      inv1School: clampNumber(source?.columnWidths?.inv1School, 70, 260, fallback.columnWidths.inv1School),
      inv1Teacher: clampNumber(source?.columnWidths?.inv1Teacher, 80, 300, fallback.columnWidths.inv1Teacher),
      inv1TeacherId: clampNumber(source?.columnWidths?.inv1TeacherId, 80, 260, fallback.columnWidths.inv1TeacherId),
      inv1Signature: clampNumber(source?.columnWidths?.inv1Signature, 90, 320, fallback.columnWidths.inv1Signature),
      inv2School: clampNumber(source?.columnWidths?.inv2School, 70, 260, fallback.columnWidths.inv2School),
      inv2Teacher: clampNumber(source?.columnWidths?.inv2Teacher, 80, 300, fallback.columnWidths.inv2Teacher),
      inv2TeacherId: clampNumber(source?.columnWidths?.inv2TeacherId, 80, 260, fallback.columnWidths.inv2TeacherId),
      inv2Signature: clampNumber(source?.columnWidths?.inv2Signature, 90, 320, fallback.columnWidths.inv2Signature),
    },
  };
};

const normalizeTemplateSettings = (input = {}) => ({
  roomAllocationMode: String(input?.roomAllocationMode || DEFAULT_TEMPLATE_SETTINGS.roomAllocationMode).toLowerCase() === 'manual'
    ? 'manual'
    : 'auto',
  seatingPlanMode: String(input?.seatingPlanMode || DEFAULT_TEMPLATE_SETTINGS.seatingPlanMode).toLowerCase() === 'same_across_days'
    ? 'same_across_days'
    : 'different_per_day',
  functionaryDutyList: normalizeFunctionaryDutyListSettings(input?.functionaryDutyList),
  mainGate: normalizeMainGateSettings(input?.mainGate),
  cbseCopy: normalizeCbseCopySettings(input?.cbseCopy),
  roomFolderSlip: normalizeRoomFolderSlipSettings(input?.roomFolderSlip),
  roomDoorSlip: normalizeRoomDoorSlipSettings(input?.roomDoorSlip),
});

const getTemplateSettingsDoc = async (req) => {
  const SeatingPlanTemplateSetting = req.models?.SeatingPlanTemplateSetting;
  if (!SeatingPlanTemplateSetting) return null;
  return SeatingPlanTemplateSetting.findOne({}).sort({ updatedAt: -1 });
};

const getResolvedTemplateSettings = async (req) => {
  const doc = await getTemplateSettingsDoc(req);
  return normalizeTemplateSettings(doc ? doc.toObject() : null);
};

const parseRoomNoForSort = (roomNo) => {
  const value = String(roomNo ?? '').trim();
  if (!value) return Number.POSITIVE_INFINITY;

  const pureNumeric = value.match(/^\d+$/);
  if (pureNumeric) return parseInt(pureNumeric[0], 10);

  const leadingNumeric = value.match(/^(\d+)/);
  if (leadingNumeric) return parseInt(leadingNumeric[1], 10);

  return Number.POSITIVE_INFINITY;
};

const compareRoomNo = (a, b) => {
  const aNo = parseRoomNoForSort(a?.roomNo);
  const bNo = parseRoomNoForSort(b?.roomNo);

  if (aNo !== bNo) return aNo - bNo;
  return String(a?.roomNo ?? '').localeCompare(String(b?.roomNo ?? ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
};

const getLatestCentreDetails = async (req) => {
  const CentreDetail = req.models?.CentreDetail;
  if (!CentreDetail) return null;
  return CentreDetail.findOne({}).sort({ updatedAt: -1 }).lean();
};

// Get seating plan template settings
exports.getTemplateSettings = async (req, res) => {
  try {
    const settingsDoc = await getTemplateSettingsDoc(req);
    const data = normalizeTemplateSettings(settingsDoc ? settingsDoc.toObject() : null);
    res.json({
      success: true,
      data,
      meta: {
        hasSavedSettings: Boolean(settingsDoc),
        functionaryDutyListFormat: data.functionaryDutyList,
      },
    });
  } catch (error) {
    console.error('Get Template Settings Error:', error);
    res.status(500).json({ message: 'Failed to fetch template settings', error: error.message });
  }
};

// Save/update seating plan template settings
exports.upsertTemplateSettings = async (req, res) => {
  try {
    const SeatingPlanTemplateSetting = req.models?.SeatingPlanTemplateSetting;
    if (!SeatingPlanTemplateSetting) {
      return res.status(500).json({ message: 'Template settings model is unavailable' });
    }

    const payload = normalizeTemplateSettings(req.body || {});
    const existing = await SeatingPlanTemplateSetting.findOne({}).sort({ updatedAt: -1 });

    if (existing) {
      existing.roomAllocationMode = typeof req.body?.roomAllocationMode === 'string'
        ? payload.roomAllocationMode
        : (existing.roomAllocationMode || DEFAULT_TEMPLATE_SETTINGS.roomAllocationMode);
      if (typeof req.body?.seatingPlanMode === 'string') {
        existing.seatingPlanMode = payload.seatingPlanMode;
      }
      existing.mainGate = payload.mainGate;
      existing.cbseCopy = payload.cbseCopy;
      existing.roomFolderSlip = payload.roomFolderSlip;
      existing.roomDoorSlip = payload.roomDoorSlip;
      existing.functionaryDutyList = payload.functionaryDutyList;
      await existing.save();
      return res.json({
        success: true,
        data: normalizeTemplateSettings(existing.toObject()),
        meta: {
          hasSavedSettings: true,
        },
      });
    }

    const created = await SeatingPlanTemplateSetting.create(payload);
    return res.status(201).json({
      success: true,
      data: normalizeTemplateSettings(created.toObject()),
      meta: {
        hasSavedSettings: true,
      },
    });
  } catch (error) {
    console.error('Upsert Template Settings Error:', error);
    res.status(500).json({ message: 'Failed to save template settings', error: error.message });
  }
};

exports.getRoomAllocationMode = async (req, res) => {
  try {
    const settings = await getResolvedTemplateSettings(req);
    res.json({
      success: true,
      data: {
        mode: settings.roomAllocationMode || 'auto',
      },
    });
  } catch (error) {
    console.error('Get Room Allocation Mode Error:', error);
    res.status(500).json({ message: 'Failed to fetch room allocation mode', error: error.message });
  }
};

exports.getSeatingPlanMode = async (req, res) => {
  try {
    const settings = await getResolvedTemplateSettings(req);
    res.json({
      success: true,
      data: {
        mode: settings.seatingPlanMode || 'different_per_day',
      },
    });
  } catch (error) {
    console.error('Get Seating Plan Mode Error:', error);
    res.status(500).json({ message: 'Failed to fetch seating plan mode', error: error.message });
  }
};

exports.updateSeatingPlanMode = async (req, res) => {
  try {
    const SeatingPlanTemplateSetting = req.models?.SeatingPlanTemplateSetting;
    if (!SeatingPlanTemplateSetting) {
      return res.status(500).json({ message: 'Template settings model is unavailable' });
    }

    const mode = String(req.body?.mode || '').toLowerCase() === 'same_across_days'
      ? 'same_across_days'
      : 'different_per_day';
    const existing = await SeatingPlanTemplateSetting.findOne({}).sort({ updatedAt: -1 });

    if (existing) {
      existing.seatingPlanMode = mode;
      await existing.save();
    } else {
      await SeatingPlanTemplateSetting.create({
        ...normalizeTemplateSettings({}),
        seatingPlanMode: mode,
      });
    }

    return res.json({
      success: true,
      data: { mode },
    });
  } catch (error) {
    console.error('Update Seating Plan Mode Error:', error);
    res.status(500).json({ message: 'Failed to update seating plan mode', error: error.message });
  }
};

exports.updateRoomAllocationMode = async (req, res) => {
  try {
    const SeatingPlanTemplateSetting = req.models?.SeatingPlanTemplateSetting;
    if (!SeatingPlanTemplateSetting) {
      return res.status(500).json({ message: 'Template settings model is unavailable' });
    }

    const mode = String(req.body?.mode || '').toLowerCase() === 'manual' ? 'manual' : 'auto';
    const existing = await SeatingPlanTemplateSetting.findOne({}).sort({ updatedAt: -1 });

    if (existing) {
      existing.roomAllocationMode = mode;
      await existing.save();
    } else {
      await SeatingPlanTemplateSetting.create({
        ...normalizeTemplateSettings({}),
        roomAllocationMode: mode,
      });
    }

    return res.json({
      success: true,
      data: { mode },
    });
  } catch (error) {
    console.error('Update Room Allocation Mode Error:', error);
    res.status(500).json({ message: 'Failed to update room allocation mode', error: error.message });
  }
};

// List ASETS room locations with exam-room linkage status
exports.getAsetsExamRoomCandidates = async (req, res) => {
  try {
    const candidates = await listAsetsExamRoomCandidates(req);
    res.json(candidates);
  } catch (error) {
    console.error('Get ASETS Exam Room Candidates Error:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || 'Failed to load ASETS rooms',
      error: error.message,
    });
  }
};

// Sync exam Room records from selected ASETS locations
exports.syncExamRoomsFromAsets = async (req, res) => {
  try {
    const result = await syncExamRoomsFromAsets(req, req.body?.locationIds);
    res.json({
      message: 'Exam rooms updated from ASETS.',
      data: result,
    });
  } catch (error) {
    console.error('Sync Exam Rooms From ASETS Error:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || 'Failed to sync exam rooms from ASETS',
      error: error.message,
    });
  }
};

// Get all rooms
exports.getRooms = async (req, res) => {
  try {
    const rooms = await Room.find({ isActive: true }).lean();
    rooms.sort(compareRoomNo);
    res.json(rooms);
  } catch (error) {
    console.error('Get Rooms Error:', error);
    res.status(500).json({ message: 'Failed to fetch rooms', error: error.message });
  }
};

// Create room
exports.createRoom = async (req, res) => {
  try {
    const roomNo = String(req.body.roomNo || '').trim();
    if (!roomNo) {
      return res.status(400).json({ message: 'Room number is required' });
    }

    // Check for duplicate roomNo among active rooms
    const existing = await Room.findOne({ roomNo, isActive: true });
    if (existing) {
      return res.status(400).json({ message: `Room number '${roomNo}' already exists` });
    }

    const payload = { ...req.body };
    if (payload.seatingLayout) {
      payload.seatingLayout = normalizeSeatingLayout(payload.seatingLayout);
      payload.capacity = calculateLayoutCapacity(payload.seatingLayout);
    }

    const room = new Room(payload);
    await room.save();
    res.status(201).json(room);
  } catch (error) {
    console.error('Create Room Error:', error);
    res.status(500).json({ message: 'Failed to create room', error: error.message });
  }
};

// Update room
exports.updateRoom = async (req, res) => {
  try {
    // Check for duplicate roomNo if roomNo is being updated
    if (req.body.roomNo !== undefined) {
      const roomNo = String(req.body.roomNo || '').trim();
      if (!roomNo) {
        return res.status(400).json({ message: 'Room number is required' });
      }

      const existing = await Room.findOne({
        roomNo,
        isActive: true,
        _id: { $ne: req.params.id },
      });
      if (existing) {
        return res.status(400).json({ message: `Room number '${roomNo}' already exists` });
      }
    }

    const payload = { ...req.body };
    if (payload.seatingLayout !== undefined) {
      payload.seatingLayout = normalizeSeatingLayout(payload.seatingLayout);
      payload.capacity = calculateLayoutCapacity(payload.seatingLayout);
    }

    const room = await Room.findByIdAndUpdate(
      req.params.id,
      payload,
      { new: true, runValidators: true }
    );

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    res.json(room);
  } catch (error) {
    console.error('Update Room Error:', error);
    res.status(500).json({ message: 'Failed to update room', error: error.message });
  }
};

// Delete room
exports.deleteRoom = async (req, res) => {
  try {
    const room = await Room.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    res.json({ message: 'Room deleted successfully' });
  } catch (error) {
    console.error('Delete Room Error:', error);
    res.status(500).json({ message: 'Failed to delete room', error: error.message });
  }
};

// Helper function to send PDF buffer properly
const sendPDFResponse = (res, pdfBuffer, filename) => {
  const buffer = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  res.setHeader('Content-Length', buffer.length);
  res.end(buffer);
};

const sendGenerationError = (res, error, fallbackLabel) => {
  const message = String(error?.message || '').trim();
  const userFacing =
    message.includes('No rooms are allocated for this exam date in Manual mode')
    || message.includes('No rooms available for allocation')
    || message.includes('Maximum number of rooms required at the centre')
    || message.includes('CBSE room-repeat rule could not be satisfied');

  const status = userFacing ? 400 : 500;
  return res.status(status).json({
    message: message || fallbackLabel,
    error: message || fallbackLabel,
  });
};

// Generate Main Gate PDF
exports.generateMainGate = async (req, res) => {
  try {
    const { datesheetId } = req.params;
    const centreDetails = await getLatestCentreDetails(req);
    const templateSettings = await getResolvedTemplateSettings(req);

    const seatingData = await seatingPlanBuilder.buildSeatingData(datesheetId, {
      centreDetails,
      roomAllocationMode: templateSettings.roomAllocationMode,
      seatingPlanMode: templateSettings.seatingPlanMode,
    });
    const templateData = seatingPlanBuilder.buildMainGateData(seatingData);
    templateData.templateSettings = templateSettings.mainGate;
    const pdfBuffer = await pdfGenerator.generateMainGate(templateData);

    sendPDFResponse(res, pdfBuffer, 'main-gate.pdf');
  } catch (error) {
    console.error('Generate Main Gate PDF Error:', error);
    sendGenerationError(res, error, 'Failed to generate Main Gate PDF');
  }
};

// Generate Invigilator Slip PDF
exports.generateRoomFolderSlip = async (req, res) => {
  try {
    const { datesheetId } = req.params;
    const centreDetails = await getLatestCentreDetails(req);
    const templateSettings = await getResolvedTemplateSettings(req);

    const seatingData = await seatingPlanBuilder.buildSeatingData(datesheetId, {
      centreDetails,
      roomAllocationMode: templateSettings.roomAllocationMode,
      seatingPlanMode: templateSettings.seatingPlanMode,
    });
    const templateData = seatingPlanBuilder.buildRoomFolderSlipData(seatingData);
    templateData.templateSettings = templateSettings.roomFolderSlip;
    const pdfBuffer = await pdfGenerator.generateRoomFolderSlip(templateData);

    sendPDFResponse(res, pdfBuffer, 'invigilator-slip.pdf');
  } catch (error) {
    console.error('Generate Invigilator Slip PDF Error:', error);
    sendGenerationError(res, error, 'Failed to generate Invigilator Slip PDF');
  }
};

// Generate Room Door Slip PDF
exports.generateRoomDoorSlip = async (req, res) => {
  try {
    const { datesheetId } = req.params;
    const centreDetails = await getLatestCentreDetails(req);
    const templateSettings = await getResolvedTemplateSettings(req);

    const seatingData = await seatingPlanBuilder.buildSeatingData(datesheetId, {
      centreDetails,
      roomAllocationMode: templateSettings.roomAllocationMode,
      seatingPlanMode: templateSettings.seatingPlanMode,
    });
    const templateData = seatingPlanBuilder.buildRoomDoorSlipData(seatingData);
    templateData.templateSettings = templateSettings.roomDoorSlip;
    const pdfBuffer = await pdfGenerator.generateRoomDoorSlip(templateData);

    sendPDFResponse(res, pdfBuffer, 'room-door-slip.pdf');
  } catch (error) {
    console.error('Generate Room Door Slip PDF Error:', error);
    sendGenerationError(res, error, 'Failed to generate Room Door Slip PDF');
  }
};

// Generate CBSE Format PDF
exports.generateCBSECopy = async (req, res) => {
  try {
    const { datesheetId } = req.params;
    const centreDetails = await getLatestCentreDetails(req);
    const templateSettings = await getResolvedTemplateSettings(req);

    const seatingData = await seatingPlanBuilder.buildSeatingData(datesheetId, {
      centreDetails,
      roomAllocationMode: templateSettings.roomAllocationMode,
      seatingPlanMode: templateSettings.seatingPlanMode,
    });
    const templateData = seatingPlanBuilder.buildCBSECopyData(seatingData);
    templateData.templateSettings = templateSettings.cbseCopy;
    const pdfBuffer = await pdfGenerator.generateCBSECopy(templateData);

    sendPDFResponse(res, pdfBuffer, 'cbse-format.pdf');
  } catch (error) {
    console.error('Generate CBSE Format PDF Error:', error);
    sendGenerationError(res, error, 'Failed to generate CBSE Format PDF');
  }
};
