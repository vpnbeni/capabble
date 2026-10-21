/**
 * Student ID cards: the school's card design and the printable PDF.
 *
 * Each card carries a QR with a random token (Student.idCardToken). The bus
 * crew scans it to mark a student on or off the bus. Reissuing a card rotates
 * the token, so a lost card stops working.
 */
const crypto = require('crypto');
const fs = require('fs');
const QRCode = require('qrcode');
const asyncHandler = require('../middleware/asyncHandler');
const { HTTP_STATUS } = require('../utils/constants');
const pdfGenerator = require('../utils/pdfGenerator');
const { uploadToCloudinary, deleteFromCloudinary } = require('../config/cloudinary');
const { parseCanvasItems, mapCanvasItemsForTemplate } = require('../utils/formatCanvasItems');
const { ID_CARD_QR_PREFIX, parseCardToken } = require('../modules/trnst/trips');

const MAX_CARDS = 600;
const HEX = /^#[0-9a-f]{6}$/i;
const BLOOD_GROUPS = new Set(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);

const DEFAULT_BACK_TEXT = [
  'This card is the property of the school and must be carried every day.',
  'If found, please return it to the school office.',
  'Show this card to the bus staff when boarding and leaving the school bus.'
].join('\n');

const toBoolean = (value, fallback = true) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const text = (value, fallback, max = 200) => (String(value ?? '').trim() || fallback).slice(0, max);

const parseDesign = (source = {}) => {
  const fields = source.fields || {};
  const signatures = source.signatures || {};
  return {
    title: text(source.title, 'STUDENT IDENTITY CARD', 60),
    orientation: source.orientation === 'landscape' ? 'landscape' : 'portrait',
    layout: source.layout === 'single' ? 'single' : 'sheet',
    accentColor: HEX.test(String(source.accentColor || '')) ? source.accentColor : '#1e3a8a',
    validity: text(source.validity, '', 40),
    showSchoolLogo: toBoolean(source.showSchoolLogo, true),
    showSchoolAddress: toBoolean(source.showSchoolAddress, true),
    showBack: toBoolean(source.showBack, true),
    backText: text(source.backText, DEFAULT_BACK_TEXT, 600),
    emergencyContact: text(source.emergencyContact, '', 60),
    fields: {
      photo: toBoolean(fields.photo, true),
      admissionNo: toBoolean(fields.admissionNo, true),
      classSection: toBoolean(fields.classSection, true),
      rollNo: toBoolean(fields.rollNo, false),
      dob: toBoolean(fields.dob, true),
      bloodGroup: toBoolean(fields.bloodGroup, true),
      fatherName: toBoolean(fields.fatherName, true),
      motherName: toBoolean(fields.motherName, false),
      guardianPhone: toBoolean(fields.guardianPhone, true),
      address: toBoolean(fields.address, true),
      bus: toBoolean(fields.bus, true),
      qr: toBoolean(fields.qr, true)
    },
    signatures: {
      principal: toBoolean(signatures.principal, true),
      principalSignatureUrl: String(signatures.principalSignatureUrl || '').trim(),
      principalSignaturePublicId: String(signatures.principalSignaturePublicId || '').trim()
    },
    formatId: 'id-card',
    canvasItems: parseCanvasItems(source.canvasItems)
  };
};

const loadDesign = async (SchoolProfile) => {
  const profile = await SchoolProfile.findOne({}).select('idCardDesign').lean();
  return parseDesign(profile?.idCardDesign || {});
};

const saveDesign = (SchoolProfile, design) => SchoolProfile.findOneAndUpdate(
  {},
  { $set: { idCardDesign: design } },
  { upsert: true, setDefaultsOnInsert: true }
);

const newToken = () => crypto.randomBytes(16).toString('base64url');

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
};

const formatAddress = (address = {}) => [address.street, address.city, address.state, address.pincode]
  .map((part) => String(part || '').trim()).filter(Boolean).join(', ');

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// GET /api/id-cards/design
const getDesign = asyncHandler(async (req, res) => {
  const design = await loadDesign(req.models.SchoolProfile);
  res.status(HTTP_STATUS.OK).json({ success: true, data: design });
});

// PUT /api/id-cards/design
const putDesign = asyncHandler(async (req, res) => {
  const design = parseDesign(req.body?.design || req.body || {});
  await saveDesign(req.models.SchoolProfile, design);
  res.status(HTTP_STATUS.OK).json({ success: true, message: 'ID card design saved.', data: design });
});

// POST /api/id-cards/design/signature — principal's signature image
const uploadSignature = asyncHandler(async (req, res) => {
  const file = req.files?.signature;
  if (!file) {
    return res.status(HTTP_STATUS.BAD_REQUEST)
      .json({ success: false, message: 'Send the signature as multipart field "signature".' });
  }
  if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.mimetype)) {
    return res.status(HTTP_STATUS.BAD_REQUEST)
      .json({ success: false, message: 'Only JPEG, PNG, or WebP images are accepted.' });
  }

  const { SchoolProfile } = req.models;
  const design = await loadDesign(SchoolProfile);
  if (design.signatures.principalSignaturePublicId) {
    try {
      await deleteFromCloudinary(design.signatures.principalSignaturePublicId);
    } catch (_) {
      // The old image may already be gone.
    }
  }
  const publicId = `id_card_principal_sign_${req.tenant?.slug || 'unknown'}`;
  const upload = await uploadToCloudinary(file.tempFilePath, 'capabble/id-card-signatures', publicId);
  if (file.tempFilePath) fs.unlink(file.tempFilePath, () => {});

  design.signatures.principalSignatureUrl = upload.url;
  design.signatures.principalSignaturePublicId = upload.publicId;
  await saveDesign(SchoolProfile, design);
  return res.status(HTTP_STATUS.OK).json({ success: true, message: 'Signature uploaded.', data: design });
});

/** Route and stop for each student, from transport assignments when that module is on. */
const loadBusInfo = async (models, studentIds) => {
  const { TransportAssignment, TransportRoute, TransportVehicle } = models;
  if (!TransportAssignment || !TransportRoute) return new Map();
  const assignments = await TransportAssignment.find({ studentId: { $in: studentIds }, isActive: true }).lean();
  if (!assignments.length) return new Map();
  const routes = await TransportRoute.find({ _id: { $in: assignments.map((row) => row.routeId) } })
    .select('name code vehicleId').lean();
  const vehicles = TransportVehicle
    ? await TransportVehicle.find({ _id: { $in: routes.map((route) => route.vehicleId).filter(Boolean) } })
      .select('busNo').lean()
    : [];
  const routeById = new Map(routes.map((route) => [String(route._id), route]));
  const busById = new Map(vehicles.map((vehicle) => [String(vehicle._id), vehicle.busNo]));
  return new Map(assignments.map((row) => {
    const route = routeById.get(String(row.routeId));
    return [String(row.studentId), {
      busNo: route?.vehicleId ? busById.get(String(route.vehicleId)) || '' : '',
      route: route?.code || route?.name || '',
      stop: row.stopName || ''
    }];
  }));
};

// Cards per A4 page in each orientation (CR80 card, 3 mm gutters).
const PER_SHEET = { portrait: 9, landscape: 10 };
const COLUMNS = { portrait: 3, landscape: 2 };

/** Split cards into pages; when printing backs, each front page is followed by its mirrored back page. */
const buildPages = (cards, design) => {
  const perPage = design.layout === 'single' ? 1 : PER_SHEET[design.orientation];
  const columns = design.layout === 'single' ? 1 : COLUMNS[design.orientation];
  const pages = [];
  for (let index = 0; index < cards.length; index += perPage) {
    const front = cards.slice(index, index + perPage);
    pages.push({ isBack: false, cards: front });
    if (design.showBack) {
      // Long-edge duplex flips the sheet left to right, so reverse each row.
      const rows = [];
      for (let row = 0; row < front.length; row += columns) {
        const cells = front.slice(row, row + columns);
        while (cells.length < columns) cells.push({ blank: true });
        rows.push(cells.reverse());
      }
      pages.push({ isBack: true, cards: rows.flat() });
    }
  }
  return pages;
};

// POST /api/id-cards/generate { class, section, studentIds, reissue }
const generateCards = asyncHandler(async (req, res) => {
  const { Student, SchoolProfile, AcademicSession } = req.models;
  const body = req.body || {};
  const design = body.design ? parseDesign(body.design) : await loadDesign(SchoolProfile);
  const reissue = toBoolean(body.reissue, false);
  const className = String(body.class || '').trim();
  const section = String(body.section || '').trim();
  const studentIds = Array.isArray(body.studentIds)
    ? body.studentIds.map(String).filter((id) => /^[a-f0-9]{24}$/i.test(id))
    : [];

  const filter = { isActive: true };
  if (studentIds.length) {
    filter._id = { $in: studentIds };
  } else if (className) {
    filter.class = { $regex: `^${escapeRegex(className)}$`, $options: 'i' };
    if (section) filter.section = { $regex: `^${escapeRegex(section)}$`, $options: 'i' };
  } else {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: 'Choose a class or select students.' });
  }

  const students = await Student.find(filter)
    .select([
      '+idCardToken name rollNumber classRollNo class section dateOfBirth fatherName motherName',
      'guardianPhone address medicalInfo.bloodGroup profileImage busNo'
    ].join(' '))
    .sort({ class: 1, section: 1, classRollNo: 1, name: 1 })
    .limit(MAX_CARDS + 1)
    .lean();
  if (!students.length) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: 'No students found for this selection.' });
  }
  if (students.length > MAX_CARDS) {
    return res.status(HTTP_STATUS.BAD_REQUEST)
      .json({ success: false, message: `Print at most ${MAX_CARDS} cards at a time. Choose one class or section.` });
  }

  // Give every student a token; reissue replaces it so the old card stops scanning.
  const issuedAt = new Date();
  const tokenUpdates = [];
  students.forEach((student) => {
    if (!student.idCardToken || reissue) {
      student.idCardToken = newToken();
      tokenUpdates.push({
        updateOne: {
          filter: { _id: student._id },
          update: { $set: { idCardToken: student.idCardToken, idCardIssuedAt: issuedAt } }
        }
      });
    }
  });
  if (tokenUpdates.length) await Student.bulkWrite(tokenUpdates);

  const [school, session, busInfo] = await Promise.all([
    SchoolProfile.findOne({}).select('schoolName logoUrl address contact').lean(),
    AcademicSession ? AcademicSession.findOne({ isCurrent: true }).select('label').lean() : null,
    design.fields.bus ? loadBusInfo(req.models, students.map((student) => student._id)) : new Map()
  ]);

  const cards = await Promise.all(students.map(async (student) => {
    const bus = busInfo.get(String(student._id))
      || (student.busNo ? { busNo: student.busNo, route: '', stop: '' } : null);
    const bloodGroup = String(student.medicalInfo?.bloodGroup || '').trim();
    return {
      name: String(student.name || '').toUpperCase(),
      admissionNo: student.rollNumber || '',
      classSection: [student.class, student.section].filter(Boolean).join(' - '),
      rollNo: student.classRollNo || '',
      dob: formatDate(student.dateOfBirth),
      bloodGroup: BLOOD_GROUPS.has(bloodGroup) ? bloodGroup : '',
      fatherName: student.fatherName || '',
      motherName: student.motherName || '',
      guardianPhone: student.guardianPhone || '',
      address: formatAddress(student.address),
      photoUrl: student.profileImage || '',
      initials: String(student.name || '?').split(/\s+/).filter(Boolean).slice(0, 2)
        .map((part) => part[0]).join('').toUpperCase(),
      bus: bus && (bus.busNo || bus.route)
        ? [bus.busNo && `Bus ${bus.busNo}`, bus.stop].filter(Boolean).join(' · ')
        : '',
      qrDataUrl: design.fields.qr
        ? await QRCode.toDataURL(`${ID_CARD_QR_PREFIX}${student.idCardToken}`, {
          margin: 0, width: 240, errorCorrectionLevel: 'M'
        })
        : ''
    };
  }));

  const schoolName = school?.schoolName || req.tenant?.name || '';
  const pdf = await pdfGenerator.generatePDF('id-card', {
    design,
    schoolName,
    schoolLogoUrl: design.showSchoolLogo ? (school?.logoUrl || '') : '',
    schoolAddress: design.showSchoolAddress ? (school?.address || '') : '',
    schoolPhone: school?.contact || '',
    emergencyContact: design.emergencyContact || school?.contact || '',
    validity: design.validity || session?.label || '',
    backLines: design.backText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    principalSignUrl: design.signatures.principal ? design.signatures.principalSignatureUrl : '',
    portrait: design.orientation === 'portrait',
    single: design.layout === 'single',
    pages: buildPages(cards, design),
    canvasItems: mapCanvasItemsForTemplate(design.canvasItems)
  });

  const label = studentIds.length ? 'selected' : [className, section].filter(Boolean).join('-');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="id-cards_${label.replace(/[^A-Za-z0-9-]+/g, '_')}.pdf"`);
  res.setHeader('X-Cards-Issued', String(tokenUpdates.length));
  return res.status(HTTP_STATUS.OK).send(pdf);
});

// GET /api/id-cards/classes — classes and sections with how many cards are issued
const listClasses = asyncHandler(async (req, res) => {
  const students = await req.models.Student.find({ isActive: true }).select('class section idCardIssuedAt -_id').lean();
  const byKey = new Map();
  students.forEach((student) => {
    const className = String(student.class || '').trim();
    if (!className) return;
    const section = String(student.section || '').trim();
    const key = `${className}|${section}`;
    const row = byKey.get(key) || { className, section, students: 0, issued: 0 };
    row.students += 1;
    if (student.idCardIssuedAt) row.issued += 1;
    byKey.set(key, row);
  });
  const rows = [...byKey.values()].sort((a, b) => a.className.localeCompare(b.className, undefined, { numeric: true })
    || a.section.localeCompare(b.section));
  res.json({ success: true, data: rows });
});

// GET /api/id-cards/verify/:token — who a scanned card belongs to
const verifyCard = asyncHandler(async (req, res) => {
  const token = parseCardToken(decodeURIComponent(req.params.token || ''));
  const student = token
    ? await req.models.Student.findOne({ idCardToken: token })
      .select('name rollNumber class section profileImage isActive idCardIssuedAt').lean()
    : null;
  if (!student) {
    return res.status(HTTP_STATUS.NOT_FOUND)
      .json({ success: false, message: 'Card not recognised. It may have been replaced.' });
  }
  return res.json({
    success: true,
    data: {
      studentId: student._id,
      name: student.name,
      rollNumber: student.rollNumber,
      className: student.class,
      section: student.section,
      profileImage: student.profileImage || null,
      isActive: student.isActive !== false,
      issuedAt: student.idCardIssuedAt
    }
  });
});

module.exports = {
  parseDesign, buildPages, getDesign, putDesign, uploadSignature, listClasses, generateCards, verifyCard
};
