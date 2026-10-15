const asyncHandler = require('../middleware/asyncHandler');
const { HTTP_STATUS } = require('../utils/constants');
const pdfGenerator = require('../utils/pdfGenerator');
const fs = require('fs');
const path = require('path');
const ExamDefinition = require('../models/ExamDefinition');
const ExamResult = require('../models/ExamResult');
const Student = require('../models/Student');
const SchoolProfile = require('../models/SchoolProfile');
const CbseClassSubjectMatrix = require('../models/CbseClassSubjectMatrix');
const CbseRegistration = require('../models/CbseRegistration');
const { uploadToCloudinary } = require('../config/cloudinary');
const { computePercentageWithAdditionalSubject } = require('../utils/cbsePercentage');

const GRADE_SCALE = [
  { min: 91, grade: 'A1' },
  { min: 81, grade: 'A2' },
  { min: 71, grade: 'B1' },
  { min: 61, grade: 'B2' },
  { min: 51, grade: 'C1' },
  { min: 41, grade: 'C2' },
  { min: 33, grade: 'D' },
  { min: 0, grade: 'E' },
];

const getGrade = (obtained, maxMarks) => {
  if (!maxMarks || maxMarks <= 0) return '';
  const pct = (obtained / maxMarks) * 100;
  for (const { min, grade } of GRADE_SCALE) {
    if (pct >= min) return grade;
  }
  return 'E';
};

const formatReportCardGender = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'boy' || normalized === 'male' || normalized === 'm') return 'Male';
  if (normalized === 'girl' || normalized === 'female' || normalized === 'f') return 'Female';
  if (normalized === 'other') return 'Other';
  return '';
};

const slugToTitle = (slug) =>
  String(slug || '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

const normalizeSubjectKey = (name) =>
  String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');

const normalizeSectionKey = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ');

const resolveSubjectRolesFromCbseMatrix = async (req, className, section) => {
  try {
    const ClassSubjectModel = req.models?.CbseClassSubjectMatrix || CbseClassSubjectMatrix;
    const doc = await ClassSubjectModel.findOne({}).lean();
    if (!doc) return null;

    const columns = Array.isArray(doc.columns) ? doc.columns : [];
    const rows = Array.isArray(doc.rows) ? doc.rows : [];
    const classKey = String(className || '').trim().toLowerCase();
    const sectionKey = normalizeSectionKey(section);
    const isSenior = /^(11th|12th|11|12)$/.test(classKey.replace(/\s+/g, ''));

    const matched = rows.find((row) => {
      if (String(row.className || '').trim().toLowerCase() !== classKey) return false;
      if (isSenior) return normalizeSectionKey(row.section) === sectionKey;
      return true;
    });
    if (!matched) return null;

    const roles = {};
    const subjects = Array.isArray(matched.subjects) ? matched.subjects : [];
    if (subjects.length > 0) {
      subjects.forEach((slot) => {
        const subjectKey = normalizeSubjectKey(slot?.key || slot?.name);
        if (!subjectKey) return;
        roles[subjectKey] = 'main';
      });
    } else {
      const slots =
        matched.slots instanceof Map
          ? Object.fromEntries(matched.slots.entries())
          : matched.slots && typeof matched.slots === 'object'
            ? matched.slots
            : {};
      columns.forEach((col) => {
        if (String(col.role || '') === 'additional') return;
        const slot = slots[col.key];
        const subjectKey = normalizeSubjectKey(slot?.key || slot?.name);
        if (!subjectKey) return;
        roles[subjectKey] = 'main';
      });
    }
    return Object.keys(roles).length > 0 ? roles : null;
  } catch {
    return null;
  }
};

const resolveAdditionalByStudent = async (req, className, section) => {
  try {
    const CbseRegistrationModel = req.models?.CbseRegistration || CbseRegistration;
    const doc = await CbseRegistrationModel.findOne({ class: className, section }).lean();
    const map = {};
    const rows = Array.isArray(doc?.selections) ? doc.selections : [];
    rows.forEach((row) => {
      const id = String(row.studentId || '');
      const key = normalizeSubjectKey(row.additionalSubjectKey);
      if (!id || !key) return;
      map[id] = key;
    });
    return map;
  } catch {
    return {};
  }
};

const formatAcademicYear = (session) => {
  const value = String(session || '').replace('_', '-').trim();
  const match = value.match(/^(\d{4})-(\d{2,4})$/);
  if (!match) return value;
  return `${match[1]}-${String(match[2]).slice(-2)}`;
};

let cachedCbseLogoDataUri = null;

const getCbseLogoDataUri = () => {
  if (cachedCbseLogoDataUri) return cachedCbseLogoDataUri;

  const logoPath = path.join(__dirname, '../assets/cbse-logo.svg');
  try {
    const logoBuffer = fs.readFileSync(logoPath);
    cachedCbseLogoDataUri = `data:image/svg+xml;base64,${logoBuffer.toString('base64')}`;
  } catch (_) {
    cachedCbseLogoDataUri = '';
  }

  return cachedCbseLogoDataUri;
};

const buildStudentCard = (student, exam, resultDoc, subjectRoles = null, additionalSubjectKey = '') => {
  const marksMap = resultDoc?.marks instanceof Map
    ? Object.fromEntries(resultDoc.marks)
    : (resultDoc?.marks || {});

  const subjectEntries = Object.entries(marksMap);
  const perSubjectMax = exam.maximumMarks || 0;
  const additionalKey = normalizeSubjectKey(additionalSubjectKey);

  const subjects = subjectEntries.map(([subjectId, obtained]) => {
    const obtainedNum = typeof obtained === 'number' ? obtained : Number(obtained) || 0;
    const normalizedId = normalizeSubjectKey(subjectId);
    let role = 'main';
    if (additionalKey && (normalizedId === additionalKey || subjectId === additionalSubjectKey)) {
      role = 'additional';
    } else if (subjectRoles && typeof subjectRoles === 'object') {
      role = subjectRoles[subjectId] || subjectRoles[normalizedId] || 'main';
      if (role === 'additional' && !additionalKey) role = 'main';
    }
    return {
      name: slugToTitle(subjectId),
      subjectKey: subjectId,
      role,
      maxMarks: perSubjectMax,
      marksObtained: obtainedNum,
      grade: perSubjectMax > 0 ? getGrade(obtainedNum, perSubjectMax) : '',
    };
  });

  const mainSubjects = subjects
    .filter((s) => s.role !== 'additional')
    .map((s) => ({ key: s.subjectKey, marks: s.marksObtained }));
  const additional = subjects.find((s) => s.role === 'additional');
  const scored = computePercentageWithAdditionalSubject(
    mainSubjects.length > 0 ? mainSubjects : subjects.map((s) => ({ key: s.subjectKey, marks: s.marksObtained })),
    additional ? { key: additional.subjectKey, marks: additional.marksObtained } : null,
    perSubjectMax
  );

  const grandObtained = scored.total != null
    ? scored.total
    : subjects.reduce((sum, s) => sum + s.marksObtained, 0);
  const grandMax = scored.maxTotal > 0
    ? scored.maxTotal
    : subjects.length * perSubjectMax;

  const percentage = scored.percentage != null
    ? scored.percentage.toFixed(2)
    : grandMax > 0
      ? ((grandObtained / grandMax) * 100).toFixed(2)
      : '0.00';
  const overallGrade = grandMax > 0 ? getGrade(grandObtained, grandMax) : '';

  return {
    admNo: student.rollNumber || '',
    name: student.name || '',
    classSection: `${student.class || ''} - ${student.section || ''}`,
    fatherName: student.fatherName || '',
    motherName: student.motherName || '',
    gender: formatReportCardGender(student.gender),
    subjects,
    grandObtained,
    grandMax,
    percentage,
    overallGrade,
  };
};

const pickText = (...values) => {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
};

const SMALL_NAME_WORDS = new Set(['the', 'of', 'and', 'for', 'a', 'an', '&']);
const INSTITUTION_NAME_WORDS = new Set(['school', 'vidyalaya', 'academy', 'college', 'convent']);

const wordToInitials = (word, isSoleNameWord = false) => {
  const cleaned = String(word || '').replace(/[^A-Za-z.]/g, '');
  if (!cleaned) return '';
  if (/^[A-Za-z](\.[A-Za-z])+\.?$/.test(cleaned)) {
    return cleaned.toUpperCase().replace(/\.?$/, '.');
  }
  const isAcronym =
    /^[A-Za-z]{2,4}$/.test(cleaned) &&
    (cleaned === cleaned.toUpperCase() || (isSoleNameWord && cleaned.length <= 3));
  if (isAcronym) {
    return `${cleaned.toUpperCase().split('').join('.')}.`;
  }
  return `${cleaned[0].toUpperCase()}.`;
};

const toSchoolInitialsName = (name) => {
  const raw = String(name || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';

  const normalized = raw.toUpperCase().replace(/\s+/g, ' ');
  if (/^([A-Z]\.){1,8}\s*SCHOOL$/.test(normalized)) {
    return normalized.replace(/\.SCHOOL$/, '. SCHOOL');
  }

  const words = raw.split(' ').filter((word) => word && !SMALL_NAME_WORDS.has(word.toLowerCase()));
  if (!words.length) return normalized;

  let institution = '';
  const lastWord = words[words.length - 1];
  if (INSTITUTION_NAME_WORDS.has(lastWord.toLowerCase())) {
    institution = lastWord.toUpperCase();
    words.pop();
  }

  const initials = words
    .map((word) => wordToInitials(word, words.length === 1))
    .filter(Boolean)
    .join('');
  if (!initials) return normalized;
  return institution ? `${initials} ${institution}` : initials;
};

const splitAddress = (address) => {
  const raw = String(address || '').trim();
  if (!raw) return { line1: '', line2: '' };
  const byBreak = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (byBreak.length >= 2) {
    return { line1: byBreak[0], line2: byBreak.slice(1).join(', ') };
  }
  const idx = raw.lastIndexOf(',');
  if (idx > 10) {
    return { line1: `${raw.slice(0, idx).trim()},`, line2: raw.slice(idx + 1).trim() };
  }
  return { line1: raw, line2: '' };
};

const formatExamTitle = (exam, academicYear) => {
  const name = String(exam?.name || exam?.code || '').trim();
  if (!name) return '';
  const titled = name
    .replace(/\s*[-–—]?\s*(\d+)\s*$/, ' – $1')
    .toUpperCase();
  const year = String(academicYear || '').trim();
  return year ? `${titled} (${year})` : titled;
};

const toBoolean = (value, fallback = true) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const FONT_FAMILY_CSS = {
  Arial: 'Arial, Helvetica, sans-serif',
  'Times New Roman': '"Times New Roman", Times, serif',
  Georgia: 'Georgia, serif',
  Verdana: 'Verdana, Geneva, sans-serif',
  'Trebuchet MS': '"Trebuchet MS", Helvetica, sans-serif',
  Tahoma: 'Tahoma, Geneva, sans-serif',
  'Courier New': '"Courier New", Courier, monospace',
  'Comic Sans MS': '"Comic Sans MS", Comic Sans, cursive',
  Impact: 'Impact, Haettenschweiler, sans-serif',
  'Palatino Linotype': '"Palatino Linotype", Palatino, serif',
};

const parseFontFamily = (value, fallback = 'Arial') =>
  FONT_FAMILY_CSS[value] ? value : fallback;

const fontFamilyCss = (value) => FONT_FAMILY_CSS[parseFontFamily(value)] || FONT_FAMILY_CSS.Arial;

const DEFAULT_TEXT_STYLES = {
  schoolName: { fontFamily: 'Arial', fontSize: 30, bold: true, italic: false, underline: false },
  tagline: { fontFamily: 'Arial', fontSize: 12, bold: false, italic: true, underline: false },
  meta: { fontFamily: 'Arial', fontSize: 11, bold: false, italic: false, underline: false },
  examTitle: { fontFamily: 'Arial', fontSize: 14, bold: true, italic: false, underline: false },
  sectionHeading: { fontFamily: 'Arial', fontSize: 14, bold: true, italic: true, underline: false },
  studentFields: { fontFamily: 'Arial', fontSize: 11, bold: false, italic: false, underline: false },
  tableHeader: { fontFamily: 'Arial', fontSize: 11, bold: true, italic: false, underline: false },
  tableBody: { fontFamily: 'Arial', fontSize: 11, bold: false, italic: false, underline: false },
  footer: { fontFamily: 'Arial', fontSize: 11, bold: false, italic: false, underline: false },
  signatures: { fontFamily: 'Arial', fontSize: 11, bold: false, italic: false, underline: false },
};

const DEFAULT_LABELS = {
  studentDetails: 'Student Details:',
  scholasticArea: 'Scholastic Area:',
  subjects: 'Subjects',
  maxMarks: 'Maximum Marks',
  marksObtained: 'Marks Obtained',
  grade: 'Grade',
  grandTotal: 'Grand Total',
  percentage: 'Percentage',
  overallGrade: 'Overall Grade',
  attendance: 'Attendance:',
  remarks: 'Remarks:',
  date: 'Date:',
  classTeacherSign: 'Class Teacher Sign',
  principalSign: 'Principal Sign',
};

const DEFAULT_REPORT_CARD_DESIGN = {
  schoolName: 'I.B. SCHOOL',
  tagline: 'Always Learning, Learning All Ways.....',
  schoolCode: '40291',
  address: '5th Milestone, Gohana Road, Rohtak (HR) – 124001',
  affiliationNo: '530316',
  email: 'contact@ibsrohtak.com',
  contact: '7082352880, 7082355053',
  pageSize: 'A4',
  orientation: 'portrait',
  showHeader: true,
  showSchoolLogo: true,
  showCbseLogo: true,
  showTagline: true,
  showSchoolCode: true,
  showAddress: true,
  showAffiliation: true,
  showEmail: true,
  showContact: true,
  showAttendance: true,
  showRemarks: true,
  showDate: true,
  signatures: {
    classTeacher: true,
    principal: true,
  },
  labels: DEFAULT_LABELS,
  styles: DEFAULT_TEXT_STYLES,
  columnWidths: {
    subjects: 40,
    maxMarks: 20,
    marksObtained: 22,
    grade: 18,
  },
};

const textOrDefault = (value, fallback) => {
  if (value === undefined || value === null) return fallback;
  return String(value);
};

const parseTextStyle = (source = {}, fallback) => ({
  fontFamily: parseFontFamily(source.fontFamily, fallback.fontFamily),
  fontSize: Number(source.fontSize) > 0 ? Number(source.fontSize) : fallback.fontSize,
  bold: toBoolean(source.bold, fallback.bold),
  italic: toBoolean(source.italic, fallback.italic),
  underline: toBoolean(source.underline, fallback.underline),
});

const styleToCss = (style) =>
  [
    `font-family:${fontFamilyCss(style.fontFamily)}`,
    `font-size:${style.fontSize}px`,
    `font-weight:${style.bold ? 700 : 400}`,
    `font-style:${style.italic ? 'italic' : 'normal'}`,
    `text-decoration:${style.underline ? 'underline' : 'none'}`,
  ].join(';');

const parsePageSize = (value) => {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'legal') return 'legal';
  if (normalized === 'letter') return 'letter';
  return 'A4';
};

const parseDesign = (source = {}) => {
  const signatures = source.signatures || {};
  const labels = source.labels || {};
  const styles = source.styles || {};
  const columnWidths = source.columnWidths || {};
  const parsedStyles = {};
  Object.keys(DEFAULT_TEXT_STYLES).forEach((key) => {
    parsedStyles[key] = parseTextStyle(styles[key] || {}, DEFAULT_TEXT_STYLES[key]);
  });

  const parsedLabels = {};
  Object.keys(DEFAULT_LABELS).forEach((key) => {
    parsedLabels[key] = textOrDefault(labels[key], DEFAULT_LABELS[key]);
  });

  const parseWidth = (value, fallback) => {
    const num = Number(value);
    return Number.isFinite(num) && num >= 8 ? num : fallback;
  };

  const { parseCanvasItems } = require('../utils/formatCanvasItems');
  const canvasItems = parseCanvasItems(source.canvasItems);

  return {
    schoolName: textOrDefault(source.schoolName, DEFAULT_REPORT_CARD_DESIGN.schoolName),
    tagline: textOrDefault(source.tagline, DEFAULT_REPORT_CARD_DESIGN.tagline),
    schoolCode: textOrDefault(source.schoolCode, DEFAULT_REPORT_CARD_DESIGN.schoolCode),
    address: textOrDefault(source.address, DEFAULT_REPORT_CARD_DESIGN.address),
    affiliationNo: textOrDefault(source.affiliationNo, DEFAULT_REPORT_CARD_DESIGN.affiliationNo),
    email: textOrDefault(source.email, DEFAULT_REPORT_CARD_DESIGN.email),
    contact: textOrDefault(source.contact, DEFAULT_REPORT_CARD_DESIGN.contact),
    pageSize: parsePageSize(source.pageSize),
    orientation: source.orientation === 'landscape' ? 'landscape' : 'portrait',
    showHeader: toBoolean(source.showHeader, true),
    showSchoolLogo: toBoolean(source.showSchoolLogo, true),
    showCbseLogo: toBoolean(source.showCbseLogo, true),
    showTagline: toBoolean(source.showTagline, true),
    showSchoolCode: toBoolean(source.showSchoolCode, true),
    showAddress: toBoolean(source.showAddress, true),
    showAffiliation: toBoolean(source.showAffiliation, true),
    showEmail: toBoolean(source.showEmail, true),
    showContact: toBoolean(source.showContact, true),
    showAttendance: toBoolean(source.showAttendance, true),
    showRemarks: toBoolean(source.showRemarks, true),
    showDate: toBoolean(source.showDate, true),
    signatures: {
      classTeacher: toBoolean(signatures.classTeacher, true),
      principal: toBoolean(signatures.principal, true),
    },
    labels: parsedLabels,
    styles: parsedStyles,
    columnWidths: {
      subjects: parseWidth(columnWidths.subjects, 40),
      maxMarks: parseWidth(columnWidths.maxMarks, 20),
      marksObtained: parseWidth(columnWidths.marksObtained, 22),
      grade: parseWidth(columnWidths.grade, 18),
    },
    canvasItems,
  };
};

const toPersistableDesign = (design) => ({
  schoolName: design.schoolName,
  tagline: design.tagline,
  schoolCode: design.schoolCode,
  address: design.address,
  affiliationNo: design.affiliationNo,
  email: design.email,
  contact: design.contact,
  pageSize: design.pageSize,
  orientation: design.orientation,
  showHeader: design.showHeader,
  showSchoolLogo: design.showSchoolLogo,
  showCbseLogo: design.showCbseLogo,
  showTagline: design.showTagline,
  showSchoolCode: design.showSchoolCode,
  showAddress: design.showAddress,
  showAffiliation: design.showAffiliation,
  showEmail: design.showEmail,
  showContact: design.showContact,
  showAttendance: design.showAttendance,
  showRemarks: design.showRemarks,
  showDate: design.showDate,
  signatures: design.signatures,
  labels: design.labels,
  styles: design.styles,
  columnWidths: design.columnWidths,
  canvasItems: design.canvasItems,
});

const loadSavedDesign = async (SchoolProfileModel) => {
  const profile = await SchoolProfileModel.findOne({}).select('reportCardDesign').lean();
  return parseDesign(profile?.reportCardDesign || {});
};

const buildTemplateData = (tenant, exam, studentCards, academicYear, schoolProfile, design) => {
  const header = design || parseDesign(schoolProfile?.reportCardDesign || {});
  const fullName = pickText(header.schoolName, schoolProfile?.schoolName, tenant?.name);
  const address = splitAddress(pickText(header.address, schoolProfile?.address, tenant?.metadata?.address));
  const pageSizeCss = `${header.pageSize === 'A4' ? 'A4' : header.pageSize} ${header.orientation}`;
  const styleCss = {};
  Object.keys(header.styles || {}).forEach((key) => {
    styleCss[key] = styleToCss(header.styles[key]);
  });
  return {
    schoolName: header.schoolName.trim() ? header.schoolName.trim() : (toSchoolInitialsName(fullName) || fullName),
    schoolCode: pickText(header.schoolCode, schoolProfile?.schoolCode, tenant?.metadata?.schoolCode),
    affiliationNo: pickText(header.affiliationNo, schoolProfile?.affiliationNo, tenant?.metadata?.affiliationNo),
    schoolLogoUrl: header.showSchoolLogo ? (schoolProfile?.logoUrl || '') : '',
    cbseLogoDataUri: header.showCbseLogo ? getCbseLogoDataUri() : '',
    schoolTagline: header.showTagline ? pickText(header.tagline, schoolProfile?.tagline, tenant?.metadata?.tagline) : '',
    schoolAddressLine1: header.showAddress ? address.line1 : '',
    schoolAddressLine2: header.showAddress ? address.line2 : '',
    schoolContact: header.showContact ? pickText(header.contact, schoolProfile?.contact, tenant?.metadata?.contact) : '',
    schoolEmail: header.showEmail ? pickText(header.email, schoolProfile?.email, tenant?.metadata?.email) : '',
    showHeader: header.showHeader,
    showSchoolCode: header.showSchoolCode,
    showAffiliation: header.showAffiliation,
    showEmail: header.showEmail,
    showContact: header.showContact,
    showAttendance: header.showAttendance,
    showRemarks: header.showRemarks,
    showDate: header.showDate,
    showClassTeacherSign: header.signatures.classTeacher,
    showPrincipalSign: header.signatures.principal,
    examTitle: formatExamTitle(exam, academicYear),
    students: studentCards,
    labels: header.labels,
    columnWidths: header.columnWidths,
    pageSizeCss,
    isLandscape: header.orientation === 'landscape',
    styleCss,
    canvasItems: (header.canvasItems || []).map((item) => ({
      ...item,
      isImage: item.type === 'image' && Boolean(item.imageUrl),
      isRect: item.type === 'rect',
      isLine: item.type === 'line',
      boxStyle: `left:${item.x}%;top:${item.y}%;width:${item.width}%;height:${item.height}%;z-index:${item.zIndex || 1}`,
      textStyle: [
        `font-family:${fontFamilyCss(item.fontFamily)}`,
        `font-size:${item.fontSize || 16}px`,
        `font-weight:${item.bold ? 700 : 400}`,
        `font-style:${item.italic ? 'italic' : 'normal'}`,
        `text-decoration:${item.underline ? 'underline' : 'none'}`,
        `color:${item.color || '#000'}`,
        `text-align:${item.align || 'left'}`,
      ].join(';'),
      shapeStyle:
        item.type === 'rect'
          ? `background:${item.fill || '#e2e8f0'};border:${item.strokeWidth || 1}px solid ${item.stroke || '#000'};width:100%;height:100%;`
          : `background:${item.stroke || item.fill || '#111'};width:100%;height:100%;`,
    })),
  };
};

exports.getReportCardDesign = asyncHandler(async (req, res) => {
  const SchoolProfileModel = req.models?.SchoolProfile || SchoolProfile;
  const design = await loadSavedDesign(SchoolProfileModel);
  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: toPersistableDesign(design),
  });
});

exports.saveReportCardDesign = asyncHandler(async (req, res) => {
  const SchoolProfileModel = req.models?.SchoolProfile || SchoolProfile;
  const design = toPersistableDesign(parseDesign(req.body?.design || req.body || {}));
  await SchoolProfileModel.findOneAndUpdate(
    {},
    { $set: { reportCardDesign: design } },
    { upsert: true, setDefaultsOnInsert: true }
  );
  return res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Report card format saved.',
    data: design,
  });
});

exports.uploadReportCardImage = asyncHandler(async (req, res) => {
  if (!req.files || !req.files.image) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'No image file provided. Send it as multipart field "image".',
    });
  }

  const file = req.files.image;
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.mimetype)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Only JPEG, PNG, or WebP images are accepted.',
    });
  }

  const tenantSlug = req.tenant?.slug || 'unknown';
  const publicId = `report_card_img_${tenantSlug}_${Date.now()}`;
  const uploadResult = await uploadToCloudinary(file.tempFilePath, 'sems/report-card-canvas', publicId);

  if (file.tempFilePath) {
    fs.unlink(file.tempFilePath, () => {});
  }

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: {
      url: uploadResult.url,
      publicId: uploadResult.publicId,
    },
  });
});

// GET /report-card/single?examId=&studentId=
exports.generateSingle = asyncHandler(async (req, res) => {
  const { examId, studentId } = req.query;

  if (!examId || !studentId) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'examId and studentId are required.',
    });
  }

  const ExamDefinitionModel = req.models?.ExamDefinition || ExamDefinition;
  const StudentModel = req.models?.Student || Student;
  const ExamResultModel = req.models?.ExamResult || ExamResult;
  const SchoolProfileModel = req.models?.SchoolProfile || SchoolProfile;

  const [exam, student, resultDoc, schoolProfile] = await Promise.all([
    ExamDefinitionModel.findById(examId).lean(),
    StudentModel.findById(studentId).select('rollNumber name class section fatherName motherName gender').lean(),
    ExamResultModel.findOne({ examId, studentId }).lean(),
    SchoolProfileModel.findOne({}).lean(),
  ]);

  if (!exam) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: 'Exam not found.' });
  }
  if (!student) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: 'Student not found.' });
  }

  const academicYear = formatAcademicYear(req.academicSession);
  const [subjectRoles, additionalByStudent] = await Promise.all([
    resolveSubjectRolesFromCbseMatrix(req, student.class, student.section),
    resolveAdditionalByStudent(req, student.class, student.section),
  ]);
  const card = buildStudentCard(
    student,
    exam,
    resultDoc,
    subjectRoles,
    additionalByStudent[String(student._id)] || ''
  );
  const design = parseDesign(schoolProfile?.reportCardDesign || {});
  const templateData = buildTemplateData(req.tenant, exam, [card], academicYear, schoolProfile, design);

  const pdfBuffer = await pdfGenerator.generatePDF('report-card', templateData);

  const safeName = String(student.name || 'student').replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `report-card_${safeName}_${String(exam.code || examId)}.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.status(HTTP_STATUS.OK).send(pdfBuffer);
});

// GET /report-card/bulk?examId=&class=&section=&studentIds=
exports.generateBulk = asyncHandler(async (req, res) => {
  const { examId } = req.query;
  const className = req.query.class;
  const section = req.query.section;
  const studentIds = String(req.query.studentIds || '')
    .split(',')
    .map((id) => String(id || '').trim())
    .filter(Boolean);

  if (!examId || !className || !section) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'examId, class, and section are required.',
    });
  }

  const ExamDefinitionModel = req.models?.ExamDefinition || ExamDefinition;
  const StudentModel = req.models?.Student || Student;
  const ExamResultModel = req.models?.ExamResult || ExamResult;
  const SchoolProfileModel = req.models?.SchoolProfile || SchoolProfile;

  const studentFilter = {
    class: className,
    section,
    isActive: true,
    ...(studentIds.length > 0 ? { _id: { $in: studentIds } } : {}),
  };

  const [exam, students, results, schoolProfile] = await Promise.all([
    ExamDefinitionModel.findById(examId).lean(),
    StudentModel.find(studentFilter)
      .select('rollNumber classRollNo name class section fatherName motherName gender')
      .sort({ classRollNo: 1, name: 1, rollNumber: 1 })
      .lean(),
    ExamResultModel.find({ examId, class: className, section }).lean(),
    SchoolProfileModel.findOne({}).lean(),
  ]);

  if (!exam) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: 'Exam not found.' });
  }

  if (!students.length) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: studentIds.length > 0
        ? 'No selected students found for this class and section.'
        : 'No students found for this class and section.',
    });
  }

  const resultsByStudentId = {};
  for (const r of results) {
    resultsByStudentId[String(r.studentId)] = r;
  }

  const academicYear = formatAcademicYear(req.academicSession);
  const [subjectRoles, additionalByStudent] = await Promise.all([
    resolveSubjectRolesFromCbseMatrix(req, className, section),
    resolveAdditionalByStudent(req, className, section),
  ]);
  const cards = students.map((s) =>
    buildStudentCard(
      s,
      exam,
      resultsByStudentId[String(s._id)],
      subjectRoles,
      additionalByStudent[String(s._id)] || ''
    )
  );
  const design = parseDesign(schoolProfile?.reportCardDesign || {});
  const templateData = buildTemplateData(req.tenant, exam, cards, academicYear, schoolProfile, design);

  const pdfBuffer = await pdfGenerator.generatePDF('report-card', templateData);

  const filename = studentIds.length > 0
    ? `report-cards_${String(exam.code || examId)}_${className}-${section}_selected.pdf`
    : `report-cards_${String(exam.code || examId)}_${className}-${section}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.status(HTTP_STATUS.OK).send(pdfBuffer);
});

/**
 * Marks card for one student and exam (no PDF). Used by the parent/student portal.
 */
exports.buildCardData = async (req, student, exam, resultDoc) => {
  const [subjectRoles, additionalByStudent] = await Promise.all([
    resolveSubjectRolesFromCbseMatrix(req, student.class, student.section),
    resolveAdditionalByStudent(req, student.class, student.section),
  ]);
  return buildStudentCard(student, exam, resultDoc, subjectRoles, additionalByStudent[String(student._id)] || '');
};
