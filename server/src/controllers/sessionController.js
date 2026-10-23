const asyncHandler = require('../middleware/asyncHandler');
const { getRequestContext } = require('../tenancy/requestContext');
const { syncClass12Alumni } = require('../services/almniSyncService');
const schoolDate = require('../utils/schoolDate');

/**
 * Helper: resolve the AcademicSession model from request context.
 */
const getSessionModel = (req) => {
  if (req.models?.AcademicSession) return req.models.AcademicSession;
  const ctx = getRequestContext();
  return ctx?.models?.AcademicSession || null;
};

/** Current academic session label from today's school day (April to March, India time). */
const currentSessionLabel = () => schoolDate.sessionLabelFor(schoolDate.today());

/**
 * @route   GET /api/sessions
 * @desc    List all sessions for the tenant, auto-creating current if missing.
 * @access  Protected
 */
const getSessions = asyncHandler(async (req, res) => {
  const AcademicSession = getSessionModel(req);
  if (!AcademicSession) {
    return res.status(500).json({ success: false, error: 'AcademicSession model not available' });
  }

  // Auto-ensure the current session exists
  const label = currentSessionLabel();
  await AcademicSession.ensureSession(label, req.user?._id);
  await syncClass12Alumni(req, label);

  const sessions = await AcademicSession.find({ status: 'active' })
    .sort({ startYear: -1 })
    .lean();

  // Mark which one is "current" (calendar-derived)
  const result = sessions.map((s) => ({
    ...s,
    isCurrent: s.label === label,
  }));

  return res.status(200).json({
    success: true,
    data: result,
    meta: { currentLabel: label },
  });
});

/**
 * @route   GET /api/sessions/available
 * @desc    Return the generated list of possible sessions (no auth needed beyond tenant).
 * @access  Protected
 */
const getAvailableSessions = asyncHandler(async (req, res) => {
  const AcademicSession = getSessionModel(req);
  if (!AcademicSession) {
    return res.status(500).json({ success: false, error: 'AcademicSession model not available' });
  }

  const available = AcademicSession.generateAvailableSessions();

  // Merge with existing DB records to show which ones already have data
  const existing = await AcademicSession.find({}).lean();
  const existingMap = new Map(existing.map((s) => [s.label, s]));

  const merged = available.map((a) => {
    const db = existingMap.get(a.label);
    return {
      label: a.label,
      startYear: a.startYear,
      endYear: a.endYear,
      isCurrent: a.isCurrent,
      exists: Boolean(db),
      _id: db?._id || null,
      status: db?.status || null,
    };
  });

  return res.status(200).json({
    success: true,
    data: merged,
    meta: { currentLabel: currentSessionLabel() },
  });
});

/**
 * @route   POST /api/sessions
 * @desc    Create (or ensure) a session by label.
 * @access  Protected (admin)
 */
const createSession = asyncHandler(async (req, res) => {
  const AcademicSession = getSessionModel(req);
  if (!AcademicSession) {
    return res.status(500).json({ success: false, error: 'AcademicSession model not available' });
  }

  const { label } = req.body;
  if (!label || !/^\d{4}-\d{4}$/.test(label)) {
    return res.status(400).json({ success: false, error: 'Invalid session label (expected YYYY-YYYY)' });
  }

  // Anyone on staff may enter a session that already exists; creating a new one
  // is school setup and needs `core.school.write`.
  const existing = await AcademicSession.findOne({ label });
  if (existing) {
    return res.status(200).json({ success: true, message: `Session ${label} is ready`, data: existing });
  }
  if (!req.rbac?.has('core.school.write')) {
    return res.status(403).json({
      success: false,
      message: 'Only the school administrator can start a new academic session.',
      errorCode: 'permission_denied',
    });
  }

  const session = await AcademicSession.ensureSession(label, req.user?._id);
  await syncClass12Alumni(req, label);

  return res.status(201).json({
    success: true,
    message: `Session ${label} is ready`,
    data: session,
  });
});

/**
 * @route   POST /api/sessions/:label/carry-forward
 * @desc    Copy reusable data (teachers, rooms, subjects) from a source session to a target session.
 * @access  Protected (admin)
 */
const carryForward = asyncHandler(async (req, res) => {
  const targetLabel = req.params.label;
  const { sourceLabel } = req.body;

  if (!targetLabel || !sourceLabel) {
    return res.status(400).json({ success: false, error: 'Both target (param) and sourceLabel (body) are required' });
  }

  if (targetLabel === sourceLabel) {
    return res.status(400).json({ success: false, error: 'Source and target sessions must be different' });
  }

  const AcademicSession = getSessionModel(req);
  await AcademicSession.ensureSession(targetLabel, req.user?._id);

  const models = req.models;
  const copyableModels = ['Teacher', 'Room', 'Subject', 'CentreDetail'];
  const summary = {};

  for (const modelName of copyableModels) {
    const Model = models[modelName];
    if (!Model) continue;

    // Find source records
    const sourceRecords = await Model.find({ academicSession: sourceLabel }).lean();
    if (sourceRecords.length === 0) {
      summary[modelName] = { copied: 0, skipped: 0 };
      continue;
    }

    let copied = 0;
    let skipped = 0;

    for (const record of sourceRecords) {
      // Remove _id, timestamps, and set new session
      const { _id, createdAt, updatedAt, __v, ...data } = record;
      data.academicSession = targetLabel;

      // Check for duplicate by a reasonable unique key
      let exists = false;
      if (modelName === 'Teacher' && data.employeeId) {
        exists = await Model.findOne({ academicSession: targetLabel, employeeId: data.employeeId }).lean();
      } else if (modelName === 'Room' && data.roomNo) {
        exists = await Model.findOne({ academicSession: targetLabel, roomNo: data.roomNo }).lean();
      } else if (modelName === 'Subject' && data.code && data.class) {
        exists = await Model.findOne({ academicSession: targetLabel, code: data.code, class: data.class }).lean();
      } else if (modelName === 'CentreDetail') {
        exists = await Model.findOne({ academicSession: targetLabel }).lean();
      }

      if (exists) {
        skipped++;
      } else {
        try {
          await Model.create(data);
          copied++;
        } catch (err) {
          // Duplicate key or validation error — skip
          skipped++;
        }
      }
    }

    summary[modelName] = { copied, skipped };
  }

  return res.status(200).json({
    success: true,
    message: `Data carried forward from ${sourceLabel} to ${targetLabel}`,
    data: summary,
  });
});

module.exports = {
  getSessions,
  getAvailableSessions,
  createSession,
  carryForward,
};
