const asyncHandler = require('../middleware/asyncHandler');
const ExamCircular = require('../models/ExamCircular');
const eventBus = require('../events/eventBus');
const EVENTS = require('../events/eventNames');

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const PAGE_SIZES = ['A4', 'legal', 'letter'];

const normalizePageSize = (value) => {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'lgl' || key === 'legal') return 'legal';
  if (key === 'ltr' || key === 'letter') return 'letter';
  return 'A4';
};

const sanitizeCircularHtml = (html) =>
  String(html || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .trim();

const isBlankCircularContent = (html) =>
  sanitizeCircularHtml(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .trim() === '';

const deriveSeriesFromReference = (referenceNumber) => {
  const trimmed = String(referenceNumber || '').trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^(.*?)(\d+)$/);
  if (!match) return trimmed;
  return match[1].trim();
};

const getNextReferenceNumber = async (CircularModel, seriesRaw) => {
  const series = String(seriesRaw || '').trim();
  if (!series) return '';

  const matcher = new RegExp(`^${escapeRegex(series)}`);
  const candidates = await CircularModel.find(
    { isActive: true, referenceNumber: matcher },
    { referenceNumber: 1 }
  ).lean();

  let maxCounter = 0;
  const suffixMatcher = new RegExp(`^${escapeRegex(series)}(\\d+)$`);
  candidates.forEach((item) => {
    const value = String(item?.referenceNumber || '').trim();
    const suffixMatch = value.match(suffixMatcher);
    if (!suffixMatch) return;
    const parsed = Number.parseInt(suffixMatch[1], 10);
    if (Number.isFinite(parsed) && parsed > maxCounter) {
      maxCounter = parsed;
    }
  });

  return `${series}${String(maxCounter + 1).padStart(3, '0')}`;
};

const listCirculars = asyncHandler(async (req, res) => {
  const CircularModel = req.models?.ExamCircular || ExamCircular;
  const circulars = await CircularModel.find({ isActive: true }).sort({ updatedAt: -1 }).lean();

  res.status(200).json({
    success: true,
    data: circulars,
  });
});

const createCircular = asyncHandler(async (req, res) => {
  const CircularModel = req.models?.ExamCircular || ExamCircular;
  const title = String(req.body?.title || '').trim();
  const content = sanitizeCircularHtml(req.body?.content);
  const circularDateRaw = req.body?.circularDate;
  const referenceSeriesRaw = String(req.body?.referenceSeries || '').trim();
  let referenceNumber = String(req.body?.referenceNumber || '').trim();
  const circularDate = circularDateRaw ? new Date(circularDateRaw) : null;
  const pageSize = normalizePageSize(req.body?.pageSize);

  if (!title || isBlankCircularContent(content) || !circularDate || Number.isNaN(circularDate.getTime())) {
    return res.status(400).json({
      success: false,
      message: 'Title, content, and date are required.',
    });
  }

  if (!referenceNumber && referenceSeriesRaw) {
    referenceNumber = await getNextReferenceNumber(CircularModel, referenceSeriesRaw);
  }

  if (!referenceNumber) {
    return res.status(400).json({
      success: false,
      message: 'Reference number is required.',
    });
  }

  const referenceSeries = referenceSeriesRaw || deriveSeriesFromReference(referenceNumber);

  const created = await CircularModel.create({
    title,
    content,
    circularDate,
    referenceSeries,
    referenceNumber,
    pageSize,
    status: 'draft',
    ...(req.academicSession ? { academicSession: req.academicSession } : {}),
  });

  res.status(201).json({
    success: true,
    message: 'Circular drafted successfully.',
    data: created,
  });
});

const updateCircular = asyncHandler(async (req, res) => {
  const CircularModel = req.models?.ExamCircular || ExamCircular;
  const updates = {};

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'title')) {
    updates.title = String(req.body.title || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'content')) {
    updates.content = sanitizeCircularHtml(req.body.content);
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'circularDate')) {
    const value = req.body.circularDate ? new Date(req.body.circularDate) : null;
    if (!value || Number.isNaN(value.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid date.',
      });
    }
    updates.circularDate = value;
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'referenceSeries')) {
    updates.referenceSeries = String(req.body.referenceSeries || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'referenceNumber')) {
    updates.referenceNumber = String(req.body.referenceNumber || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'pageSize')) {
    const nextSize = normalizePageSize(req.body.pageSize);
    if (!PAGE_SIZES.includes(nextSize)) {
      return res.status(400).json({ success: false, message: 'Page size must be A4, Legal, or Letter.' });
    }
    updates.pageSize = nextSize;
  }

  if (updates.title === '' || (Object.prototype.hasOwnProperty.call(updates, 'content') && isBlankCircularContent(updates.content)) || updates.referenceNumber === '') {
    return res.status(400).json({
      success: false,
      message: 'Title, content, and reference number cannot be empty.',
    });
  }

  if (!updates.referenceSeries && updates.referenceNumber) {
    updates.referenceSeries = deriveSeriesFromReference(updates.referenceNumber);
  }

  const updated = await CircularModel.findOneAndUpdate(
    { _id: req.params.id, isActive: true },
    updates,
    { new: true, runValidators: true }
  ).lean();

  if (!updated) {
    return res.status(404).json({
      success: false,
      message: 'Circular not found.',
    });
  }

  res.status(200).json({
    success: true,
    message: 'Circular updated successfully.',
    data: updated,
  });
});

const publishCircular = asyncHandler(async (req, res) => {
  const CircularModel = req.models?.ExamCircular || ExamCircular;
  const circular = await CircularModel.findOneAndUpdate(
    { _id: req.params.id, isActive: true },
    { status: 'published', publishedAt: new Date() },
    { new: true, runValidators: true }
  ).lean();

  if (!circular) {
    return res.status(404).json({
      success: false,
      message: 'Circular not found.',
    });
  }
  eventBus.emitFromRequest(req, EVENTS.EXAM_NOTICE_PUBLISHED, { circularId: String(circular._id), title: circular.title });

  res.status(200).json({
    success: true,
    message: 'Circular published successfully.',
    data: circular,
  });
});

const deleteCircular = asyncHandler(async (req, res) => {
  const CircularModel = req.models?.ExamCircular || ExamCircular;
  const deleted = await CircularModel.findOneAndUpdate(
    { _id: req.params.id, isActive: true },
    { isActive: false },
    { new: true }
  ).lean();

  if (!deleted) {
    return res.status(404).json({
      success: false,
      message: 'Circular not found.',
    });
  }

  res.status(200).json({
    success: true,
    message: 'Circular deleted successfully.',
  });
});

module.exports = {
  listCirculars,
  createCircular,
  updateCircular,
  publishCircular,
  deleteCircular,
};
