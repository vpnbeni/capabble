const asyncHandler = require('../middleware/asyncHandler');
const { generateResponse, isValidEmail } = require('../utils/helpers');
const { HTTP_STATUS } = require('../utils/constants');
const mongoose = require('mongoose');

const getModelFromRequest = (req, modelName) => {
  const Model = req.models?.[modelName];
  if (!Model) {
    throw new Error(`${modelName} model is not registered on tenant connection`);
  }
  return Model;
};

const parseOptionalDate = (value) => {
  if (!value) return null;
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }
  return parsedDate;
};

exports.createTicket = asyncHandler(async (req, res) => {
  const SupportTicket = getModelFromRequest(req, 'SupportTicket');
  const {
    productModule,
    productModuleLabel,
    pageOrArea,
    pagePath,
    schoolCode,
    affiliationNo,
    issueDate,
    centreCode,
    examDate,
    module,
    description,
    screenshot,
  } = req.body || {};

  const resolvedProductModule = productModule || module;
  const resolvedPageOrArea = pageOrArea || module;
  const resolvedDescription = description ? String(description).trim() : '';

  if (!resolvedProductModule || !resolvedPageOrArea || !resolvedDescription) {
    return res
      .status(HTTP_STATUS.BAD_REQUEST)
      .json(
        generateResponse(
          false,
          'productModule, pageOrArea and description are required'
        )
      );
  }

  const parsedIssueDate = parseOptionalDate(issueDate || examDate);
  if ((issueDate || examDate) && !parsedIssueDate) {
    return res
      .status(HTTP_STATUS.BAD_REQUEST)
      .json(generateResponse(false, 'issueDate must be a valid date'));
  }

  const resolvedSchoolCode = String(schoolCode || centreCode || '').trim();
  const resolvedAffiliationNo = String(affiliationNo || '').trim();
  const resolvedModuleLabel =
    String(productModuleLabel || '').trim() ||
    `${String(resolvedProductModule).trim()} · ${String(resolvedPageOrArea).trim()}`;

  const ticket = await SupportTicket.create({
    productModule: String(resolvedProductModule).trim(),
    productModuleLabel: resolvedModuleLabel,
    pageOrArea: String(resolvedPageOrArea).trim(),
    pagePath: pagePath ? String(pagePath).trim() : '',
    schoolCode: resolvedSchoolCode,
    affiliationNo: resolvedAffiliationNo,
    issueDate: parsedIssueDate,
    centreCode: resolvedSchoolCode || resolvedAffiliationNo,
    examDate: parsedIssueDate,
    module: resolvedModuleLabel,
    description: resolvedDescription,
    screenshot: screenshot ? String(screenshot).trim() : undefined,
  });

  return res
    .status(HTTP_STATUS.CREATED)
    .json(
      generateResponse(true, 'Support ticket submitted successfully', {
        id: ticket._id,
        status: ticket.status,
        createdAt: ticket.createdAt,
      })
    );
});

exports.submitFeedback = asyncHandler(async (req, res) => {
  const Feedback = getModelFromRequest(req, 'Feedback');
  const { name, email, rating, message } = req.body || {};

  if (!name || !email || rating === undefined || rating === null || !message) {
    return res
      .status(HTTP_STATUS.BAD_REQUEST)
      .json(generateResponse(false, 'name, email, rating and message are required'));
  }

  if (!isValidEmail(String(email))) {
    return res
      .status(HTTP_STATUS.BAD_REQUEST)
      .json(generateResponse(false, 'Please provide a valid email address'));
  }

  const numericRating = Number(rating);
  if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
    return res
      .status(HTTP_STATUS.BAD_REQUEST)
      .json(generateResponse(false, 'Rating must be between 1 and 5'));
  }

  const feedback = await Feedback.create({
    name: String(name).trim(),
    email: String(email).trim().toLowerCase(),
    rating: numericRating,
    message: String(message).trim(),
  });

  return res
    .status(HTTP_STATUS.CREATED)
    .json(
      generateResponse(true, 'Feedback submitted successfully', {
        id: feedback._id,
        createdAt: feedback.createdAt,
      })
    );
});

exports.getSystemStatus = asyncHandler(async (_req, res) => {
  let status = 'operational';
  let message = 'All systems operational';

  const override = process.env.SUPPORT_SYSTEM_STATUS;
  if (override && ['operational', 'maintenance', 'down'].includes(override)) {
    status = override;
    if (status === 'maintenance') {
      message = 'System in maintenance mode';
    } else if (status === 'down') {
      message = 'Server downtime';
    }
  } else {
    const conn = mongoose.connection;
    if (conn.readyState !== 1) {
      status = 'maintenance';
      message = 'Database connection is not fully healthy';
    }
  }

  return res
    .status(HTTP_STATUS.OK)
    .json(
      generateResponse(true, 'System status fetched successfully', {
        status,
        message,
      })
    );
});
