const asyncHandler = require('../middleware/asyncHandler');
const ExamDefinition = require('../models/ExamDefinition');

const normalizeCode = (value) => String(value || '').trim().toUpperCase();
const normalizeName = (value) => String(value || '').trim();
const normalizeDuration = (value) => String(value || '').trim();

const listExamDefinitions = asyncHandler(async (req, res) => {
  const ExamDefinitionModel = req.models?.ExamDefinition || ExamDefinition;
  const rows = await ExamDefinitionModel.find({ isActive: true })
    .select('_id name code displayOrder duration maximumMarks subjectKeys resultsPublished resultsPublishedAt createdAt updatedAt')
    .sort({ displayOrder: 1, createdAt: 1 })
    .lean();

  res.status(200).json({
    success: true,
    data: rows,
  });
});

const createExamDefinition = asyncHandler(async (req, res) => {
  const ExamDefinitionModel = req.models?.ExamDefinition || ExamDefinition;
  const name = normalizeName(req.body?.name);
  const code = normalizeCode(req.body?.code);
  const displayOrder = Number.isFinite(Number(req.body?.displayOrder))
    ? Number(req.body.displayOrder)
    : 0;
  const duration = normalizeDuration(req.body?.duration);
  const maximumMarks = Number.isFinite(Number(req.body?.maximumMarks))
    ? Number(req.body.maximumMarks)
    : 0;

  if (!name || !code) {
    return res.status(400).json({
      success: false,
      message: 'Exam name and code are required.',
    });
  }

  const existing = await ExamDefinitionModel.findOne({
    isActive: true,
    name: new RegExp(`^${name}$`, 'i'),
  }).lean();
  const existingByCode = existing
    ? existing
    : await ExamDefinitionModel.findOne({
      isActive: true,
      code: new RegExp(`^${code}$`, 'i'),
    }).lean();

  if (existingByCode) {
    return res.status(409).json({
      success: false,
      message: 'An exam with the same name or code already exists.',
    });
  }

  const created = await ExamDefinitionModel.create({
    name,
    code,
    duration,
    maximumMarks: maximumMarks >= 0 ? maximumMarks : 0,
    displayOrder,
    ...(req.academicSession ? { academicSession: req.academicSession } : {}),
  });

  res.status(201).json({
    success: true,
    message: 'Exam created successfully.',
    data: created,
  });
});

const updateExamDefinition = asyncHandler(async (req, res) => {
  const ExamDefinitionModel = req.models?.ExamDefinition || ExamDefinition;
  const updates = {};

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'name')) {
    updates.name = normalizeName(req.body.name);
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'code')) {
    updates.code = normalizeCode(req.body.code);
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'displayOrder')) {
    const parsed = Number(req.body.displayOrder);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return res.status(400).json({
        success: false,
        message: 'Display order must be a non-negative number.',
      });
    }
    updates.displayOrder = parsed;
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'duration')) {
    updates.duration = normalizeDuration(req.body.duration);
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'maximumMarks')) {
    const parsed = Number(req.body.maximumMarks);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return res.status(400).json({
        success: false,
        message: 'Maximum marks must be a non-negative number.',
      });
    }
    updates.maximumMarks = parsed;
  }

  if (updates.name === '' || updates.code === '') {
    return res.status(400).json({
      success: false,
      message: 'Exam name and code cannot be empty.',
    });
  }

  const current = await ExamDefinitionModel.findOne({ _id: req.params.id, isActive: true }).lean();
  if (!current) {
    return res.status(404).json({
      success: false,
      message: 'Exam not found.',
    });
  }

  const nextName = updates.name || current.name;
  const nextCode = updates.code || current.code;
  const duplicateByName = await ExamDefinitionModel.findOne({
    _id: { $ne: req.params.id },
    isActive: true,
    name: new RegExp(`^${nextName}$`, 'i'),
  }).lean();
  const duplicateByCode = duplicateByName
    ? duplicateByName
    : await ExamDefinitionModel.findOne({
      _id: { $ne: req.params.id },
      isActive: true,
      code: new RegExp(`^${nextCode}$`, 'i'),
  }).lean();

  if (duplicateByCode) {
    return res.status(409).json({
      success: false,
      message: 'Another exam with the same name or code already exists.',
    });
  }

  const updated = await ExamDefinitionModel.findOneAndUpdate(
    { _id: req.params.id, isActive: true },
    updates,
    { new: true, runValidators: true }
  ).lean();

  res.status(200).json({
    success: true,
    message: 'Exam updated successfully.',
    data: updated,
  });
});

const deleteExamDefinition = asyncHandler(async (req, res) => {
  const ExamDefinitionModel = req.models?.ExamDefinition || ExamDefinition;
  const deleted = await ExamDefinitionModel.findOneAndUpdate(
    { _id: req.params.id, isActive: true },
    { isActive: false },
    { new: true }
  ).lean();

  if (!deleted) {
    return res.status(404).json({
      success: false,
      message: 'Exam not found.',
    });
  }

  res.status(200).json({
    success: true,
    message: 'Exam deleted successfully.',
  });
});

const normalizeSubjectKey = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');

const getExamSubjectMatrix = asyncHandler(async (req, res) => {
  const ExamDefinitionModel = req.models?.ExamDefinition || ExamDefinition;
  const rows = await ExamDefinitionModel.find({ isActive: true })
    .sort({ displayOrder: 1, createdAt: 1 })
    .select('_id name code subjectKeys displayOrder')
    .lean();

  const matrix = {};
  rows.forEach((row) => {
    matrix[String(row._id)] = Array.isArray(row.subjectKeys)
      ? row.subjectKeys.map((key) => normalizeSubjectKey(key)).filter(Boolean)
      : [];
  });

  res.status(200).json({
    success: true,
    data: {
      exams: rows,
      matrix,
    },
  });
});

const saveExamSubjectMatrix = asyncHandler(async (req, res) => {
  const ExamDefinitionModel = req.models?.ExamDefinition || ExamDefinition;
  const incoming = req.body?.matrix && typeof req.body.matrix === 'object' ? req.body.matrix : null;

  if (!incoming) {
    return res.status(400).json({
      success: false,
      message: 'matrix object is required.',
    });
  }

  const exams = await ExamDefinitionModel.find({ isActive: true }).select('_id').lean();
  const examIds = new Set(exams.map((row) => String(row._id)));

  const ops = Object.entries(incoming)
    .filter(([examId]) => examIds.has(String(examId)))
    .map(([examId, keys]) => {
      const subjectKeys = Array.isArray(keys)
        ? [...new Set(keys.map((key) => normalizeSubjectKey(key)).filter(Boolean))]
        : [];
      return {
        updateOne: {
          filter: { _id: examId, isActive: true },
          update: { $set: { subjectKeys } },
        },
      };
    });

  if (ops.length > 0) {
    await ExamDefinitionModel.bulkWrite(ops);
  }

  const rows = await ExamDefinitionModel.find({ isActive: true })
    .sort({ displayOrder: 1, createdAt: 1 })
    .select('_id name code subjectKeys displayOrder')
    .lean();

  const matrix = {};
  rows.forEach((row) => {
    matrix[String(row._id)] = Array.isArray(row.subjectKeys) ? row.subjectKeys : [];
  });

  res.status(200).json({
    success: true,
    message: 'Exam-subject matrix saved.',
    data: { exams: rows, matrix },
  });
});

// @desc    Show or hide an exam's results in the parent/student portal
// @route   PUT /api/exam-definitions/:id/results-publication  { published: boolean }
const setResultsPublication = asyncHandler(async (req, res) => {
  const ExamDefinitionModel = req.models?.ExamDefinition || ExamDefinition;
  const published = req.body?.published === true;
  const exam = await ExamDefinitionModel.findOneAndUpdate(
    { _id: req.params.id, isActive: true },
    { $set: { resultsPublished: published, resultsPublishedAt: published ? new Date() : null } },
    { new: true }
  ).lean();

  if (!exam) {
    return res.status(404).json({ success: false, message: 'Exam not found.' });
  }

  return res.status(200).json({
    success: true,
    message: published ? 'Results are now visible to parents and students.' : 'Results are hidden from parents and students.',
    data: exam,
  });
});

module.exports = {
  setResultsPublication,
  listExamDefinitions,
  createExamDefinition,
  updateExamDefinition,
  deleteExamDefinition,
  getExamSubjectMatrix,
  saveExamSubjectMatrix,
};
