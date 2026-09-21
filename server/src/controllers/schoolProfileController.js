const asyncHandler = require('../middleware/asyncHandler');
const { HTTP_STATUS } = require('../utils/constants');
const { uploadToCloudinary, deleteFromCloudinary } = require('../config/cloudinary');
const SchoolProfile = require('../models/SchoolProfile');
const { ensureStudentRollNumberRule } = require('../utils/assignClassRollNumbers');
const { backfillParentNameHonorificsIfNeeded } = require('../utils/parentNameHonorifics');
const Student = require('../models/Student');
const fs = require('fs');

const ALLOWED_UPDATE_FIELDS = [
  'schoolName',
  'schoolCode',
  'affiliationNo',
  'tagline',
  'address',
  'contact',
  'email',
];

const buildProfileResponse = (tenant, profile) => ({
  name: profile?.schoolName || tenant?.name || '',
  schoolCode: profile?.schoolCode || tenant?.metadata?.schoolCode || '',
  affiliationNo: profile?.affiliationNo || tenant?.metadata?.affiliationNo || '',
  affiliationTill: profile?.affiliationTill
    ? new Date(profile.affiliationTill).toISOString().slice(0, 10)
    : '',
  logoUrl: profile?.logoUrl || '',
  logoPublicId: profile?.logoPublicId || '',
  tagline: profile?.tagline || '',
  address: profile?.address || '',
  contact: profile?.contact || '',
  email: profile?.email || '',
  metadata: {
    studentRollNumberAssignment: profile?.metadata?.studentRollNumberAssignment || null,
    parentNameHonorifics: profile?.metadata?.parentNameHonorifics || null,
    uiContrast: profile?.metadata?.uiContrast || {
      enabled: true,
      darkBackgroundUsesLightText: true,
      lightBackgroundUsesDarkText: true,
      description:
        'Always use light (white) font colour on dark backgrounds and dark font colour on light backgrounds so text stays readable.',
    },
  },
});

// GET /school-profile
exports.getProfile = asyncHandler(async (req, res) => {
  const SchoolProfileModel = req.models?.SchoolProfile || SchoolProfile;
  const StudentModel = req.models?.Student || Student;
  await Promise.all([
    ensureStudentRollNumberRule(SchoolProfileModel),
    backfillParentNameHonorificsIfNeeded(SchoolProfileModel, StudentModel),
  ]);
  const profile = await SchoolProfileModel.findOne({}).lean();

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: buildProfileResponse(req.tenant, profile),
  });
});

// PUT /school-profile
exports.updateProfile = asyncHandler(async (req, res) => {
  const SchoolProfileModel = req.models?.SchoolProfile || SchoolProfile;

  const updates = {};
  for (const field of ALLOWED_UPDATE_FIELDS) {
    if (req.body[field] !== undefined) {
      updates[field] = String(req.body[field] || '').trim();
    }
  }

  if (req.body.affiliationTill !== undefined) {
    const raw = String(req.body.affiliationTill || '').trim();
    if (!raw) {
      updates.affiliationTill = null;
    } else {
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'affiliationTill must be a valid date.',
        });
      }
      updates.affiliationTill = parsed;
    }
  }

  const profile = await SchoolProfileModel.findOneAndUpdate(
    {},
    { $set: updates },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: buildProfileResponse(req.tenant, profile),
  });
});

// POST /school-profile/logo
exports.uploadLogo = asyncHandler(async (req, res) => {
  if (!req.files || !req.files.logo) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'No logo file provided. Send it as multipart field "logo".',
    });
  }

  const file = req.files.logo;
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.mimetype)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Only JPEG, PNG, or WebP images are accepted.',
    });
  }

  const SchoolProfileModel = req.models?.SchoolProfile || SchoolProfile;
  const existing = await SchoolProfileModel.findOne({}).lean();

  // Delete old logo from Cloudinary if present
  if (existing?.logoPublicId) {
    try {
      await deleteFromCloudinary(existing.logoPublicId);
    } catch (_) {
      // Non-fatal — old asset may already be gone
    }
  }

  const tenantSlug = req.tenant?.slug || 'unknown';
  const publicId = `school_logo_${tenantSlug}`;
  const uploadResult = await uploadToCloudinary(file.tempFilePath, 'sems/school-logos', publicId);

  // Clean up temp file
  if (file.tempFilePath) {
    fs.unlink(file.tempFilePath, () => {});
  }

  const profile = await SchoolProfileModel.findOneAndUpdate(
    {},
    { $set: { logoUrl: uploadResult.url, logoPublicId: uploadResult.publicId } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    data: buildProfileResponse(req.tenant, profile),
  });
});
