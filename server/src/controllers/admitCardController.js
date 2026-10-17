const fs = require('fs');
const QRCode = require('qrcode');
const asyncHandler = require('../middleware/asyncHandler');
const { HTTP_STATUS } = require('../utils/constants');
const pdfGenerator = require('../utils/pdfGenerator');
const { numberToIndianWords } = require('../utils/numberToIndianWords');
const { uploadToCloudinary, deleteFromCloudinary } = require('../config/cloudinary');
const ExamDefinition = require('../models/ExamDefinition');
const Student = require('../models/Student');
const SchoolProfile = require('../models/SchoolProfile');
const DateSheet = require('../models/DateSheet');
const CentreDetail = require('../models/CentreDetail');
const { parseCanvasItems, mapCanvasItemsForTemplate } = require('../utils/formatCanvasItems');

const toBoolean = (value, fallback = true) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const DEFAULT_INSTRUCTIONS = [
  '1. This admit card must be verified and carried to the examination centre.',
  '2. Report at least 30 minutes before the exam. Entry closes 30 minutes before start.',
  '3. Candidates with special needs should report earlier for assistance, as applicable.',
  '4. Mobile phones, smart watches, electronic gadgets, and unfair means are strictly prohibited.',
  '5. Carry only permitted stationery as instructed by the school.',
  '6. Wear school uniform unless otherwise notified.',
  '7. Sign the attendance sheet and follow invigilator instructions.',
  '8. Check all particulars including the subject(s) and the photograph before the examination.',
].join('\n');

const DEFAULT_ENTRY_NOTE = 'LATEST ENTRY IN EXAMINATION CENTRE 30 MIN BEFORE THE EXAM START';
const DEFAULT_DISCLAIMER =
  'Disclaimer: The school is not responsible for any inadvertent error that may have crept in the data being published.';
const DEFAULT_CONFIRMATION = 'ALL PARTICULARS INCLUDING THE SUBJECT(S) AND THE PHOTO CHECKED AND FOUND CORRECT';

const parseDesign = (source = {}) => {
  const fields = source.fields || {};
  const signatures = source.signatures || {};

  return {
    title: String(source.title || 'ADMIT CARD FOR {exam}').trim() || 'ADMIT CARD FOR {exam}',
    pageSize: String(source.pageSize || '').toLowerCase() === 'legal' ? 'legal' : 'A4',
    orientation: source.orientation === 'landscape' ? 'landscape' : 'portrait',
    copiesPerSheet: Number(source.copiesPerSheet) === 2 ? 2 : 1,
    showHeader: toBoolean(source.showHeader, true),
    showSchoolLogo: toBoolean(source.showSchoolLogo, true),
    showSchoolAddress: toBoolean(source.showSchoolAddress, false),
    entryNote: String(source.entryNote || DEFAULT_ENTRY_NOTE).trim() || DEFAULT_ENTRY_NOTE,
    showEntryNote: toBoolean(source.showEntryNote, true),
    instructions: String(source.instructions || DEFAULT_INSTRUCTIONS).trim() || DEFAULT_INSTRUCTIONS,
    showInstructions: toBoolean(source.showInstructions, true),
    confirmationText: String(source.confirmationText || DEFAULT_CONFIRMATION).trim() || DEFAULT_CONFIRMATION,
    showConfirmation: toBoolean(source.showConfirmation, true),
    disclaimer: String(source.disclaimer || DEFAULT_DISCLAIMER).trim() || DEFAULT_DISCLAIMER,
    showDisclaimer: toBoolean(source.showDisclaimer, true),
    fields: {
      photo: toBoolean(fields.photo, true),
      rollNo: toBoolean(fields.rollNo, true),
      dob: toBoolean(fields.dob, true),
      schoolNo: toBoolean(fields.schoolNo, true),
      centreNo: toBoolean(fields.centreNo, true),
      rollNoInWords: toBoolean(fields.rollNoInWords, true),
      exam: toBoolean(fields.exam, true),
      name: toBoolean(fields.name, true),
      motherName: toBoolean(fields.motherName, true),
      fatherName: toBoolean(fields.fatherName, true),
      gender: toBoolean(fields.gender, true),
      schoolName: toBoolean(fields.schoolName, true),
      examCentre: toBoolean(fields.examCentre, true),
      pwdCategory: toBoolean(fields.pwdCategory, true),
      admitCardId: toBoolean(fields.admitCardId, true),
      subjects: toBoolean(fields.subjects, true),
      qr: toBoolean(fields.qr, true),
      class: toBoolean(fields.class, true),
      section: toBoolean(fields.section, false),
      admissionNo: toBoolean(fields.admissionNo, false),
    },
    signatures: {
      candidate: toBoolean(signatures.candidate, true),
      parent: toBoolean(signatures.parent, true),
      examIncharge: toBoolean(signatures.examIncharge ?? signatures.classTeacher, true),
      principal: toBoolean(signatures.principal, true),
      examInchargeDigital: toBoolean(signatures.examInchargeDigital, Boolean(signatures.examInchargeSignatureUrl)),
      principalDigital: toBoolean(signatures.principalDigital, Boolean(signatures.principalSignatureUrl)),
      examInchargeSignatureUrl: String(signatures.examInchargeSignatureUrl || '').trim(),
      principalSignatureUrl: String(signatures.principalSignatureUrl || '').trim(),
      examInchargeSignaturePublicId: String(signatures.examInchargeSignaturePublicId || '').trim(),
      principalSignaturePublicId: String(signatures.principalSignaturePublicId || '').trim(),
    },
    formatId: 'admit-card',
    templateId: String(source.templateId || 'portrait-default'),
    canvasItems: parseCanvasItems(source.canvasItems),
  };
};

const toPersistableDesign = (design) => ({
  title: design.title,
  pageSize: design.pageSize,
  orientation: design.orientation,
  copiesPerSheet: design.copiesPerSheet,
  showHeader: design.showHeader,
  showSchoolLogo: design.showSchoolLogo,
  showSchoolAddress: design.showSchoolAddress,
  entryNote: design.entryNote,
  showEntryNote: design.showEntryNote,
  instructions: design.instructions,
  showInstructions: design.showInstructions,
  confirmationText: design.confirmationText,
  showConfirmation: design.showConfirmation,
  disclaimer: design.disclaimer,
  showDisclaimer: design.showDisclaimer,
  fields: design.fields,
  signatures: design.signatures,
  formatId: design.formatId,
  templateId: design.templateId,
  canvasItems: design.canvasItems,
});

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
};

const escapeRegexValue = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const resolveCardTitle = (design, examName) =>
  String(design.title || 'ADMIT CARD FOR {exam}').replace(/\{exam\}/gi, examName || 'EXAMINATION');

const loadSavedDesign = async (SchoolProfileModel) => {
  const profile = await SchoolProfileModel.findOne({}).select('admitCardDesign').lean();
  return parseDesign(profile?.admitCardDesign || {});
};

const buildSubjectRows = (student, datesheet) => {
  const datesheetRows = Array.isArray(datesheet?.subjects) ? datesheet.subjects : [];
  const studentSubjectIds = new Set(
    (student.subjects || []).map((subject) => String(subject?._id || subject || ''))
  );

  const filtered = studentSubjectIds.size
    ? datesheetRows.filter((row) => studentSubjectIds.has(String(row.subject?._id || row.subject || '')))
    : datesheetRows;

  const source = filtered.length ? filtered : (student.subjects || []).map((subject) => ({ subject }));

  return source.map((row) => {
    const subject = row.subject && typeof row.subject === 'object' ? row.subject : {};
    return {
      code: subject.code || '',
      name: String(subject.name || '').toUpperCase(),
      medium: '',
      date: formatDate(row.examDate),
    };
  });
};

const getAdmitCardDesign = asyncHandler(async (req, res) => {
  const SchoolProfileModel = req.models?.SchoolProfile || SchoolProfile;
  const design = await loadSavedDesign(SchoolProfileModel);
  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: toPersistableDesign(design),
  });
});

const saveAdmitCardDesign = asyncHandler(async (req, res) => {
  const SchoolProfileModel = req.models?.SchoolProfile || SchoolProfile;
  const design = toPersistableDesign(parseDesign(req.body?.design || req.body || {}));
  await SchoolProfileModel.findOneAndUpdate(
    {},
    { $set: { admitCardDesign: design } },
    { upsert: true, setDefaultsOnInsert: true }
  );
  return res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Admit card format saved.',
    data: design,
  });
});

const generateAdmitCards = asyncHandler(async (req, res) => {
  const payload = req.method === 'POST' ? req.body || {} : req.query || {};
  const examId = String(payload.examId || '').trim();
  const className = String(payload.class || '').trim();
  const section = String(payload.section || '').trim();
  const SchoolProfileModel = req.models?.SchoolProfile || SchoolProfile;
  const design = payload.design ? parseDesign(payload.design) : await loadSavedDesign(SchoolProfileModel);

  if (!examId || !className || !section) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'examId, class, and section are required.',
    });
  }

  const ExamDefinitionModel = req.models?.ExamDefinition || ExamDefinition;
  const StudentModel = req.models?.Student || Student;
  const DateSheetModel = req.models?.DateSheet || DateSheet;
  const CentreDetailModel = req.models?.CentreDetail || CentreDetail;

  const classFilter = { $regex: `^${escapeRegexValue(className)}$`, $options: 'i' };
  const sectionFilter = { $regex: `^${escapeRegexValue(section)}$`, $options: 'i' };

  const [exam, schoolProfile, centreDetail, datesheet, students] = await Promise.all([
    ExamDefinitionModel.findById(examId).lean(),
    SchoolProfileModel.findOne({}).lean(),
    CentreDetailModel.findOne({}).lean(),
    DateSheetModel.findOne({
      class: classFilter,
      examType: 'internal',
    })
      .sort({ publishedDate: -1, updatedAt: -1, createdAt: -1 })
      .populate('subjects.subject', 'name code')
      .lean(),
    StudentModel.find({
      class: classFilter,
      section: sectionFilter,
      isActive: true,
    })
      .select('rollNumber classRollNo name class section fatherName motherName gender dateOfBirth profileImage subjects medicalInfo')
      .populate('subjects', 'name code')
      .sort({ classRollNo: 1, name: 1 })
      .lean(),
  ]);

  if (!exam) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: 'Exam not found.' });
  }

  if (!students.length) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: `No students found for class ${className}, section ${section}.`,
    });
  }

  const schoolName = schoolProfile?.schoolName || req.tenant?.name || '';
  const schoolCode = schoolProfile?.schoolCode || '';
  const centreNo = centreDetail?.centreNo || schoolCode;
  const examCentre = centreDetail?.centreName || schoolName;
  const examName = exam.name || '';
  const cardTitle = resolveCardTitle(design, examName).toUpperCase();
  const instructionLines = design.instructions
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const mappedStudents = await Promise.all(students.map(async (student) => {
    const rollNo = student.classRollNo || student.rollNumber || '';
    const admissionNo = student.rollNumber || '';
    const admitCardId = `AC${String(exam.code || 'EXM').replace(/\s+/g, '')}${String(admissionNo || student._id).slice(-6)}`.toUpperCase();
    const pwdCategory = String(student.medicalInfo?.specialNeeds || '').trim() || 'Not Applicable';
    const qrPayload = [
      `Admit Card: ${admitCardId}`,
      `Name: ${student.name || ''}`,
      `Roll: ${rollNo}`,
      `Class: ${student.class || className}-${student.section || section}`,
      `Exam: ${examName}`,
    ].join('\n');

    let qrDataUrl = '';
    if (design.fields.qr) {
      try {
        qrDataUrl = await QRCode.toDataURL(qrPayload, { margin: 0, width: 220, errorCorrectionLevel: 'M' });
      } catch {
        qrDataUrl = '';
      }
    }

    return {
      name: String(student.name || '').toUpperCase(),
      fatherName: String(student.fatherName || '').toUpperCase(),
      gender: String(student.gender || '').trim() && String(student.gender).trim() !== 'Unspecified'
        ? String(student.gender).trim()
        : '',
      motherName: String(student.motherName || '').toUpperCase(),
      className: student.class || className,
      section: student.section || section,
      rollNo,
      rollNoInWords: numberToIndianWords(rollNo),
      admissionNo,
      dateOfBirth: formatDate(student.dateOfBirth),
      photoUrl: design.fields.photo ? (student.profileImage || '') : '',
      schoolNo: schoolCode,
      centreNo,
      examCentre: String(examCentre || '').toUpperCase(),
      schoolName: String(schoolName || '').toUpperCase(),
      pwdCategory,
      admitCardId,
      examinationLabel: `${String(examName || '').toUpperCase()} - CLASS: ${student.class || className}`,
      subjects: buildSubjectRows(student, datesheet),
      qrDataUrl,
    };
  }));

  const perSheet = design.copiesPerSheet === 2 ? 2 : 1;
  const sheets = [];
  for (let index = 0; index < mappedStudents.length; index += perSheet) {
    sheets.push(mappedStudents.slice(index, index + perSheet));
  }

  const templateData = {
    schoolName: String(schoolName || '').toUpperCase(),
    schoolLogoUrl: design.showSchoolLogo ? (schoolProfile?.logoUrl || '') : '',
    schoolAddress: schoolProfile?.address || '',
    examName,
    examCode: exam.code || '',
    className,
    section,
    design,
    cardTitle,
    instructionLines,
    examInchargeSignUrl:
      design.signatures.examIncharge && design.signatures.examInchargeDigital
        ? design.signatures.examInchargeSignatureUrl
        : '',
    principalSignUrl:
      design.signatures.principal && design.signatures.principalDigital
        ? design.signatures.principalSignatureUrl
        : '',
    pageSize: design.pageSize === 'legal' ? 'legal' : 'A4',
    twoUp: perSheet === 2,
    sheets,
    canvasItems: mapCanvasItemsForTemplate(design.canvasItems),
  };

  const pdfBuffer = await pdfGenerator.generatePDF('admit-card', templateData);
  const filename = `admit-cards_${String(exam.code || 'exam')}_${className}-${section}.pdf`.replace(/\s+/g, '_');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.status(HTTP_STATUS.OK).send(pdfBuffer);
});

const uploadAdmitCardSignature = asyncHandler(async (req, res) => {
  const role = String(req.params.role || '').trim();
  if (!['principal', 'examIncharge'].includes(role)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Signature role must be principal or examIncharge.',
    });
  }

  if (!req.files || !req.files.signature) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'No signature file provided. Send it as multipart field "signature".',
    });
  }

  const file = req.files.signature;
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.mimetype)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Only JPEG, PNG, or WebP images are accepted.',
    });
  }

  const SchoolProfileModel = req.models?.SchoolProfile || SchoolProfile;
  const existing = await SchoolProfileModel.findOne({}).select('admitCardDesign').lean();
  const currentDesign = parseDesign(existing?.admitCardDesign || {});
  const publicIdKey = `${role}SignaturePublicId`;
  const previousPublicId = currentDesign.signatures[publicIdKey];

  if (previousPublicId) {
    try {
      await deleteFromCloudinary(previousPublicId);
    } catch (_) {
      // Non-fatal — old asset may already be gone
    }
  }

  const tenantSlug = req.tenant?.slug || 'unknown';
  const publicId = `admit_card_${role}_sign_${tenantSlug}`;
  const uploadResult = await uploadToCloudinary(file.tempFilePath, 'capabble/admit-card-signatures', publicId);

  if (file.tempFilePath) {
    fs.unlink(file.tempFilePath, () => {});
  }

  currentDesign.signatures[`${role}SignatureUrl`] = uploadResult.url;
  currentDesign.signatures[publicIdKey] = uploadResult.publicId;
  currentDesign.signatures[`${role}Digital`] = true;

  await SchoolProfileModel.findOneAndUpdate(
    {},
    { $set: { admitCardDesign: toPersistableDesign(currentDesign) } },
    { upsert: true, setDefaultsOnInsert: true }
  );

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Digital signature uploaded.',
    data: toPersistableDesign(currentDesign),
  });
});

module.exports = {
  generateAdmitCards,
  getAdmitCardDesign,
  saveAdmitCardDesign,
  uploadAdmitCardSignature,
};
