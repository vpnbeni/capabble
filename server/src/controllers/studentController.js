const asyncHandler = require('../middleware/asyncHandler');
const { buildSectionFilter, withScope } = require('../rbac/scope');
const Student = require('../models/Student');
const Subject = require('../models/Subject');
const { generateResponse, buildPaginationResponse } = require('../utils/helpers');
const { SUCCESS_MESSAGES, ERROR_MESSAGES, HTTP_STATUS, STUDENT_GENDERS } = require('../utils/constants');
const ExcelJS = require('exceljs');
const path = require('path');
const fsSync = require('fs');
const fs = fsSync.promises;
const { uploadToCloudinary, deleteFromCloudinary, extractPublicId, uploadDocumentToCloudinary, deleteRawFromCloudinary } = require('../config/cloudinary');
const SchoolProfile = require('../models/SchoolProfile');
const {
  reassignClassSections,
  backfillClassRollNumbersIfNeeded,
} = require('../utils/assignClassRollNumbers');
const {
  formatParentNameWithHonorific,
  ensureParentNameHonorificRule,
  backfillParentNameHonorificsIfNeeded,
} = require('../utils/parentNameHonorifics');
const {
  normalizeSectionKey,
  getSectionDisplayName,
  getCanonicalSectionName,
  resolveSectionAgainstAllowed,
  normalizeAllowedSections,
  SECTION_CATALOG,
} = require('../utils/sectionMetadata');

const STUDENT_TEMPLATE_COLUMNS = [
  {
    key: 'serialNo',
    label: 'Sr. No.',
    required: false,
    ignored: true,
    aliases: ['SR NO', 'SR. NO', 'S NO', 'SERIAL NO', 'SERIAL NUMBER'],
  },
  {
    key: 'rollNumber',
    label: 'Admission No.',
    required: true,
    aliases: ['ADMISSION NO', 'ADMISSION NUMBER', 'ROLL NUMBER', 'ROLL NO', 'ROLL NO.'],
  },
  {
    key: 'name',
    label: 'Student Name',
    required: true,
    aliases: ['STUDENT NAME', 'NAME'],
  },
  {
    key: 'class',
    label: 'Class',
    required: true,
    aliases: ['CLASS', 'CLASS NAME'],
  },
  {
    key: 'section',
    label: 'Section',
    required: true,
    aliases: ['SECTION', 'SEC'],
  },
  {
    key: 'fatherName',
    label: 'Father Name',
    required: true,
    aliases: ['FATHER NAME', "FATHER'S NAME"],
  },
  {
    key: 'motherName',
    label: 'Mother Name',
    required: false,
    aliases: ['MOTHER NAME', "MOTHER'S NAME"],
  },
  {
    key: 'dateOfBirth',
    label: 'DOB',
    required: true,
    aliases: ['DOB', 'DATE OF BIRTH', 'D.O.B', 'D.O.B.'],
  },
  {
    key: 'gender',
    label: 'Gender',
    required: true,
    aliases: ['GENDER', 'SEX'],
  },
  {
    key: 'house',
    label: 'House',
    required: false,
    aliases: ['HOUSE', 'HOUSE NAME'],
  },
  {
    key: 'busNo',
    label: 'Bus No',
    required: false,
    aliases: ['BUS NO', 'BUS NO.', 'BUS NUMBER', 'BUS'],
  },
  {
    key: 'bloodGroup',
    label: 'Blood Group',
    required: false,
    aliases: ['BLOOD GROUP', 'BLOODGROUP', 'B.G.', 'BG'],
  },
  {
    key: 'category',
    label: 'Category',
    required: true,
    aliases: ['CATEGORY', 'CASTE CATEGORY'],
  },
  {
    key: 'phone',
    label: 'Mobile Number',
    required: false,
    aliases: ['MOBILE NUMBER', 'MOBILE NO', 'MOBILE NO.', 'PHONE', 'STUDENT PHONE', 'GUARDIAN PHONE'],
  },
  {
    key: 'penNumber',
    label: 'PEN No.',
    required: false,
    aliases: ['PEN NO', 'PEN NO.', 'PEN NUMBER', 'PEN'],
  },
  {
    key: 'addressText',
    label: 'Address',
    required: false,
    aliases: ['ADDRESS', 'FULL ADDRESS', 'STREET', 'STREET ADDRESS'],
  },
];

const BLOOD_GROUP_VALUES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const normalizeHeaderLabel = (value) => (
  normalizeString(value)
    .toUpperCase()
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

/** Compare house labels ignoring case and optional trailing "House" (e.g. PLUTO ≡ Pluto House). */
const normalizeHouseMatchKey = (value) => (
  normalizeHeaderLabel(value)
    .replace(/\bHOUSES?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

/** Store people/place names as Title Case: "JOHN DOE" → "John Doe". */
const toTitleCaseName = (value) => {
  const text = normalizeString(value).replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text
    .toLowerCase()
    .split(' ')
    .map((word) => (word ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : ''))
    .join(' ');
};

const normalizeBloodGroupValue = (value) => {
  const raw = normalizeString(value).toUpperCase().replace(/\s+/g, '');
  if (!raw) return '';
  const match = BLOOD_GROUP_VALUES.find((item) => item === raw);
  if (match) return match;
  // Accept forms like "A POSITIVE" / "AB NEG"
  const letterMatch = raw.match(/^(A|B|AB|O)(POS|POSITIVE|\+|NEG|NEGATIVE|-)?$/);
  if (!letterMatch) return '';
  const sign = ['NEG', 'NEGATIVE', '-'].includes(letterMatch[2] || '') ? '-' : '+';
  const candidate = `${letterMatch[1]}${sign}`;
  return BLOOD_GROUP_VALUES.includes(candidate) ? candidate : '';
};

const parseAddressText = (value) => {
  const addressText = normalizeString(value).replace(/\s+/g, ' ');
  if (!addressText) {
    return {
      street: '',
      city: '',
      state: '',
      pincode: '',
    };
  }

  const pincodeMatch = addressText.match(/\b(\d{6})\b/);
  const pincode = pincodeMatch ? pincodeMatch[1] : '';
  const withoutPincode = pincode
    ? addressText.replace(pincodeMatch[0], ' ').replace(/\s+/g, ' ').trim()
    : addressText;
  const parts = withoutPincode.split(',').map((part) => part.trim()).filter(Boolean);

  if (parts.length >= 3) {
    return {
      street: parts.slice(0, -2).join(', ').slice(0, 200),
      city: parts[parts.length - 2].slice(0, 50),
      state: parts[parts.length - 1].slice(0, 50),
      pincode,
    };
  }

  return {
    street: addressText.slice(0, 200),
    city: '',
    state: '',
    pincode,
  };
};

const normalizeString = (value) => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object' && value !== null && 'text' in value) {
    return normalizeString(value.text);
  }
  return String(value).trim();
};

const escapeCsvCell = (value) => {
  const stringValue = normalizeString(value).replace(/"/g, '""');
  return /[",\n]/.test(stringValue) ? `"${stringValue}"` : stringValue;
};

const hasAnyNonEmptyValue = (rowValues) => (
  Object.values(rowValues).some((value) => normalizeString(value) !== '')
);

const parseCsvBuffer = (buffer) => {
  const rows = [];
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  let currentCell = '';
  let currentRow = [];
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentCell += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (!insideQuotes && char === ',') {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if (!insideQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentCell = '';
      currentRow = [];
      continue;
    }

    currentCell += char;
  }

  if (currentCell !== '' || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
};

const getOrdinalSuffix = (value) => {
  const remainderTen = value % 10;
  const remainderHundred = value % 100;
  if (remainderTen === 1 && remainderHundred !== 11) return 'st';
  if (remainderTen === 2 && remainderHundred !== 12) return 'nd';
  if (remainderTen === 3 && remainderHundred !== 13) return 'rd';
  return 'th';
};

const ROMAN_CLASS_TO_NUMBER = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
  xi: 11,
  xii: 12,
};

const normalizeClassValue = (value) => {
  const raw = normalizeString(value);
  if (!raw) return '';

  // Strip common prefixes/punctuation: "Class IV", "Cls-10", "Std. VII"
  const normalized = raw
    .toLowerCase()
    .replace(/[._\-_/\\]+/g, ' ')
    .replace(/\b(?:class|cls|std|standard|grade)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return '';

  const romanMatch = normalized.match(/^(i{1,3}|iv|vi{0,3}|ix|xi{0,2}|x)$/i);
  if (romanMatch) {
    const classNumber = ROMAN_CLASS_TO_NUMBER[romanMatch[1].toLowerCase()];
    if (classNumber) {
      return `${classNumber}${getOrdinalSuffix(classNumber)}`;
    }
  }

  const numericMatch = normalized.match(/^(\d+)(?:st|nd|rd|th)?$/i);
  if (numericMatch) {
    const classNumber = Number.parseInt(numericMatch[1], 10);
    if (Number.isFinite(classNumber) && classNumber > 0 && classNumber <= 12) {
      return `${classNumber}${getOrdinalSuffix(classNumber)}`;
    }
  }

  // Already canonical like "4th" / "10th"
  const ordinalMatch = normalized.match(/^(\d+)(st|nd|rd|th)$/i);
  if (ordinalMatch) {
    const classNumber = Number.parseInt(ordinalMatch[1], 10);
    if (Number.isFinite(classNumber) && classNumber > 0 && classNumber <= 12) {
      return `${classNumber}${getOrdinalSuffix(classNumber)}`;
    }
  }

  return raw;
};

const normalizeGenderValue = (value) => {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) return 'Unspecified';
  if (['boy', 'male', 'm'].includes(normalized)) return 'Boy';
  if (['girl', 'female', 'f'].includes(normalized)) return 'Girl';
  if (['other', 'o'].includes(normalized)) return 'Other';
  if (['unspecified', 'na', 'n/a', ''].includes(normalized)) return 'Unspecified';
  return normalizeString(value);
};

const normalizeCategoryValue = (value) => {
  const normalized = normalizeString(value).toUpperCase();
  const categoryMap = {
    GENERAL: 'General',
    OBC: 'OBC',
    SC: 'SC',
    ST: 'ST',
    EWS: 'EWS',
  };
  return categoryMap[normalized] || normalizeString(value);
};

const normalizeSectionValue = (value) => normalizeString(value).replace(/\s+/g, ' ');
const escapeRegexValue = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildClassSectionMatrixLookup = (stateDoc) => {
  const matrixClasses = Array.isArray(stateDoc?.matrixClasses) ? stateDoc.matrixClasses : [];
  const matrixSections = Array.isArray(stateDoc?.matrixSections) ? stateDoc.matrixSections : [];
  const matrixSelection = stateDoc?.matrixSelection || {};

  const sectionNameById = new Map(
    matrixSections
      .map((section) => [String(section?.id || '').trim(), normalizeSectionValue(section?.name)])
      .filter(([id, name]) => id && name)
  );

  const sectionsByClass = new Map();
  matrixClasses.forEach((item) => {
    const classId = String(item?.id || '').trim();
    const className = normalizeClassValue(item?.name);
    if (!classId || !className) return;

    const selectedSectionMap = matrixSelection[classId] || {};
    const sectionNames = Object.entries(selectedSectionMap)
      .filter(([, checked]) => Boolean(checked))
      .map(([sectionId]) => sectionNameById.get(String(sectionId).trim()) || '')
      .map((name) => normalizeSectionValue(name))
      .filter(Boolean);

    sectionsByClass.set(className, normalizeAllowedSections(sectionNames));
  });

  return sectionsByClass;
};

const getClassSectionLookupFromRequest = async (req) => {
  const TimetableStateModel = req.models?.TimetableState;
  if (!TimetableStateModel) return new Map();

  const filter = req.academicSession ? { academicSession: req.academicSession } : { academicSession: null };
  const latestTimetableState = await TimetableStateModel.findOne(filter)
    .sort({ updatedAt: -1 })
    .select('matrixClasses matrixSections matrixSelection')
    .lean();

  return buildClassSectionMatrixLookup(latestTimetableState);
};

const resolveSectionAgainstMatrix = ({ className, section, classSectionLookup }) => {
  const normalizedClass = normalizeClassValue(className);
  const allowedSections = classSectionLookup.get(normalizedClass) || [];

  if (allowedSections.length === 0) {
    const fallback = getCanonicalSectionName(normalizeSectionValue(section));
    if (!fallback) {
      return {
        section: '',
        error: `Configure sections for class "${normalizedClass}" in Class Section Matrix before adding students.`,
      };
    }
    return { section: fallback, error: null };
  }

  return resolveSectionAgainstAllowed(section, allowedSections);
};

const listActiveActivityHouses = async (req) => {
  const ActivityHouseModel = req.models?.ActivityHouse;
  if (!ActivityHouseModel) return [];

  return ActivityHouseModel.find({ isActive: { $ne: false } })
    .select('_id name color incharge logo tagline motto')
    .sort({ name: 1 })
    .lean();
};

const resolveStudentHouseAssignment = async (req, { house, houseId } = {}) => {
  const houses = await listActiveActivityHouses(req);
  return resolveHouseAgainstCatalog(houses, { house, houseId });
};

const resolveHouseAgainstCatalog = (houses = [], { house, houseId } = {}) => {
  const houseNameInput = optionalText(house);
  const houseIdInput = optionalText(houseId);

  if (!houseNameInput && !houseIdInput) {
    return { house: undefined, houseId: null, error: null };
  }

  if (!Array.isArray(houses) || houses.length === 0) {
    return {
      house: undefined,
      houseId: null,
      error: 'No houses found in ACTVT. Add houses under ACTVT → Houses before assigning a student house.',
    };
  }

  let matched = null;
  if (houseIdInput) {
    matched = houses.find((item) => String(item._id) === String(houseIdInput)) || null;
    if (!matched) {
      return {
        house: undefined,
        houseId: null,
        error: 'Selected house is not available in ACTVT Houses.',
      };
    }
  } else if (houseNameInput) {
    const key = normalizeHouseMatchKey(houseNameInput);
    matched = houses.find((item) => normalizeHouseMatchKey(item.name) === key) || null;

    // Fallback: allow short forms / partials when unique (e.g. "Sun" → "Sun House")
    if (!matched && key.length >= 2) {
      const partialMatches = houses.filter((item) => {
        const catalogKey = normalizeHouseMatchKey(item.name);
        return catalogKey === key
          || catalogKey.startsWith(key)
          || key.startsWith(catalogKey);
      });
      if (partialMatches.length === 1) {
        matched = partialMatches[0];
      }
    }

    if (!matched) {
      const available = houses.map((item) => item.name).join(', ');
      return {
        house: undefined,
        houseId: null,
        error: `House "${houseNameInput}" is not configured in ACTVT Houses. Available: ${available}`,
      };
    }
  }

  return {
    house: matched.name,
    houseId: matched._id,
    error: null,
  };
};

const buildTemplateReferenceRows = (classSectionLookup) => {
  const rows = [];
  Array.from(classSectionLookup.entries())
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }))
    .forEach(([className, sections]) => {
      sections.forEach((sectionName) => {
        rows.push([className, getSectionDisplayName(sectionName)]);
      });
    });
  return rows;
};

const pickTemplateSampleRow = (classSectionLookup) => {
  const firstEntry = Array.from(classSectionLookup.entries())
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }))[0];

  if (!firstEntry) {
    return { className: '10th', sectionName: 'Rose' };
  }

  const [className, sections] = firstEntry;
  return {
    className,
    sectionName: sections[0] || 'Rose',
  };
};

const syncLinkedStudentRecords = async (req, previousStudent, updatedStudent) => {
  const CandidateModel = req.models?.Candidate;
  const Form66Model = req.models?.Form66;

  const previousRollNumber = normalizeString(previousStudent?.rollNumber).toUpperCase();
  const nextRollNumber = normalizeString(updatedStudent?.rollNumber).toUpperCase();
  if (!previousRollNumber || !nextRollNumber) return;

  const commonUpdate = {
    name: normalizeString(updatedStudent?.name),
    class: normalizeString(updatedStudent?.class),
    fatherName: normalizeString(updatedStudent?.fatherName),
    motherName: normalizeString(updatedStudent?.motherName),
    category: normalizeString(updatedStudent?.category),
    dateOfBirth: updatedStudent?.dateOfBirth || null,
  };

  if (CandidateModel) {
    const candidateDoc = await CandidateModel.findOne({ rollNumber: previousRollNumber });
    if (candidateDoc) {
      candidateDoc.rollNumber = nextRollNumber;
      candidateDoc.name = commonUpdate.name;
      candidateDoc.class = commonUpdate.class;
      candidateDoc.fatherName = commonUpdate.fatherName;
      candidateDoc.motherName = commonUpdate.motherName;
      candidateDoc.category = commonUpdate.category;
      candidateDoc.dateOfBirth = commonUpdate.dateOfBirth;
      await candidateDoc.save();
    }
  }

  if (Form66Model) {
    const form66Filter = previousRollNumber === nextRollNumber
      ? { rollNo: nextRollNumber }
      : { rollNo: { $in: [previousRollNumber, nextRollNumber] } };

    await Form66Model.updateMany(
      form66Filter,
      {
        $set: {
          rollNo: nextRollNumber,
          candidateName: commonUpdate.name,
          class: commonUpdate.class,
          fatherName: commonUpdate.fatherName,
          motherName: commonUpdate.motherName,
          category: commonUpdate.category,
          dateOfBirth: commonUpdate.dateOfBirth,
        }
      }
    );
  }
};

const normalizeDateValue = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const normalized = normalizeString(value);
  if (!normalized) return '';

  const slashMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, dd, mm, yyyy] = slashMatch;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return normalized;
};

const optionalText = (value) => {
  const normalized = normalizeString(value);
  return normalized ? normalized : undefined;
};

const isValidDateString = (value) => {
  if (!value) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
};

const buildGeneratedImportRollNumber = (rowNumber) => {
  const timestampPart = Date.now().toString(36).toUpperCase();
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `IMP${timestampPart}${rowNumber}${randomPart}`;
};

const isBlankImportText = (value) => normalizeString(value) === '';

const resolveImportSectionForClass = (className, sectionValue, classSectionLookup, fallbackNotes) => {
  const allowedSections = classSectionLookup.get(className) || [];
  const resolvedImportSection = resolveSectionAgainstAllowed(sectionValue, allowedSections);

  if (allowedSections.length > 0) {
    if (!normalizeSectionKey(sectionValue)) {
      if (fallbackNotes) fallbackNotes.push('section');
      return { section: allowedSections[0] };
    }
    if (resolvedImportSection.error) {
      return { error: resolvedImportSection.error };
    }
    return { section: resolvedImportSection.section };
  }

  if (!normalizeSectionKey(sectionValue)) {
    return {
      error: `Section is required. Configure sections in Class Section Matrix for class "${className}".`,
    };
  }

  return { section: getCanonicalSectionName(sectionValue) };
};

const getAllowedLabelsForColumn = (column) => [column.label, ...(column.aliases || [])];

const buildTemplateHeaderLookup = () => {
  const lookup = new Map();
  STUDENT_TEMPLATE_COLUMNS.forEach((column) => {
    getAllowedLabelsForColumn(column).forEach((label) => {
      const key = normalizeHeaderLabel(label);
      if (!key || lookup.has(key)) return;
      lookup.set(key, column.key);
    });
  });
  return lookup;
};

const readWorksheetHeaderCells = (worksheet) => {
  const headerRow = worksheet.getRow(1);
  const headers = [];
  const maxColumns = Math.max(headerRow.cellCount || 0, STUDENT_TEMPLATE_COLUMNS.length);
  for (let index = 1; index <= maxColumns; index += 1) {
    headers.push(normalizeString(headerRow.getCell(index).value));
  }
  while (headers.length > 0 && !headers[headers.length - 1]) {
    headers.pop();
  }
  return headers;
};

// @desc    Get all students
// @route   GET /api/students
// @access  Private
const STUDENT_LIST_FIELD_WHITELIST = new Set([
  '_id',
  'rollNumber',
  'classRollNo',
  'name',
  'class',
  'section',
  'fatherName',
  'motherName',
  'profileImage',
  'gender',
  'email',
  'phone',
  'house',
  'houseId',
  'busNo',
  'bloodGroup',
  'isActive',
  'dateOfBirth',
  'category',
  'createdAt',
  'updatedAt',
]);

const LITE_STUDENT_FIELDS = [
  '_id',
  'rollNumber',
  'classRollNo',
  'name',
  'class',
  'section',
  'gender',
  'fatherName',
  'motherName',
  'profileImage',
  'house',
  'houseId',
  'phone',
].join(' ');

const getStudents = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit), 10) || 100));
  const skip = (page - 1) * limit;
  const { 
    search, 
    class: className, 
    section, 
    subject, 
    isActive, 
    category,
    sort = '-createdAt',
    lite,
    populate,
    skipBackfill,
    fields,
  } = req.query;

  const isLite = String(lite) === 'true';
  const shouldPopulate = !isLite && String(populate) !== 'false';
  const shouldSkipBackfill = isLite || String(skipBackfill) === 'true';

  // Build filter object
  const filter = {};

  if (search) {
    // Keep search $or nested so it does not collide with academic-session $or.
    filter.$and = [
      {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { rollNumber: { $regex: search, $options: 'i' } },
          { fatherName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
        ],
      },
    ];
  }

  if (className) {
    filter.class = { $regex: `^${escapeRegexValue(String(className).trim())}$`, $options: 'i' };
  }

  if (section) {
    filter.section = { $regex: `^${escapeRegexValue(normalizeSectionValue(section))}$`, $options: 'i' };
  }

  if (subject) {
    filter.subjects = subject;
  }

  if (isActive !== undefined) {
    filter.isActive = isActive === 'true';
  }

  if (category) {
    filter.category = category;
  }

  const scopedFilter = withScope(filter, await buildSectionFilter(req, 'stdnt.students.read'));

  const StudentModel = req.models?.Student || Student;

  // One-time Mr./Mrs. rewrite for already-imported students (cheap no-op after first run).
  await backfillParentNameHonorificsIfNeeded(
    req.models?.SchoolProfile || SchoolProfile,
    StudentModel
  );

  if (!shouldSkipBackfill) {
    await backfillClassRollNumbersIfNeeded(req.models?.SchoolProfile || SchoolProfile, StudentModel);
  }

  const [totalCount, students] = await Promise.all([
    StudentModel.countDocuments(scopedFilter),
    (() => {
      let query = StudentModel.find(scopedFilter);

      if (isLite) {
        query = query.select(LITE_STUDENT_FIELDS);
      } else if (fields) {
        const selected = String(fields)
          .split(',')
          .map((field) => field.trim())
          .filter((field) => STUDENT_LIST_FIELD_WHITELIST.has(field));
        if (selected.length > 0) {
          query = query.select(selected.join(' '));
        }
      }

      if (shouldPopulate) {
        query = query.populate('subjects', 'name code type');
      }

      return query.sort(sort).skip(skip).limit(limit).lean();
    })(),
  ]);

  const { pagination } = buildPaginationResponse(students, totalCount, page, limit);

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, SUCCESS_MESSAGES.FETCHED, {
      students,
      pagination
    })
  );
});

// @desc    Get single student
// @route   GET /api/students/:id
// @access  Private
const getStudent = asyncHandler(async (req, res) => {
  const StudentModel = req.models?.Student || Student;
  const scope = await buildSectionFilter(req, 'stdnt.students.read');
  const student = await StudentModel.findOne(withScope({ _id: req.params.id }, scope))
    .populate('subjects', 'name code type description');

  if (!student) {
    return res.status(HTTP_STATUS.NOT_FOUND).json(
      generateResponse(false, ERROR_MESSAGES.NOT_FOUND)
    );
  }

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, SUCCESS_MESSAGES.FETCHED, student)
  );
});

// @desc    Create new student
// @route   POST /api/students
// @access  Private
const createStudent = asyncHandler(async (req, res) => {
  const {
    rollNumber,
    name,
    email,
    phone,
    penNumber,
    house,
    busNo,
    class: className,
    section,
    gender,
    subjects,
    fatherName,
    motherName,
    guardianName,
    guardianEmail,
    guardianPhone,
    address,
    dateOfBirth,
    admissionDate,
    aadharNumber,
    category,
    religion,
    nationality,
    previousSchool,
    medicalInfo,
    notes,
    houseId,
  } = req.body;
  const normalizedEmail = optionalText(email)?.toLowerCase();
  const normalizedClass = normalizeClassValue(className);
  const classSectionLookup = await getClassSectionLookupFromRequest(req);
  const resolvedSection = resolveSectionAgainstMatrix({
    className: normalizedClass,
    section,
    classSectionLookup
  });
  if (resolvedSection.error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json(
      generateResponse(false, resolvedSection.error)
    );
  }

  const resolvedHouse = await resolveStudentHouseAssignment(req, { house, houseId });
  if (resolvedHouse.error) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json(
      generateResponse(false, resolvedHouse.error)
    );
  }

  // Check if roll number already exists
  const existingStudent = await Student.findOne({ rollNumber });
  if (existingStudent) {
    return res.status(HTTP_STATUS.CONFLICT).json(
      generateResponse(false, 'Student with this roll number already exists')
    );
  }

  // Check if email exists (if provided)
  if (normalizedEmail) {
    const existingEmail = await Student.findOne({ email: normalizedEmail });
    if (existingEmail) {
      return res.status(HTTP_STATUS.CONFLICT).json(
        generateResponse(false, 'Student with this email already exists')
      );
    }
  }

  // Validate subjects exist
  if (subjects && subjects.length > 0) {
    const validSubjects = await Subject.find({ _id: { $in: subjects } });
    if (validSubjects.length !== subjects.length) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        generateResponse(false, 'One or more subjects are invalid')
      );
    }
  }

  // Create student
  const student = await Student.create({
    rollNumber,
    name: toTitleCaseName(name) || name,
    email: normalizedEmail,
    phone: optionalText(phone),
    penNumber: optionalText(penNumber),
    house: resolvedHouse.house,
    houseId: resolvedHouse.houseId,
    busNo: optionalText(busNo),
    class: normalizedClass,
    section: resolvedSection.section,
    gender: normalizeGenderValue(gender),
    subjects: subjects || [],
    fatherName: toTitleCaseName(fatherName) || fatherName,
    motherName: toTitleCaseName(motherName) || motherName,
    guardianName: toTitleCaseName(guardianName) || optionalText(guardianName),
    guardianEmail: optionalText(guardianEmail)?.toLowerCase(),
    guardianPhone,
    address,
    dateOfBirth,
    admissionDate,
    aadharNumber: optionalText(aadharNumber),
    category,
    religion: toTitleCaseName(religion) || optionalText(religion),
    nationality: toTitleCaseName(nationality) || optionalText(nationality) || 'Indian',
    previousSchool,
    medicalInfo,
    notes: optionalText(notes)
  });

  // Populate subjects before sending response
  await student.populate('subjects', 'name code type');
  await reassignClassSections(req.models?.Student || Student, [
    { className: student.class, section: student.section },
  ]);
  const numberedStudent = await Student.findById(student._id).populate('subjects', 'name code type');

  res.status(HTTP_STATUS.CREATED).json(
    generateResponse(true, SUCCESS_MESSAGES.CREATED, numberedStudent)
  );
});

// @desc    Update student
// @route   PUT /api/students/:id
// @access  Private
const updateStudent = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = { ...req.body };
  const classSectionLookup = await getClassSectionLookupFromRequest(req);

  // Check if student exists
  const existingStudent = await Student.findById(id);
  if (!existingStudent) {
    return res.status(HTTP_STATUS.NOT_FOUND).json(
      generateResponse(false, ERROR_MESSAGES.NOT_FOUND)
    );
  }

  // Check if roll number is being changed and if it already exists
  if (updateData.rollNumber && updateData.rollNumber !== existingStudent.rollNumber) {
    const duplicateRollNumber = await Student.findOne({ 
      rollNumber: updateData.rollNumber,
      _id: { $ne: id }
    });
    if (duplicateRollNumber) {
      return res.status(HTTP_STATUS.CONFLICT).json(
        generateResponse(false, 'Student with this roll number already exists')
      );
    }
  }

  // Check if email is being changed and if it already exists
  const normalizedUpdateEmail = optionalText(updateData.email)?.toLowerCase();
  if (normalizedUpdateEmail && normalizedUpdateEmail !== existingStudent.email) {
    const duplicateEmail = await Student.findOne({ 
      email: normalizedUpdateEmail,
      _id: { $ne: id }
    });
    if (duplicateEmail) {
      return res.status(HTTP_STATUS.CONFLICT).json(
        generateResponse(false, 'Student with this email already exists')
      );
    }
  }

  // Validate subjects if being updated
  if (updateData.subjects && updateData.subjects.length > 0) {
    const validSubjects = await Subject.find({ _id: { $in: updateData.subjects } });
    if (validSubjects.length !== updateData.subjects.length) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        generateResponse(false, 'One or more subjects are invalid')
      );
    }
  }

  // Normalize and validate section text against class-section matrix if configured.
  if (updateData.section) {
    const classNameForValidation = normalizeClassValue(updateData.class || existingStudent.class);
    const resolvedSection = resolveSectionAgainstMatrix({
      className: classNameForValidation,
      section: updateData.section,
      classSectionLookup
    });
    if (resolvedSection.error) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        generateResponse(false, resolvedSection.error)
      );
    }
    updateData.section = resolvedSection.section;
  }

  if ('house' in updateData || 'houseId' in updateData) {
    const resolvedHouse = await resolveStudentHouseAssignment(req, {
      house: updateData.house,
      houseId: updateData.houseId,
    });
    if (resolvedHouse.error) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        generateResponse(false, resolvedHouse.error)
      );
    }
    updateData.house = resolvedHouse.house;
    updateData.houseId = resolvedHouse.houseId;
  }

  if ('email' in updateData) updateData.email = normalizedUpdateEmail;
  if ('phone' in updateData) updateData.phone = optionalText(updateData.phone);
  if ('penNumber' in updateData) updateData.penNumber = optionalText(updateData.penNumber);
  if ('aadharNumber' in updateData) updateData.aadharNumber = optionalText(updateData.aadharNumber);
  if ('name' in updateData) updateData.name = toTitleCaseName(updateData.name) || updateData.name;
  if ('fatherName' in updateData) {
    updateData.fatherName = toTitleCaseName(updateData.fatherName) || updateData.fatherName;
  }
  if ('motherName' in updateData) {
    updateData.motherName = toTitleCaseName(updateData.motherName) || updateData.motherName;
  }
  if ('religion' in updateData) {
    updateData.religion = toTitleCaseName(updateData.religion) || optionalText(updateData.religion);
  }
  if ('nationality' in updateData) {
    updateData.nationality = toTitleCaseName(updateData.nationality)
      || optionalText(updateData.nationality)
      || 'Indian';
  }
  if ('notes' in updateData) updateData.notes = optionalText(updateData.notes);
  if ('gender' in updateData) updateData.gender = normalizeGenderValue(updateData.gender);
  delete updateData.classRollNo;
  if (updateData.isActive === false) {
    updateData.classRollNo = null;
  }

  const previousClass = existingStudent.class;
  const previousSection = existingStudent.section;

  // Update student
  const student = await Student.findByIdAndUpdate(
    id,
    updateData,
    {
      new: true,
      runValidators: true
    }
  ).populate('subjects', 'name code type');

  await syncLinkedStudentRecords(req, existingStudent, student);
  await reassignClassSections(req.models?.Student || Student, [
    { className: previousClass, section: previousSection },
    { className: student.class, section: student.section },
  ]);
  const numberedStudent = await Student.findById(student._id).populate('subjects', 'name code type');

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, SUCCESS_MESSAGES.UPDATED, numberedStudent)
  );
});

const collectCloudinaryCleanupTasks = (students = []) => {
  const tasks = [];

  students.forEach((student) => {
    if (Array.isArray(student.documents)) {
      student.documents.forEach((doc) => {
        if (!doc?.cloudinaryPublicId) return;
        tasks.push(
          deleteRawFromCloudinary(doc.cloudinaryPublicId).catch((error) => {
            console.error(`Failed to delete document from Cloudinary: ${doc.cloudinaryPublicId}`, error);
          })
        );
      });
    }

    if (student.profileImage) {
      const publicId = extractPublicId(student.profileImage);
      if (!publicId) return;
      tasks.push(
        deleteFromCloudinary(publicId).catch((error) => {
          console.error(`Failed to delete profile image from Cloudinary: ${publicId}`, error);
        })
      );
    }
  });

  return tasks;
};

const cleanupStudentCloudinaryAssets = async (students = []) => {
  const tasks = collectCloudinaryCleanupTasks(students);
  if (tasks.length === 0) return;
  await Promise.allSettled(tasks);
};

// @desc    Delete student
// @route   DELETE /api/students/:id
// @access  Private
const deleteStudent = asyncHandler(async (req, res) => {
  const StudentModel = req.models?.Student || Student;
  const student = await StudentModel.findById(req.params.id);

  if (!student) {
    return res.status(HTTP_STATUS.NOT_FOUND).json(
      generateResponse(false, ERROR_MESSAGES.NOT_FOUND)
    );
  }

  const className = student.class;
  const section = student.section;
  const cloudinarySnapshot = {
    documents: student.documents,
    profileImage: student.profileImage,
  };

  await student.deleteOne();
  // Cloudinary cleanup is best-effort and should not block the delete response.
  cleanupStudentCloudinaryAssets([cloudinarySnapshot]).catch((error) => {
    console.error('Background Cloudinary cleanup failed after student delete:', error);
  });
  await reassignClassSections(StudentModel, [{ className, section }]);

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, SUCCESS_MESSAGES.DELETED)
  );
});

// @desc    Bulk delete students
// @route   POST /api/students/bulk-delete
// @access  Private
const bulkDeleteStudents = asyncHandler(async (req, res) => {
  const StudentModel = req.models?.Student || Student;
  const requestedIds = Array.from(
    new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map((id) => String(id || '').trim()).filter(Boolean))
  );

  if (requestedIds.length === 0) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json(
      generateResponse(false, 'At least one student id is required')
    );
  }

  const students = await StudentModel.find({ _id: { $in: requestedIds } })
    .select('_id class section documents profileImage')
    .lean();

  const deletedIds = students.map((student) => String(student._id));
  const deletedIdSet = new Set(deletedIds);
  const notFoundIds = requestedIds.filter((id) => !deletedIdSet.has(id));

  if (deletedIds.length === 0) {
    return res.status(HTTP_STATUS.NOT_FOUND).json(
      generateResponse(false, 'No matching students found to delete', {
        deletedIds: [],
        notFoundIds,
        deletedCount: 0,
      })
    );
  }

  await StudentModel.deleteMany({ _id: { $in: deletedIds } });

  cleanupStudentCloudinaryAssets(students).catch((error) => {
    console.error('Background Cloudinary cleanup failed after bulk student delete:', error);
  });

  await reassignClassSections(
    StudentModel,
    students.map((student) => ({ className: student.class, section: student.section }))
  );

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, `${deletedIds.length} student record${deletedIds.length === 1 ? '' : 's'} deleted`, {
      deletedIds,
      notFoundIds,
      deletedCount: deletedIds.length,
    })
  );
});

// @desc    Get students by class
// @route   GET /api/students/class/:className
// @access  Private
const getStudentsByClass = asyncHandler(async (req, res) => {
  const { className } = req.params;
  const { section, isActive = true } = req.query;

  const filter = { 
    class: className,
    isActive: isActive === 'true'
  };

  if (section) {
    filter.section = { $regex: `^${escapeRegexValue(normalizeSectionValue(section))}$`, $options: 'i' };
  }

  const students = await Student.find(withScope(filter, await buildSectionFilter(req, 'stdnt.students.read')))
    .populate('subjects', 'name code type')
    .sort('section rollNumber')
    .lean();

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, SUCCESS_MESSAGES.FETCHED, students)
  );
});

// @desc    Get students by class and section
// @route   GET /api/students/class/:className/section/:section
// @access  Private
const getStudentsByClassSection = asyncHandler(async (req, res) => {
  const { className, section } = req.params;
  const { isActive = true } = req.query;

  const students = await Student.find(withScope({
    class: className,
    section: { $regex: `^${escapeRegexValue(normalizeSectionValue(section))}$`, $options: 'i' },
    isActive: isActive === 'true'
  }, await buildSectionFilter(req, 'stdnt.students.read')))
    .populate('subjects', 'name code type')
    .sort('rollNumber')
    .lean();

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, SUCCESS_MESSAGES.FETCHED, students)
  );
});

// @desc    Get students by subject
// @route   GET /api/students/subject/:subjectId
// @access  Private
const getStudentsBySubject = asyncHandler(async (req, res) => {
  const { subjectId } = req.params;
  const { class: className, section, isActive = true } = req.query;

  const filter = { 
    subjects: subjectId,
    isActive: isActive === 'true'
  };

  if (className) {
    filter.class = className;
  }

  if (section) {
    filter.section = { $regex: `^${escapeRegexValue(normalizeSectionValue(section))}$`, $options: 'i' };
  }

  const students = await Student.find(withScope(filter, await buildSectionFilter(req, 'stdnt.students.read')))
    .populate('subjects', 'name code type')
    .sort('class section rollNumber')
    .lean();

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, SUCCESS_MESSAGES.FETCHED, students)
  );
});

// @desc    Assign subjects to student
// @route   POST /api/students/:id/subjects
// @access  Private
const assignSubjects = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { subjectIds } = req.body;

  const student = await Student.findById(id);
  if (!student) {
    return res.status(HTTP_STATUS.NOT_FOUND).json(
      generateResponse(false, ERROR_MESSAGES.NOT_FOUND)
    );
  }

  // Validate subjects exist
  const validSubjects = await Subject.find({ _id: { $in: subjectIds } });
  if (validSubjects.length !== subjectIds.length) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json(
      generateResponse(false, 'One or more subjects are invalid')
    );
  }

  await student.assignSubjects(subjectIds);
  await student.populate('subjects', 'name code type');

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, 'Subjects assigned successfully', student)
  );
});

// @desc    Remove subjects from student
// @route   DELETE /api/students/:id/subjects
// @access  Private
const removeSubjects = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { subjectIds } = req.body;

  const student = await Student.findById(id);
  if (!student) {
    return res.status(HTTP_STATUS.NOT_FOUND).json(
      generateResponse(false, ERROR_MESSAGES.NOT_FOUND)
    );
  }

  await student.removeSubjects(subjectIds);
  await student.populate('subjects', 'name code type');

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, 'Subjects removed successfully', student)
  );
});

// @desc    Get student statistics
// @route   GET /api/students/stats
// @access  Private
const getStudentStats = asyncHandler(async (req, res) => {
  const StudentModel = req.models?.Student || Student;
  const stats = await StudentModel.getStats({
    className: req.query.class,
    section: req.query.section,
    lite: String(req.query.lite) === 'true',
  });

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, 'Student statistics fetched successfully', stats)
  );
});

// @desc    Generate next roll number
// @route   GET /api/students/next-roll-number
// @access  Private
const getNextRollNumber = asyncHandler(async (req, res) => {
  const { class: className, section } = req.query;

  if (!className || !section) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json(
      generateResponse(false, 'Class and section are required')
    );
  }

  // Get the latest student in the class and section
  const latestStudent = await Student.findOne({
    class: className,
    section: { $regex: `^${escapeRegexValue(normalizeSectionValue(section))}$`, $options: 'i' }
  }).sort({ rollNumber: -1 });

  let nextRollNumber;
  if (latestStudent) {
    // Extract number from roll number and increment
    const match = latestStudent.rollNumber.match(/(\d+)$/);
    if (match) {
      const currentNumber = parseInt(match[1]);
      const nextNumber = currentNumber + 1;
      const prefix = latestStudent.rollNumber.replace(/\d+$/, '');
      nextRollNumber = `${prefix}${nextNumber.toString().padStart(match[1].length, '0')}`;
    } else {
      // If no number found, create new format
      nextRollNumber = `${className}${normalizeSectionValue(section).replace(/\s+/g, '').toUpperCase()}001`;
    }
  } else {
    // First student in this class and section
    nextRollNumber = `${className}${normalizeSectionValue(section).replace(/\s+/g, '').toUpperCase()}001`;
  }

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, 'Next roll number generated successfully', { rollNumber: nextRollNumber })
  );
});

// @desc    Bulk create students
// @route   POST /api/students/bulk
// @access  Private
const bulkCreateStudents = asyncHandler(async (req, res) => {
  const { students } = req.body;
  const classSectionLookup = await getClassSectionLookupFromRequest(req);

  if (!students || !Array.isArray(students) || students.length === 0) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json(
      generateResponse(false, 'Students array is required')
    );
  }

  const results = {
    successful: [],
    failed: [],
    total: students.length
  };

  for (let i = 0; i < students.length; i++) {
    try {
      const studentData = students[i];
      studentData.email = optionalText(studentData.email)?.toLowerCase();
      studentData.phone = optionalText(studentData.phone);
      studentData.penNumber = optionalText(studentData.penNumber);
      studentData.aadharNumber = optionalText(studentData.aadharNumber);
      studentData.religion = optionalText(studentData.religion);
      studentData.nationality = optionalText(studentData.nationality) || 'Indian';
      studentData.notes = optionalText(studentData.notes);
      
      // Check for duplicate roll number
      const existingStudent = await Student.findOne({ rollNumber: studentData.rollNumber });
      if (existingStudent) {
        results.failed.push({
          index: i,
          data: studentData,
          error: 'Student with this roll number already exists'
        });
        continue;
      }

      // Check for duplicate email if provided
      if (studentData.email) {
        const existingEmail = await Student.findOne({ email: studentData.email });
        if (existingEmail) {
          results.failed.push({
            index: i,
            data: studentData,
            error: 'Student with this email already exists'
          });
          continue;
        }
      }

      // Normalize section text.
      if (studentData.section) {
        const resolvedSection = resolveSectionAgainstMatrix({
          className: studentData.class,
          section: studentData.section,
          classSectionLookup
        });
        if (resolvedSection.error) {
          results.failed.push({
            index: i,
            data: studentData,
            error: resolvedSection.error
          });
          continue;
        }
        studentData.section = resolvedSection.section;
      }

      if (studentData.gender && !STUDENT_GENDERS.includes(studentData.gender)) {
        studentData.gender = normalizeGenderValue(studentData.gender);
      }

      // Create student
      const student = await Student.create(studentData);
      results.successful.push(student);

    } catch (error) {
      results.failed.push({
        index: i,
        data: students[i],
        error: error.message
      });
    }
  }

  const statusCode = results.failed.length === 0 ? HTTP_STATUS.CREATED : HTTP_STATUS.OK;
  const message = results.failed.length === 0 
    ? 'All students created successfully' 
    : `${results.successful.length} students created, ${results.failed.length} failed`;

  await reassignClassSections(
    req.models?.Student || Student,
    results.successful.map((row) => ({ className: row.class, section: row.section }))
  );

  res.status(statusCode).json(
    generateResponse(true, message, results)
  );
});

// @desc    Download students import template
// @route   GET /api/students/import-template
// @access  Private
const downloadStudentImportTemplate = asyncHandler(async (req, res) => {
  const headers = STUDENT_TEMPLATE_COLUMNS.map((column) => column.label);
  const format = String(req.query.format || 'xlsx').toLowerCase();
  const classSectionLookup = await getClassSectionLookupFromRequest(req);
  const sample = pickTemplateSampleRow(classSectionLookup);
  const activityHouses = await listActiveActivityHouses(req);
  const sampleHouseName = activityHouses[0]?.name || '';

  if (format === 'csv') {
    const csvContent = `${headers.map((header) => escapeCsvCell(header)).join(',')}\n`;
    const fileName = `students_template_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.status(HTTP_STATUS.OK).send(csvContent);
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Students');
  worksheet.addRow(headers);
  worksheet.getRow(1).font = { bold: true };
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.columns = headers.map((header) => ({
    width: Math.max(18, Math.min(28, header.length + 4))
  }));

  const sampleRow = [
    '1',
    '3361',
    'Aarav Sharma',
    sample.className,
    getSectionDisplayName(sample.sectionName),
    'Rajesh Sharma',
    'Sunita Sharma',
    '2010-04-15',
    'Boy',
    sampleHouseName,
    '12',
    'B+',
    'General',
    '9123456789',
    '123456789012',
    '12 MG Road, Delhi, Delhi 110001',
  ];
  worksheet.addRow(sampleRow);

  const sectionsSheet = workbook.addWorksheet('Class Sections');
  sectionsSheet.addRow(['CLASS', 'SECTION']);
  sectionsSheet.getRow(1).font = { bold: true };
  const referenceRows = buildTemplateReferenceRows(classSectionLookup);
  if (referenceRows.length > 0) {
    referenceRows.forEach((row) => sectionsSheet.addRow(row));
  } else {
    sectionsSheet.addRow(['Configure classes and sections in Class Section Matrix first', '']);
  }
  sectionsSheet.columns = [{ width: 16 }, { width: 22 }];

  const housesSheet = workbook.addWorksheet('Houses (ACTVT)');
  housesSheet.addRow(['HOUSE', 'TAGLINE', 'MOTTO', 'COLOUR']);
  housesSheet.getRow(1).font = { bold: true };
  if (activityHouses.length > 0) {
    activityHouses.forEach((house) => {
      housesSheet.addRow([house.name, house.tagline || '', house.motto || '', house.color || '']);
    });
  } else {
    housesSheet.addRow(['Add houses in ACTVT → Houses first', '', '', '']);
  }
  housesSheet.columns = [{ width: 22 }, { width: 28 }, { width: 28 }, { width: 16 }];

  const abbrevSheet = workbook.addWorksheet('Section Abbreviations');
  abbrevSheet.addRow(['DISPLAY NAME', 'ACCEPTED VALUES']);
  abbrevSheet.getRow(1).font = { bold: true };
  SECTION_CATALOG.forEach((entry) => {
    abbrevSheet.addRow([entry.displayName, entry.abbreviations.join(', ')]);
  });
  abbrevSheet.columns = [{ width: 18 }, { width: 48 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = `students_template_${new Date().toISOString().split('T')[0]}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  return res.status(HTTP_STATUS.OK).send(Buffer.from(buffer));
});

// @desc    Upload students from import template
// @route   POST /api/students/import-template/upload
// @access  Private
const uploadStudentsFromTemplate = asyncHandler(async (req, res) => {
  const StudentModel = req.models?.Student || Student;
  const TimetableStateModel = req.models?.TimetableState;

  if (!req.files || !req.files.file) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json(
      generateResponse(false, 'No file uploaded. Please upload a .csv or .xlsx file.')
    );
  }

  const file = req.files.file;
  const fileName = String(file.name || '').toLowerCase();
  const isXlsx = fileName.endsWith('.xlsx');
  const isCsv = fileName.endsWith('.csv');

  if (!isXlsx && !isCsv) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json(
      generateResponse(false, 'Only .csv or .xlsx files are supported for import.')
    );
  }

  const fileBuffer = file?.tempFilePath && fsSync.existsSync(file.tempFilePath)
    ? fsSync.readFileSync(file.tempFilePath)
    : file.data;

  const expectedHeaders = STUDENT_TEMPLATE_COLUMNS.map((column) => column.label);
  const headerToKey = buildTemplateHeaderLookup();

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
      receivedHeaders = (rows[0] || []).map((cell) => normalizeString(cell));
      while (receivedHeaders.length > 0 && !receivedHeaders[receivedHeaders.length - 1]) {
        receivedHeaders.pop();
      }
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

      receivedHeaders = readWorksheetHeaderCells(worksheet);
      dataRows = Array.from({ length: Math.max(0, worksheet.rowCount - 1) }, (_, index) => ({
        rowNumber: index + 2,
        valueAt: (cellIndex) => worksheet.getRow(index + 2).getCell(cellIndex + 1).value
      }));
    }
  } finally {
    if (file?.tempFilePath && fsSync.existsSync(file.tempFilePath)) {
      fsSync.unlinkSync(file.tempFilePath);
    }
  }

  const mappedHeaderKeys = receivedHeaders.map((header) => headerToKey.get(normalizeHeaderLabel(header)) || null);
  const presentKeys = new Set(mappedHeaderKeys.filter(Boolean));
  const requiredTemplateKeys = STUDENT_TEMPLATE_COLUMNS
    .filter((column) => column.required)
    .map((column) => column.key);
  const missingRequiredHeaders = requiredTemplateKeys.filter((key) => !presentKeys.has(key));

  if (missingRequiredHeaders.length > 0 || presentKeys.size === 0) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Template headers do not match. Please use the downloaded template without changing required headers.',
      data: {
        expectedHeaders,
        receivedHeaders,
        missingRequiredHeaders: missingRequiredHeaders.map((key) => (
          STUDENT_TEMPLATE_COLUMNS.find((column) => column.key === key)?.label || key
        )),
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

  const parentHonorificRule = await ensureParentNameHonorificRule(
    req.models?.SchoolProfile || SchoolProfile
  );
  await backfillParentNameHonorificsIfNeeded(
    req.models?.SchoolProfile || SchoolProfile,
    StudentModel
  );

  const generatedRollNumbersInRequest = new Set();
  const importGroups = [];
  const requestAcademicSession = normalizeString(req.academicSession);
  let classSectionLookup = new Map();

  if (TimetableStateModel) {
    const filter = requestAcademicSession ? { academicSession: requestAcademicSession } : { academicSession: null };
    const latestTimetableState = await TimetableStateModel.findOne(filter)
      .sort({ updatedAt: -1 })
      .select('matrixClasses matrixSections matrixSelection')
      .lean();
    classSectionLookup = buildClassSectionMatrixLookup(latestTimetableState);
  }

  const activityHouses = await listActiveActivityHouses(req);

  // Existing Admission Nos — duplicates are skipped (create-only import).
  const existingStudents = await StudentModel.find({})
    .select('rollNumber')
    .lean();
  const existingRollNumbers = new Set(
    existingStudents
      .map((student) => String(student.rollNumber || '').trim().toUpperCase())
      .filter(Boolean)
  );

  const createDocs = [];
  const seenInFile = new Set();

  for (const { rowNumber, valueAt } of dataRows) {
    const rowData = {};
    receivedHeaders.forEach((_header, cellIndex) => {
      const key = mappedHeaderKeys[cellIndex];
      if (!key || key === 'serialNo') return;
      rowData[key] = valueAt(cellIndex);
    });

    if (!hasAnyNonEmptyValue(rowData)) {
      results.skipped += 1;
      continue;
    }

    const fallbackNotes = [];
    let rollNumber = normalizeString(rowData.rollNumber).replace(/\s+/g, '').toUpperCase();
    let rollNumberAutoFilled = false;

    if (!rollNumber) {
      rollNumber = buildGeneratedImportRollNumber(rowNumber);
      while (
        existingRollNumbers.has(rollNumber)
        || generatedRollNumbersInRequest.has(rollNumber)
        || seenInFile.has(rollNumber)
      ) {
        rollNumber = buildGeneratedImportRollNumber(rowNumber);
      }
      rollNumberAutoFilled = true;
      fallbackNotes.push('roll number');
    }

    if (rollNumber.length > 20) {
      rollNumber = rollNumber.slice(0, 20);
      fallbackNotes.push('roll number length');
    }

    // Skip duplicates already in DB or already seen in this file.
    if (!rollNumberAutoFilled && (
      existingRollNumbers.has(rollNumber)
      || generatedRollNumbersInRequest.has(rollNumber)
      || seenInFile.has(rollNumber)
    )) {
      results.skipped += 1;
      continue;
    }

    generatedRollNumbersInRequest.add(rollNumber);
    seenInFile.add(rollNumber);

    let resolvedHouse = { house: '', houseId: null };
    if (!isBlankImportText(rowData.house)) {
      const resolvedImportHouse = resolveHouseAgainstCatalog(activityHouses, {
        house: rowData.house,
      });
      if (resolvedImportHouse.error) {
        results.errors.push({ row: rowNumber, message: resolvedImportHouse.error });
        continue;
      }
      resolvedHouse = resolvedImportHouse;
    }

    const parsedAddress = parseAddressText(rowData.addressText);
    const mobileNumber = optionalText(normalizeString(rowData.phone).replace(/\D/g, ''));
    const bloodGroup = normalizeBloodGroupValue(rowData.bloodGroup);

    const normalizedRow = {
      rollNumber,
      name: toTitleCaseName(rowData.name),
      gender: normalizeGenderValue(rowData.gender),
      class: normalizeClassValue(rowData.class),
      section: normalizeSectionValue(rowData.section),
      fatherName: formatParentNameWithHonorific(rowData.fatherName, 'father', parentHonorificRule),
      motherName: formatParentNameWithHonorific(rowData.motherName, 'mother', parentHonorificRule),
      guardianPhone: mobileNumber || '',
      dateOfBirth: normalizeDateValue(rowData.dateOfBirth),
      admissionDate: normalizeDateValue(rowData.admissionDate),
      category: normalizeCategoryValue(rowData.category),
      email: optionalText(normalizeString(rowData.email).toLowerCase()),
      phone: mobileNumber,
      penNumber: optionalText(rowData.penNumber),
      house: resolvedHouse.house || '',
      houseId: resolvedHouse.houseId || null,
      busNo: optionalText(rowData.busNo),
      aadharNumber: optionalText(normalizeString(rowData.aadharNumber).replace(/\D/g, '')),
      religion: toTitleCaseName(rowData.religion) || optionalText(rowData.religion),
      nationality: toTitleCaseName(rowData.nationality) || optionalText(rowData.nationality) || 'Indian',
      notes: optionalText(rowData.notes),
      address: {
        street: parsedAddress.street,
        city: parsedAddress.city,
        state: parsedAddress.state,
        pincode: parsedAddress.pincode,
      },
      medicalInfo: bloodGroup ? { bloodGroup } : undefined,
      subjects: [],
      isActive: true,
      academicSession: requestAcademicSession || undefined,
    };

    if (!normalizedRow.name) {
      normalizedRow.name = `Student ${normalizedRow.rollNumber}`;
      fallbackNotes.push('name');
    }
    if (normalizedRow.name.length > 100) {
      normalizedRow.name = normalizedRow.name.slice(0, 100);
      fallbackNotes.push('name length');
    }
    if (!normalizedRow.class) {
      results.errors.push({ row: rowNumber, message: 'Class is required.' });
      continue;
    }

    const resolvedCreateSection = resolveImportSectionForClass(
      normalizedRow.class,
      normalizedRow.section,
      classSectionLookup,
      fallbackNotes
    );
    if (resolvedCreateSection.error) {
      results.errors.push({ row: rowNumber, message: resolvedCreateSection.error });
      continue;
    }
    normalizedRow.section = resolvedCreateSection.section;

    if (!normalizedRow.fatherName) {
      normalizedRow.fatherName = formatParentNameWithHonorific('Unknown', 'father', parentHonorificRule);
      fallbackNotes.push('father name');
    }
    if (normalizedRow.fatherName.length > 100) {
      normalizedRow.fatherName = normalizedRow.fatherName.slice(0, 100);
      fallbackNotes.push('father name length');
    }
    if (!normalizedRow.motherName) {
      normalizedRow.motherName = formatParentNameWithHonorific('Unknown', 'mother', parentHonorificRule);
      fallbackNotes.push('mother name');
    }
    if (normalizedRow.motherName.length > 100) {
      normalizedRow.motherName = normalizedRow.motherName.slice(0, 100);
      fallbackNotes.push('mother name length');
    }
    if (!normalizedRow.guardianPhone) {
      normalizedRow.guardianPhone = '6000000000';
      fallbackNotes.push('guardian phone');
    }
    if (!normalizedRow.dateOfBirth) {
      normalizedRow.dateOfBirth = '2000-01-01';
      fallbackNotes.push('date of birth');
    }
    if (!normalizedRow.admissionDate) {
      normalizedRow.admissionDate = new Date().toISOString().slice(0, 10);
      fallbackNotes.push('admission date');
    }
    if (!normalizedRow.category) {
      normalizedRow.category = 'General';
      fallbackNotes.push('category');
    }
    if (!['General', 'OBC', 'SC', 'ST', 'EWS'].includes(normalizedRow.category)) {
      normalizedRow.category = 'General';
      fallbackNotes.push('invalid category');
    }
    if (!normalizedRow.address.street) normalizedRow.address.street = 'Not Provided';
    if (!normalizedRow.address.city) normalizedRow.address.city = 'Not Provided';
    if (!normalizedRow.address.state) normalizedRow.address.state = 'Not Provided';
    if (!normalizedRow.address.pincode) normalizedRow.address.pincode = '000000';
    if (normalizedRow.class.length > 50) {
      normalizedRow.class = normalizedRow.class.slice(0, 50);
      fallbackNotes.push('class length');
    }
    if (!STUDENT_GENDERS.includes(normalizedRow.gender)) {
      normalizedRow.gender = 'Unspecified';
      fallbackNotes.push('invalid gender');
    }
    if (!/^[6-9]\d{9}$/.test(normalizedRow.guardianPhone)) {
      normalizedRow.guardianPhone = '6000000000';
      fallbackNotes.push('invalid guardian phone');
    }
    if (!/^\d{6}$/.test(normalizedRow.address.pincode)) {
      normalizedRow.address.pincode = '000000';
      fallbackNotes.push('invalid pincode');
    }
    if (normalizedRow.phone && !/^[6-9]\d{9}$/.test(normalizedRow.phone)) {
      normalizedRow.phone = undefined;
      fallbackNotes.push('invalid phone');
    }
    if (normalizedRow.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedRow.email)) {
      normalizedRow.email = undefined;
      fallbackNotes.push('invalid email');
    }
    if (normalizedRow.aadharNumber && !/^\d{12}$/.test(normalizedRow.aadharNumber)) {
      normalizedRow.aadharNumber = undefined;
      fallbackNotes.push('invalid aadhar');
    }
    if (!isValidDateString(normalizedRow.dateOfBirth)) {
      normalizedRow.dateOfBirth = '2000-01-01';
      fallbackNotes.push('invalid date of birth');
    }
    if (!isValidDateString(normalizedRow.admissionDate)) {
      normalizedRow.admissionDate = new Date().toISOString().slice(0, 10);
      fallbackNotes.push('invalid admission date');
    }
    if (normalizedRow.penNumber && normalizedRow.penNumber.length > 50) {
      normalizedRow.penNumber = normalizedRow.penNumber.slice(0, 50);
    }
    if (normalizedRow.house && normalizedRow.house.length > 50) {
      normalizedRow.house = normalizedRow.house.slice(0, 50);
    }
    if (normalizedRow.busNo && normalizedRow.busNo.length > 30) {
      normalizedRow.busNo = normalizedRow.busNo.slice(0, 30);
    }
    if (rowData.bloodGroup && !normalizedRow.medicalInfo?.bloodGroup) {
      fallbackNotes.push('invalid blood group');
      delete normalizedRow.medicalInfo;
    }
    if (normalizedRow.religion && normalizedRow.religion.length > 30) {
      normalizedRow.religion = normalizedRow.religion.slice(0, 30);
    }
    if (normalizedRow.nationality && normalizedRow.nationality.length > 30) {
      normalizedRow.nationality = normalizedRow.nationality.slice(0, 30);
    }
    if (normalizedRow.notes && normalizedRow.notes.length > 1000) {
      normalizedRow.notes = normalizedRow.notes.slice(0, 1000);
    }
    if (normalizedRow.address.street.length > 200) {
      normalizedRow.address.street = normalizedRow.address.street.slice(0, 200);
    }
    if (normalizedRow.address.city.length > 50) {
      normalizedRow.address.city = normalizedRow.address.city.slice(0, 50);
    }
    if (normalizedRow.address.state.length > 50) {
      normalizedRow.address.state = normalizedRow.address.state.slice(0, 50);
    }

    createDocs.push(normalizedRow);
    importGroups.push({ className: normalizedRow.class, section: normalizedRow.section });
    existingRollNumbers.add(rollNumber);

    if (fallbackNotes.length > 0) {
      results.warnings.push({
        row: rowNumber,
        message: `Auto-filled/normalized: ${fallbackNotes.join(', ')}`,
      });
    }
  }

  if (createDocs.length > 0) {
    const INSERT_CHUNK = 200;
    for (let index = 0; index < createDocs.length; index += INSERT_CHUNK) {
      const chunk = createDocs.slice(index, index + INSERT_CHUNK);
      try {
        const inserted = await StudentModel.insertMany(chunk, { ordered: false });
        results.created += inserted.length;
      } catch (error) {
        const insertedCount = Array.isArray(error?.insertedDocs) ? error.insertedDocs.length : 0;
        results.created += insertedCount;
        if (error?.writeErrors?.length) {
          error.writeErrors.forEach((writeError) => {
            if (writeError.code === 11000) {
              results.skipped += 1;
              return;
            }
            results.errors.push({
              row: null,
              message: writeError.errmsg || writeError.message || 'Failed to create a student row.',
            });
          });
        } else if (error?.code === 11000) {
          results.skipped += 1;
        } else {
          results.errors.push({
            row: null,
            message: error.message || 'Failed to create students from template.',
          });
        }
      }
    }
  }

  if (importGroups.length > 0) {
    await reassignClassSections(StudentModel, importGroups);
  }

  return res.status(HTTP_STATUS.OK).json(
    generateResponse(true, 'Student template import completed', results)
  );
});

// @desc    Upload student document
// @route   POST /api/students/:id/documents
// @access  Private
const uploadDocument = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { type } = req.body;

  if (!req.files || !req.files.document) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json(
      generateResponse(false, 'Document file is required')
    );
  }

  const student = await Student.findById(id);
  if (!student) {
    return res.status(HTTP_STATUS.NOT_FOUND).json(
      generateResponse(false, ERROR_MESSAGES.NOT_FOUND)
    );
  }

  const file = req.files.document;
  const fileExtension = path.extname(file.name);
  const fileName = `${student.rollNumber}_${type}_${Date.now()}${fileExtension}`;

  // Upload to Cloudinary (use temp file or buffer)
  const fileInput = file.tempFilePath || file.data;
  const { url, publicId } = await uploadDocumentToCloudinary(
    fileInput,
    'student-documents',
    null
  );

  const documentData = {
    type,
    filename: fileName,
    originalName: file.name,
    path: url,
    cloudinaryPublicId: publicId
  };

  await student.addDocument(documentData);

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, 'Document uploaded successfully', student)
  );
});

// @desc    Delete student document
// @route   DELETE /api/students/:id/documents/:docId
// @access  Private
const deleteDocument = asyncHandler(async (req, res) => {
  const { id, docId } = req.params;

  const student = await Student.findById(id);
  if (!student) {
    return res.status(HTTP_STATUS.NOT_FOUND).json(
      generateResponse(false, ERROR_MESSAGES.NOT_FOUND)
    );
  }

  const document = student.documents.id(docId);
  if (!document) {
    return res.status(HTTP_STATUS.NOT_FOUND).json(
      generateResponse(false, 'Document not found')
    );
  }

  // Delete from Cloudinary if stored there
  if (document.cloudinaryPublicId) {
    try {
      await deleteRawFromCloudinary(document.cloudinaryPublicId);
    } catch (error) {
      console.error(`Failed to delete from Cloudinary: ${document.cloudinaryPublicId}`, error);
    }
  }

  // Remove document from student
  await student.removeDocument(docId);

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, 'Document deleted successfully', student)
  );
});

// @desc    Upload student profile image
// @route   POST /api/students/:id/profile-image
// @access  Private
const uploadProfileImage = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!req.files || !req.files.profileImage) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json(
      generateResponse(false, 'Profile image file is required')
    );
  }

  // Use the request-scoped model so uploads are saved to the active school's database.
  const StudentModel = req.models?.Student || Student;
  const student = await StudentModel.findById(id);
  if (!student) {
    return res.status(HTTP_STATUS.NOT_FOUND).json(
      generateResponse(false, ERROR_MESSAGES.NOT_FOUND)
    );
  }

  const file = req.files.profileImage;
  
  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(file.mimetype)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json(
      generateResponse(false, 'Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed')
    );
  }

  // Validate file size (5MB max)
  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json(
      generateResponse(false, 'File size must be less than 5MB')
    );
  }

  try {
    // Delete old profile image from Cloudinary if exists
    if (student.profileImage) {
      const oldPublicId = extractPublicId(student.profileImage);
      if (oldPublicId) {
        try {
          await deleteFromCloudinary(oldPublicId);
          console.log(`Deleted old profile image: ${oldPublicId}`);
        } catch (error) {
          console.error(`Failed to delete old profile image from Cloudinary: ${oldPublicId}`, error);
        }
      }
    }

    // Upload to Cloudinary
    // Use the temporary file path from express-fileupload
    const publicId = `student_${student.rollNumber}_${Date.now()}`;
    const uploadResult = await uploadToCloudinary(
      file.tempFilePath,
      'students/profiles',
      publicId
    );

    // Update student profile image with Cloudinary URL
    student.profileImage = uploadResult.url;
    await student.save();

    // Clean up temporary file
    try {
      await fs.unlink(file.tempFilePath);
    } catch (error) {
      console.error('Failed to delete temporary file:', error);
    }

    res.status(HTTP_STATUS.OK).json(
      generateResponse(true, 'Profile image uploaded successfully', student)
    );
  } catch (error) {
    console.error('Profile image upload error:', error);
    
    // Clean up temporary file in case of error
    try {
      if (file.tempFilePath) {
        await fs.unlink(file.tempFilePath);
      }
    } catch (cleanupError) {
      console.error('Failed to delete temporary file:', cleanupError);
    }

    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      generateResponse(false, error.message || 'Failed to upload profile image')
    );
  }
});

module.exports = {
  getStudents,
  getStudent,
  createStudent,
  updateStudent,
  deleteStudent,
  bulkDeleteStudents,
  getStudentsByClass,
  getStudentsByClassSection,
  getStudentsBySubject,
  assignSubjects,
  removeSubjects,
  getStudentStats,
  getNextRollNumber,
  bulkCreateStudents,
  downloadStudentImportTemplate,
  uploadStudentsFromTemplate,
  uploadDocument,
  deleteDocument,
  uploadProfileImage
};
