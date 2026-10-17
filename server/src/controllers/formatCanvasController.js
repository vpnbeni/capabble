const fs = require('fs');
const asyncHandler = require('../middleware/asyncHandler');
const { HTTP_STATUS } = require('../utils/constants');
const { uploadToCloudinary } = require('../config/cloudinary');

const uploadFormatCanvasImage = asyncHandler(async (req, res) => {
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
  const publicId = `format_canvas_${tenantSlug}_${Date.now()}`;
  const uploadResult = await uploadToCloudinary(file.tempFilePath, 'capabble/format-canvas', publicId);

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

module.exports = { uploadFormatCanvasImage };
