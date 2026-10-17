const ExcelJS = require('exceljs');
const { PLACEHOLDER_EMAIL_DOMAIN } = require('../utils/placeholderEmail');
const fs = require('fs');
const asyncHandler = require('../middleware/asyncHandler');
const Teacher = require('../models/Teacher');
const Subject = require('../models/Subject');
const Candidate = require('../models/Candidate');
const { generateResponse, getPaginationParams, buildPaginationResponse, buildFilterObject, buildSortObject } = require('../utils/helpers');
const { SUCCESS_MESSAGES, ERROR_MESSAGES, HTTP_STATUS } = require('../utils/constants');
const { getPlatformModels } = require('../tenancy/platformModels');
const { DEFAULT_TEMPLATE_COLUMNS } = require('./admin/masterTeacherTemplateController');
const eventBus = require('../events/eventBus');
const EVENTS = require('../events/eventNames');

const RETRYABLE_DB_ERROR_PATTERNS = [
  'buffering timed out',
  'MongoNetworkTimeoutError',
  'MongoServerSelectionError',
  'ECONNRESET',
  'timed out'
];

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const isRetryableDbError = (error) => {
  const message = String(error?.message || '');
  return RETRYABLE_DB_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
};

const withDbRetry = async (operation, operationName, attempts = 3) => {
  const attemptOperation = async (attempt) => {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableDbError(error) || attempt === attempts) {
        throw error;
      }
      const waitMs = 1200 * attempt;
      console.warn(
        `⚠️ ${operationName} failed (attempt ${attempt}/${attempts}). Retrying in ${waitMs}ms...`,
        error.message
      );
      await sleep(waitMs);
      return attemptOperation(attempt + 1);
    }
  };
  return attemptOperation(1);
};

const getTeacherTemplateColumns = async () => {
  try {
    const { MasterTeacherTemplate } = getPlatformModels();
    const template = await MasterTeacherTemplate.findOne({ isActive: true })
      .sort({ updatedAt: -1 })
      .lean();

    if (template?.columns?.length) {
      return template.columns;
    }
  } catch (_error) {
    // Fall back to defaults when platform template is unavailable.
  }

  return DEFAULT_TEMPLATE_COLUMNS;
};

const normalizeString = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object' && value.text) {
    return String(value.text).trim();
  }
  return String(value).trim();
};

const hasAnyNonEmptyValue = (rowValues) => (
  Object.values(rowValues).some((value) => normalizeString(value) !== '')
);

const clampText = (value, maxLength) => {
  const normalized = normalizeString(value);
  if (!normalized) {
    return '';
  }
  return normalized.slice(0, maxLength);
};

const digitsOnly = (value, fallback = '') => {
  const numeric = normalizeString(value).replace(/\D/g, '');
  return numeric || fallback;
};

const normalizeOasisId = (value) => {
  const raw = normalizeString(value);
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  return digits || '';
};

const escapeCsvCell = (value) => {
  const stringValue = normalizeString(value);
  const escaped = stringValue.replace(/"/g, '""');
  if (/[",\n]/.test(escaped)) {
    return `"${escaped}"`;
  }
  return escaped;
};

const parseCsvLine = (line) => {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells;
};

const parseCsvBuffer = (buffer) => {
  const text = buffer.toString('utf-8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/);
  const rows = [];

  lines.forEach((line) => {
    if (line.trim() === '') {
      return;
    }
    rows.push(parseCsvLine(line));
  });

  return rows;
};

const normalizeDutyType = (value) => String(value || '').trim();

const mergeDutyHistory = (existingHistory = [], ...dutyTypes) => {
  const normalizedHistory = Array.isArray(existingHistory)
    ? existingHistory.map((item) => normalizeDutyType(item)).filter(Boolean)
    : [];

  dutyTypes.forEach((dutyType) => {
    const normalized = normalizeDutyType(dutyType);
    if (normalized) {
      normalizedHistory.push(normalized);
    }
  });

  return Array.from(new Set(normalizedHistory));
};

const getRequiredTemplateKeys = (columns) => (
  new Set(columns.filter((column) => column.required).map((column) => column.key))
);

const buildGeneratedImportEmail = (employeeId, rowNumber, batchToken) => {
  const safeLocalPart = normalizeString(employeeId)
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
  const localPart = safeLocalPart || `functionary${rowNumber}`;
  return `${localPart}.${batchToken}.${rowNumber}@${PLACEHOLDER_EMAIL_DOMAIN}`;
};

// @desc    Get all teachers
// @route   GET /api/teachers
// @access  Private
const getTeachers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPaginationParams(req);
  const {
    search,
    department,
    subject,
    isActive,
    includeAllRecords,
    includeDutyTypeAssigned,
    minExperience,
    maxExperience,
    joiningDateFrom,
    joiningDateTo,
    schoolName,
    dutyType,
    sort = '-createdAt',
  } = req.query;

  // Build filter object
  const filter = {};

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { oasisId: { $regex: search, $options: 'i' } },
      { employeeId: { $regex: search, $options: 'i' } },
      { designation: { $regex: search, $options: 'i' } },
      { schoolName: { $regex: search, $options: 'i' } },
      { schoolCode: { $regex: search, $options: 'i' } },
      { mobileNo: { $regex: search, $options: 'i' } }
    ];
  }

  if (department) {
    filter.department = { $regex: department, $options: 'i' };
  }
  if (schoolName) {
    filter.schoolName = { $regex: schoolName, $options: 'i' };
  }

  if (subject) {
    filter.subjects = subject;
  }

  if (dutyType) {
    filter.dutyType = String(dutyType).trim();
  }

  if (includeAllRecords === true || includeAllRecords === 'true') {
    // Explicit override for admin reconciliation screens: return all records.
    // No isActive/dutyType visibility filter is applied.
  } else if (isActive !== undefined) {
    // Handle both boolean and string values when explicitly requested.
    filter.isActive = isActive === true || isActive === 'true';
  } else if (includeDutyTypeAssigned === true || includeDutyTypeAssigned === 'true') {
    // For Exam Functionaries listing: include records that are active OR have any functionary type.
    const visibilityOr = [
      { isActive: true },
      { dutyType: { $exists: true, $ne: '' } },
    ];
    if (filter.$or) {
      // Preserve existing search OR by combining via AND.
      filter.$and = [{ $or: filter.$or }, { $or: visibilityOr }];
      delete filter.$or;
    } else {
      filter.$or = visibilityOr;
    }
  } else {
    // Default to active functionaries so soft-deleted records stay hidden.
    filter.isActive = true;
  }

  if (minExperience !== undefined || maxExperience !== undefined) {
    filter.experience = {};
    if (minExperience !== undefined) {
      filter.experience.$gte = parseInt(minExperience);
    }
    if (maxExperience !== undefined) {
      filter.experience.$lte = parseInt(maxExperience);
    }
  }

  // Joining date range filter
  if (joiningDateFrom || joiningDateTo) {
    filter.dateOfJoining = {};
    if (joiningDateFrom) {
      filter.dateOfJoining.$gte = new Date(joiningDateFrom);
    }
    if (joiningDateTo) {
      // Set to end of day for the "to" date
      const toDate = new Date(joiningDateTo);
      toDate.setHours(23, 59, 59, 999);
      filter.dateOfJoining.$lte = toDate;
    }
  }

  // Get total count for pagination
  const totalCount = await Teacher.countDocuments(filter);

  // Get teachers with pagination
  const teachers = await Teacher.find(filter)
    .populate('subjects', 'name code class')
    .sort(buildSortObject(sort))
    .skip(skip)
    .limit(limit)
    .lean();

  const response = buildPaginationResponse(teachers, totalCount, page, limit);

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, SUCCESS_MESSAGES.FETCHED, response)
  );
});

// @desc    Get single teacher
// @route   GET /api/teachers/:id
// @access  Private
const getTeacher = asyncHandler(async (req, res) => {
  const teacher = await Teacher.findById(req.params.id)
    .populate('subjects', 'name code class type duration maxMarks');

  if (!teacher) {
    return res.status(HTTP_STATUS.NOT_FOUND).json(
      generateResponse(false, 'Teacher not found')
    );
  }

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, SUCCESS_MESSAGES.FETCHED, teacher)
  );
});

// @desc    Create new teacher
// @route   POST /api/teachers
// @access  Private
const createTeacher = asyncHandler(async (req, res) => {
  // Email is optional. Persist only when non-empty (avoid "" which can trip legacy unique indexes).
  const { email: rawEmail, ...bodyWithoutEmail } = req.body || {};
  const normalizedEmail = normalizeString(rawEmail).toLowerCase();

  // Backward-compat: older clients sent OASIS in employeeId.
  // If oasisId is missing and employeeId is digits-only, treat it as oasisId and clear employeeId.
  const legacyEmployeeId = normalizeString(bodyWithoutEmail.employeeId);
  const derivedOasisId = normalizeOasisId(bodyWithoutEmail.oasisId) || normalizeOasisId(legacyEmployeeId);
  const isLegacyEmployeeIdOasis = !normalizeOasisId(bodyWithoutEmail.oasisId) && legacyEmployeeId && /^\d+$/.test(legacyEmployeeId);

  // Validate subjects first so resolvedSubjectCode is available for reactivation too
  let resolvedSubjectCode = '';
  if (bodyWithoutEmail.subjects && bodyWithoutEmail.subjects.length > 0) {
    const validSubjects = await Subject.find({
      _id: { $in: bodyWithoutEmail.subjects },
      isActive: true
    });

    if (validSubjects.length !== bodyWithoutEmail.subjects.length) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        generateResponse(false, 'One or more invalid subject IDs provided')
      );
    }
    resolvedSubjectCode = validSubjects[0]?.code || '';
  }

  // Check if OASIS ID already exists (including soft-deleted records)
  const existingOasisId = derivedOasisId
    ? await Teacher.findOne({ oasisId: derivedOasisId })
    : null;
  if (existingOasisId) {
    if (!existingOasisId.isActive) {
      // Reactivate the soft-deleted record with the new payload
      const nextDutyType = normalizeDutyType(req.body.dutyType);
      const payload = {
        ...bodyWithoutEmail,
        oasisId: derivedOasisId || bodyWithoutEmail.oasisId || undefined,
        employeeId: isLegacyEmployeeIdOasis ? null : (bodyWithoutEmail.employeeId || null),
        // Only surface in Exam Functionaries when a duty type is selected.
        isActive: Boolean(nextDutyType),
        ...(normalizedEmail ? { email: normalizedEmail } : {}),
        subjectCode: resolvedSubjectCode || bodyWithoutEmail.subjectCode || '',
        accountNumber: digitsOnly(bodyWithoutEmail.accountNumber),
        phone: bodyWithoutEmail.mobileNo || bodyWithoutEmail.phone || ''
      };
      if (normalizeDutyType(payload.dutyType)) {
        payload.dutyHistory = mergeDutyHistory(existingOasisId.dutyHistory || [], payload.dutyType);
      }
      const reactivated = await Teacher.findByIdAndUpdate(
        existingOasisId._id,
        payload,
        { new: true, runValidators: true }
      ).populate('subjects', 'name code class');
      return res.status(HTTP_STATUS.CREATED).json(
        generateResponse(true, SUCCESS_MESSAGES.CREATED, reactivated)
      );
    }
    return res.status(HTTP_STATUS.CONFLICT).json(
      generateResponse(false, 'Teacher with this OASIS ID already exists')
    );
  }

  const nextDutyType = normalizeDutyType(req.body.dutyType);
  const payload = {
    ...bodyWithoutEmail,
    oasisId: derivedOasisId || bodyWithoutEmail.oasisId || undefined,
    employeeId: isLegacyEmployeeIdOasis ? null : (bodyWithoutEmail.employeeId || null),
    ...(normalizedEmail ? { email: normalizedEmail } : {}),
    subjectCode: resolvedSubjectCode || bodyWithoutEmail.subjectCode || '',
    accountNumber: digitsOnly(bodyWithoutEmail.accountNumber),
    phone: bodyWithoutEmail.mobileNo || bodyWithoutEmail.phone || '',
    // Only surface in Exam Functionaries when a duty type is selected.
    isActive: Boolean(nextDutyType)
  };

  if (normalizeDutyType(payload.dutyType)) {
    payload.dutyHistory = mergeDutyHistory([], payload.dutyType);
  }

  const teacher = await Teacher.create(payload);

  // Populate subjects before sending response
  await teacher.populate('subjects', 'name code class');

  res.status(HTTP_STATUS.CREATED).json(
    generateResponse(true, SUCCESS_MESSAGES.CREATED, teacher)
  );
});

// @desc    Update teacher
// @route   PUT /api/teachers/:id
// @access  Private
const updateTeacher = asyncHandler(async (req, res) => {
  let teacher = await Teacher.findById(req.params.id);

  if (!teacher) {
    return res.status(HTTP_STATUS.NOT_FOUND).json(
      generateResponse(false, 'Teacher not found')
    );
  }

  // Backward-compat: older clients may send OASIS in employeeId.
  const legacyEmployeeIdUpdate = normalizeString(req.body.employeeId);
  const derivedOasisIdUpdate = normalizeOasisId(req.body.oasisId) || normalizeOasisId(legacyEmployeeIdUpdate);
  const isLegacyEmployeeIdOasisUpdate = !normalizeOasisId(req.body.oasisId) && legacyEmployeeIdUpdate && /^\d+$/.test(legacyEmployeeIdUpdate);

  // Check for OASIS ID conflicts (exclude current teacher)
  if (derivedOasisIdUpdate && derivedOasisIdUpdate !== normalizeOasisId(teacher.oasisId)) {
    const existingOasisId = await Teacher.findOne({
      oasisId: derivedOasisIdUpdate,
      _id: { $ne: req.params.id }
    });
    if (existingOasisId && existingOasisId.isActive) {
      return res.status(HTTP_STATUS.CONFLICT).json(
        generateResponse(false, 'Teacher with this OASIS ID already exists')
      );
    }
  }

  // Validate subjects if provided
  const updatePayload = { ...req.body };
  // Email is optional. Persist only when non-empty; delete when blank.
  if (Object.prototype.hasOwnProperty.call(updatePayload, 'email')) {
    const normalizedEmail = normalizeString(updatePayload.email).toLowerCase();
    if (!normalizedEmail) delete updatePayload.email;
    else updatePayload.email = normalizedEmail;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'oasisId') || Object.prototype.hasOwnProperty.call(req.body, 'employeeId')) {
    updatePayload.oasisId = derivedOasisIdUpdate || undefined;
    if (isLegacyEmployeeIdOasisUpdate) {
      updatePayload.employeeId = null;
    }
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'accountNumber')) {
    updatePayload.accountNumber = digitsOnly(req.body.accountNumber);
  }
  if (req.body.subjects && req.body.subjects.length > 0) {
    const validSubjects = await Subject.find({
      _id: { $in: req.body.subjects },
      isActive: true
    });

    if (validSubjects.length !== req.body.subjects.length) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        generateResponse(false, 'One or more invalid subject IDs provided')
      );
    }
    updatePayload.subjectCode = validSubjects[0]?.code || req.body.subjectCode || '';
  }
  if (req.body.mobileNo) {
    updatePayload.phone = req.body.mobileNo;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'dutyType')) {
    const previousDutyType = normalizeDutyType(teacher.dutyType);
    const nextDutyType = normalizeDutyType(req.body.dutyType);

    if (previousDutyType !== nextDutyType) {
      updatePayload.dutyHistory = mergeDutyHistory(
        teacher.dutyHistory || [],
        previousDutyType,
        nextDutyType
      );
    }

    // If a functionary type is selected later, make the record visible in Exam Functionaries.
    if (nextDutyType && !teacher.isActive) {
      updatePayload.isActive = true;
    }
  }

  teacher = await Teacher.findByIdAndUpdate(
    req.params.id,
    updatePayload,
    {
      new: true,
      runValidators: true
    }
  ).populate('subjects', 'name code class');

  eventBus.emit(EVENTS.TEACHER_UPDATED, {
    tenant: { dbName: req.tenant.dbName, slug: req.tenant.slug, id: String(req.tenant.id) },
    teacherId: String(teacher._id),
    teacherName: teacher.name,
    teacherShortName: teacher.shortName,
  });

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, SUCCESS_MESSAGES.UPDATED, teacher)
  );
});

// @desc    Delete teacher
// @route   DELETE /api/teachers/:id
// @access  Private
const deleteTeacher = asyncHandler(async (req, res) => {
  const teacher = await Teacher.findById(req.params.id);

  if (!teacher) {
    return res.status(HTTP_STATUS.NOT_FOUND).json(
      generateResponse(false, 'Teacher not found')
    );
  }

  const permanentDelete = req.query?.permanent === true || req.query?.permanent === 'true';
  const tenantContext = { dbName: req.tenant.dbName, slug: req.tenant.slug, id: String(req.tenant.id) };

  if (permanentDelete) {
    await Teacher.deleteOne({ _id: teacher._id });
    eventBus.emit(EVENTS.TEACHER_DELETED, {
      tenant: tenantContext,
      teacherId: String(teacher._id),
      teacherName: teacher.name,
    });
  } else {
    // Soft delete - set isActive to false
    teacher.isActive = false;
    await teacher.save();
    eventBus.emit(EVENTS.TEACHER_DEACTIVATED, {
      tenant: tenantContext,
      teacherId: String(teacher._id),
      teacherName: teacher.name,
    });
  }

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, SUCCESS_MESSAGES.DELETED)
  );
});

// @desc    Assign subjects to teacher
// @route   POST /api/teachers/:id/subjects
// @access  Private
const assignSubjects = asyncHandler(async (req, res) => {
  const { subjectIds } = req.body;

  const teacher = await Teacher.findById(req.params.id);
  if (!teacher) {
    return res.status(HTTP_STATUS.NOT_FOUND).json(
      generateResponse(false, 'Teacher not found')
    );
  }

  // Validate subjects
  const validSubjects = await Subject.find({
    _id: { $in: subjectIds },
    isActive: true
  });

  if (validSubjects.length !== subjectIds.length) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json(
      generateResponse(false, 'One or more invalid subject IDs provided')
    );
  }

  // Assign subjects
  await teacher.assignSubjects(subjectIds);

  // Populate and return updated teacher
  const updatedTeacher = await Teacher.findById(req.params.id)
    .populate('subjects', 'name code class');

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, 'Subjects assigned successfully', updatedTeacher)
  );
});

// @desc    Remove subjects from teacher
// @route   DELETE /api/teachers/:id/subjects
// @access  Private
const removeSubjects = asyncHandler(async (req, res) => {
  const { subjectIds } = req.body;

  const teacher = await Teacher.findById(req.params.id);
  if (!teacher) {
    return res.status(HTTP_STATUS.NOT_FOUND).json(
      generateResponse(false, 'Teacher not found')
    );
  }

  // Remove subjects
  await teacher.removeSubjects(subjectIds);

  // Populate and return updated teacher
  const updatedTeacher = await Teacher.findById(req.params.id)
    .populate('subjects', 'name code class');

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, 'Subjects removed successfully', updatedTeacher)
  );
});

// @desc    Get teachers by department
// @route   GET /api/teachers/department/:department
// @access  Private
const getTeachersByDepartment = asyncHandler(async (req, res) => {
  const { department } = req.params;

  const teachers = await Teacher.findByDepartment(department)
    .populate('subjects', 'name code class')
    .sort('name');

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, SUCCESS_MESSAGES.FETCHED, teachers)
  );
});

// @desc    Get teachers by subject
// @route   GET /api/teachers/subject/:subjectId
// @access  Private
const getTeachersBySubject = asyncHandler(async (req, res) => {
  const { subjectId } = req.params;

  // Validate subject exists
  const subject = await Subject.findById(subjectId);
  if (!subject) {
    return res.status(HTTP_STATUS.NOT_FOUND).json(
      generateResponse(false, 'Subject not found')
    );
  }

  const teachers = await Teacher.findBySubject(subjectId)
    .populate('subjects', 'name code class')
    .sort('name');

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, SUCCESS_MESSAGES.FETCHED, teachers)
  );
});

// @desc    Get teacher statistics
// @route   GET /api/teachers/stats
// @access  Private
const getTeacherStats = asyncHandler(async (req, res) => {
  const stats = await Teacher.getStats();

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, 'Teacher statistics fetched successfully', stats)
  );
});

// @desc    Get distinct schools from candidates
// @route   GET /api/teachers/schools
// @access  Private
const getTeacherSchoolOptions = asyncHandler(async (req, res) => {
  const CandidateModel = req.models?.Candidate || Candidate;
  const CentreDetail = req.models?.CentreDetail;

  const schools = await CandidateModel.aggregate([
    {
      $match: {
        schoolName: { $exists: true, $ne: '' },
        schoolCode: { $exists: true, $ne: '' }
      }
    },
    {
      $group: {
        _id: {
          schoolName: '$schoolName',
          schoolCode: '$schoolCode'
        }
      }
    },
    {
      $project: {
        _id: 0,
        schoolName: '$_id.schoolName',
        schoolCode: '$_id.schoolCode'
      }
    },
    { $sort: { schoolName: 1 } }
  ]);

  const normalized = schools
    .map((item) => ({
      schoolName: String(item?.schoolName || '').trim(),
      schoolCode: String(item?.schoolCode || '').trim()
    }))
    .filter((item) => item.schoolName && item.schoolCode);

  const latestCentre = CentreDetail
    ? await CentreDetail.findOne({}).sort({ updatedAt: -1 }).lean()
    : null;

  const centreSchoolName = String(latestCentre?.centreName || '').trim();
  const centreSchoolCode = String(latestCentre?.centreSchoolCode || '').trim();
  if (centreSchoolName && centreSchoolCode) {
    normalized.push({
      schoolName: centreSchoolName,
      schoolCode: centreSchoolCode
    });
  }

  const seen = new Set();
  const deduped = normalized.filter((item) => {
    const key = `${item.schoolName.toLowerCase()}__${item.schoolCode.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  deduped.sort((a, b) => a.schoolName.localeCompare(b.schoolName));

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, SUCCESS_MESSAGES.FETCHED, deduped)
  );
});

// @desc    Get next available employee ID
// @route   GET /api/teachers/next-employee-id
// @access  Private
const getNextEmployeeId = asyncHandler(async (req, res) => {
  // Find the latest employee ID by sorting in descending order
  const latestTeacher = await Teacher.findOne(
    { employeeId: { $regex: /^EMP\d+$/ } }, // Match EMP followed by digits
    { employeeId: 1 }
  ).sort({ createdAt: -1 });

  let nextEmployeeId = 'EMP1'; // Default starting ID

  if (latestTeacher && latestTeacher.employeeId) {
    // Extract the numeric part and increment it
    const currentNumber = parseInt(latestTeacher.employeeId.substring(3));
    const nextNumber = currentNumber + 1;
    nextEmployeeId = `EMP${nextNumber}`;
  }

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, 'Next employee ID generated successfully', { employeeId: nextEmployeeId })
  );
});

// @desc    Bulk create teachers
// @route   POST /api/teachers/bulk
// @access  Private
const bulkCreateTeachers = asyncHandler(async (req, res) => {
  const { teachers, skipDuplicates = false, updateExisting = false } = req.body;

  const results = {
    created: [],
    updated: [],
    skipped: [],
    errors: []
  };

  for (const teacherData of teachers) {
    try {
      // Email is hard-disabled for teachers. Only dedupe by employeeId (and oasisId when present).
      const or = [];
      if (teacherData?.employeeId) or.push({ employeeId: teacherData.employeeId });
      if (teacherData?.oasisId) or.push({ oasisId: teacherData.oasisId });
      const existingTeacher = or.length ? await Teacher.findOne({ $or: or }) : null;

      if (existingTeacher) {
        if (updateExisting) {
          const updatedTeacher = await Teacher.findByIdAndUpdate(
            existingTeacher._id,
            { ...teacherData, email: undefined },
            { new: true, runValidators: true }
          );
          results.updated.push(updatedTeacher);
        } else if (skipDuplicates) {
          results.skipped.push({
            email: undefined,
            reason: 'Duplicate entry'
          });
        } else {
          results.errors.push({
            email: undefined,
            reason: 'Teacher already exists'
          });
        }
      } else {
        // Validate subjects if provided
        if (teacherData.subjects && teacherData.subjects.length > 0) {
          const validSubjects = await Subject.find({
            _id: { $in: teacherData.subjects },
            isActive: true
          });

          if (validSubjects.length !== teacherData.subjects.length) {
            results.errors.push({
              email: teacherData.email,
              reason: 'Invalid subject IDs'
            });
            continue;
          }
        }

        const newTeacher = await Teacher.create({ ...teacherData, email: undefined });
        results.created.push(newTeacher);
      }
    } catch (error) {
      results.errors.push({
        email: undefined,
        reason: error.message
      });
    }
  }

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, 'Bulk teacher operation completed', results)
  );
});

// @desc    Download exam functionaries import template
// @route   GET /api/teachers/import-template
// @access  Private
const downloadTeacherImportTemplate = asyncHandler(async (req, res) => {
  const columns = await getTeacherTemplateColumns();
  const headers = columns.map((column) => column.label);
  const format = String(req.query.format || 'csv').toLowerCase();

  if (format === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Exam Functionaries');
    worksheet.addRow(headers);
    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.columns = headers.map((header) => ({
      width: Math.max(18, Math.min(40, header.length + 6))
    }));

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `exam_functionaries_template_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.status(HTTP_STATUS.OK).send(Buffer.from(buffer));
  }

  const csvContent = `${headers.map((header) => escapeCsvCell(header)).join(',')}\n`;
  const fileName = `exam_functionaries_template_${new Date().toISOString().split('T')[0]}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  return res.status(HTTP_STATUS.OK).send(csvContent);
});

// @desc    Upload exam functionaries import template
// @route   POST /api/teachers/import-template/upload
// @access  Private
const uploadTeachersFromTemplate = asyncHandler(async (req, res) => {
  const TeacherModel = req.models?.Teacher || Teacher;
  const SubjectModel = req.models?.Subject || Subject;
  let file = null;
  if (!req.files || !req.files.file) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json(
      generateResponse(false, 'No file uploaded. Please upload a .csv or .xlsx file.')
    );
  }

  file = req.files.file;
  const fileName = String(file.name || '').toLowerCase();
  const isXlsx = fileName.endsWith('.xlsx');
  const isCsv = fileName.endsWith('.csv');
  if (!isXlsx && !isCsv) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json(
      generateResponse(false, 'Only .csv or .xlsx files are supported for import.')
    );
  }

  const fileBuffer = file?.tempFilePath && fs.existsSync(file.tempFilePath)
    ? fs.readFileSync(file.tempFilePath)
    : file.data;

  const columns = await getTeacherTemplateColumns();
  const requiredTemplateKeys = getRequiredTemplateKeys(columns);
  const expectedHeaders = columns.map((column) => column.label);
  const headerToKeyMap = new Map(columns.map((column) => [column.label, column.key]));
  let receivedHeaders = [];
  let dataRows = [];
  try {
    if (isCsv) {
      const rows = parseCsvBuffer(fileBuffer);
      if (!rows.length) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json(
          generateResponse(false, 'CSV file is empty.')
        );
      }
      receivedHeaders = expectedHeaders.map((_, index) => normalizeString(rows[0]?.[index]));
      dataRows = rows.slice(1).map((cells, index) => ({
        rowNumber: index + 2,
        valueAt: (cellIndex) => cells[cellIndex] || ''
      }));
    } else {
      const workbook = new ExcelJS.Workbook();
      try {
        await workbook.xlsx.load(fileBuffer);
      } catch (_error) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json(
          generateResponse(false, 'Invalid or unsupported Excel file.')
        );
      }

      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json(
          generateResponse(false, 'Excel file has no worksheets.')
        );
      }

      const headerRow = worksheet.getRow(1);
      receivedHeaders = expectedHeaders.map((_, index) => normalizeString(headerRow.getCell(index + 1).value));
      dataRows = Array.from({ length: Math.max(0, worksheet.rowCount - 1) }, (_, index) => ({
        rowNumber: index + 2,
        valueAt: (cellIndex) => worksheet.getRow(index + 2).getCell(cellIndex + 1).value
      }));
    }
  } finally {
    if (file?.tempFilePath && fs.existsSync(file.tempFilePath)) {
      fs.unlinkSync(file.tempFilePath);
    }
  }

  const headersAreValid = expectedHeaders.length === receivedHeaders.length
    && expectedHeaders.every((header, index) => header === receivedHeaders[index]);

  if (!headersAreValid) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Template headers do not match. Please use the downloaded template without changing headers.',
      data: {
        expectedHeaders,
        receivedHeaders
      }
    });
  }

  const results = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    warnings: []
  };

  const normalizedEntries = [];
  const subjectCodeUniverse = new Set();
  const oasisIdUniverse = new Set();

  dataRows.forEach(({ rowNumber, valueAt }) => {
    const rowData = {};
    expectedHeaders.forEach((header, cellIndex) => {
      const key = headerToKeyMap.get(header);
      rowData[key] = valueAt(cellIndex);
    });

    if (!hasAnyNonEmptyValue(rowData)) {
      results.skipped += 1;
      return;
    }

    const normalizedRow = Object.fromEntries(
      Object.entries(rowData).map(([key, value]) => [key, normalizeString(value)])
    );
    const missingRequiredKeys = Array.from(requiredTemplateKeys).filter((key) => !normalizedRow[key]);
    if (missingRequiredKeys.length > 0) {
      results.errors.push({
        row: rowNumber,
        message: `Missing required fields: ${missingRequiredKeys.join(', ')}`
      });
      return;
    }

    const oasisId = clampText(normalizedRow.oasisId || normalizedRow.employeeId, 120);
    // Employee ID (school HR) is optional. If template only had legacy `employeeId` digits,
    // it will be treated as OASIS and school employeeId will remain blank.
    const schoolEmployeeId = clampText(normalizedRow.employeeId || '', 120);
    const name = clampText(normalizedRow.functionaryName || normalizedRow.name, 100);
    const designation = clampText(normalizedRow.designation, 50);
    if (!oasisId || !name || !designation) {
      results.errors.push({
        row: rowNumber,
        message: 'Oasis ID, Functionary Name, and Designation are required'
      });
      return;
    }

    const subjectCodes = (normalizedRow.subjectCode || normalizedRow.subjectCodes || '')
      .split(',')
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean);
    subjectCodes.forEach((code) => subjectCodeUniverse.add(code));
    oasisIdUniverse.add(oasisId);

    normalizedEntries.push({
      rowNumber,
      oasisId,
      employeeId: schoolEmployeeId,
      name,
      designation,
      subjectName: normalizedRow.subject || normalizedRow.department || '',
      schoolCode: normalizedRow.schoolCode || '',
      srNo: normalizedRow.srNo || '',
      subjectCodes
    });
  });

  const subjectsByCode = {};
  if (subjectCodeUniverse.size > 0) {
    const subjects = await withDbRetry(
      () => SubjectModel.find({
        code: { $in: Array.from(subjectCodeUniverse) },
        isActive: true
      }).select('_id code').lean(),
      'teacher import subject lookup'
    );
    subjects.forEach((subject) => {
      subjectsByCode[subject.code] = subject;
    });
  }

  const existingTeachers = oasisIdUniverse.size > 0
    ? await withDbRetry(
      () => TeacherModel.find({ oasisId: { $in: Array.from(oasisIdUniverse) } })
        .select('oasisId employeeId email phone mobileNo department designation schoolName schoolCode bankName accountNumber ifscCode experience qualification dateOfJoining dateOfBirth isActive')
        .lean(),
      'teacher import existing teacher lookup'
    )
    : [];
  const existingByOasisId = new Map(existingTeachers.map((teacher) => [teacher.oasisId, teacher]));
  const importBatchToken = Date.now();

  const operations = [];
  const operationRows = [];

  normalizedEntries.forEach((entry) => {
    const matchedSubjects = entry.subjectCodes
      .map((code) => subjectsByCode[code])
      .filter(Boolean);
    const subjectIds = matchedSubjects.map((subject) => subject._id);
    const matchedCodes = new Set(matchedSubjects.map((subject) => subject.code));
    const unmatchedSubjectCodes = entry.subjectCodes.filter((code) => !matchedCodes.has(code));
    if (unmatchedSubjectCodes.length > 0) {
      results.warnings.push({
        row: entry.rowNumber,
        message: `Subject code(s) not found in subjects master: ${unmatchedSubjectCodes.join(', ')}`
      });
    }

    const existingTeacher = existingByOasisId.get(entry.oasisId);
    const payload = {
      oasisId: entry.oasisId,
      employeeId: entry.employeeId || '',
      name: entry.name,
      email: existingTeacher?.email || buildGeneratedImportEmail(entry.oasisId, entry.rowNumber, importBatchToken),
      phone: existingTeacher?.phone || '9000000000',
      mobileNo: existingTeacher?.mobileNo || existingTeacher?.phone || '9000000000',
      department: clampText(existingTeacher?.department || 'General', 50),
      designation: entry.designation,
      subjectCode: matchedSubjects[0]?.code || entry.subjectCodes[0] || '',
      schoolName: clampText(existingTeacher?.schoolName || `School ${entry.schoolCode || 'Unknown'}`, 200),
      schoolCode: clampText(existingTeacher?.schoolCode || entry.schoolCode || 'NA', 20),
      bankName: clampText(existingTeacher?.bankName || 'N/A Bank', 120),
      accountNumber: digitsOnly(existingTeacher?.accountNumber || entry.oasisId || '0', '0').slice(0, 40),
      ifscCode: clampText((existingTeacher?.ifscCode || 'ABCD0000001').toUpperCase(), 20),
      experience: existingTeacher?.experience ?? 0,
      qualification: clampText(existingTeacher?.qualification || 'N/A', 200),
      dateOfJoining: existingTeacher?.dateOfJoining || new Date(),
      dateOfBirth: existingTeacher?.dateOfBirth || new Date('1990-01-01'),
      isActive: existingTeacher?.isActive ?? true,
      subjects: subjectIds
    };

    const notesParts = [];
    if (entry.schoolCode) notesParts.push(`School Code: ${entry.schoolCode}`);
    if (entry.subjectName) notesParts.push(`Subject: ${entry.subjectName}`);
    if (entry.srNo) notesParts.push(`Sr No: ${entry.srNo}`);
    if (unmatchedSubjectCodes.length > 0) {
      notesParts.push(`Unmatched Subject Code(s): ${unmatchedSubjectCodes.join(', ')}`);
    }
    if (notesParts.length > 0) {
      payload.notes = clampText(notesParts.join(' | '), 500);
    }

    operations.push({
      updateOne: {
        filter: { oasisId: entry.oasisId },
        update: { $set: payload },
        upsert: true
      }
    });
    operationRows.push(entry.rowNumber);
  });

  if (operations.length > 0) {
    try {
      const bulkResult = await withDbRetry(
        () => TeacherModel.bulkWrite(operations, { ordered: false }),
        'teacher import bulk write'
      );
      results.created = bulkResult.upsertedCount || 0;
      results.updated = Math.max(0, operations.length - results.created);
    } catch (error) {
      const writeErrors = error?.writeErrors || [];
      if (writeErrors.length > 0) {
        writeErrors.forEach((writeError) => {
          const opIndex = writeError?.index;
          const rowNumber = operationRows[opIndex] || null;
          results.errors.push({
            row: rowNumber,
            message: writeError?.errmsg || 'Failed to import row'
          });
        });
        const successCount = Math.max(0, operations.length - writeErrors.length);
        const insertedCount = error?.result?.upsertedCount || 0;
        results.created = insertedCount;
        results.updated = Math.max(0, successCount - insertedCount);
      } else {
        results.errors.push({
          row: null,
          message: error.message || 'Bulk import failed'
        });
      }
    }
  }

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Import completed',
    data: results
  });
});

module.exports = {
  getTeachers,
  getTeacher,
  createTeacher,
  updateTeacher,
  deleteTeacher,
  assignSubjects,
  removeSubjects,
  getTeachersByDepartment,
  getTeachersBySubject,
  getTeacherStats,
  getTeacherSchoolOptions,
  getNextEmployeeId,
  bulkCreateTeachers,
  downloadTeacherImportTemplate,
  uploadTeachersFromTemplate
};
