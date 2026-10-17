const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload image to Cloudinary
 * @param {string} filePath - Path to the file to upload
 * @param {string} folder - Folder name in Cloudinary
 * @param {string} publicId - Optional public ID for the image
 * @returns {Promise<Object>} - Cloudinary upload response
 */
const uploadToCloudinary = async (filePath, folder = 'students', publicId = null) => {
  try {
    const options = {
      folder: folder,
      resource_type: 'image',
      transformation: [
        { width: 500, height: 500, crop: 'limit' },
        { quality: 'auto' },
        { fetch_format: 'auto' }
      ]
    };

    if (publicId) {
      options.public_id = publicId;
      options.overwrite = true;
    }

    const result = await cloudinary.uploader.upload(filePath, options);
    return {
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      width: result.width,
      height: result.height
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw new Error('Failed to upload image to Cloudinary');
  }
};

/**
 * Delete image from Cloudinary
 * @param {string} publicId - Public ID of the image to delete
 * @returns {Promise<Object>} - Cloudinary delete response
 */
const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw new Error('Failed to delete image from Cloudinary');
  }
};

/**
 * Upload document/raw file (PDF, etc.) to Cloudinary
 * @param {string|Buffer} filePathOrBuffer - Path to file or buffer
 * @param {string} folder - Folder name in Cloudinary
 * @param {string} publicId - Optional public ID (for overwrite, e.g. guidelines)
 * @returns {Promise<Object>} - { url, publicId }
 */
const uploadDocumentToCloudinary = async (filePathOrBuffer, folder, publicId = null) => {
  try {
    const options = {
      folder,
      resource_type: 'raw',
    };
    if (publicId) {
      options.public_id = publicId;
      options.overwrite = true;
    }
    const result = typeof filePathOrBuffer === 'string'
      ? await cloudinary.uploader.upload(filePathOrBuffer, options)
      : await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(options, (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }).end(filePathOrBuffer);
        });
    return {
      url: result.secure_url,
      publicId: result.public_id,
    };
  } catch (error) {
    console.error('Cloudinary document upload error:', error);
    const msg = error?.message || error?.http_code || 'Unknown Cloudinary error';
    throw new Error(`Failed to upload document to Cloudinary: ${msg}`);
  }
};

/**
 * Delete raw/document from Cloudinary
 * @param {string} publicId - Public ID of the resource
 * @returns {Promise<Object>} - Cloudinary delete response
 */
const deleteRawFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
    return result;
  } catch (error) {
    console.error('Cloudinary delete raw error:', error);
    throw new Error('Failed to delete document from Cloudinary');
  }
};

/**
 * Upload Form 66 file (TXT or PDF) to Cloudinary
 * @param {Buffer} buffer - File buffer
 * @param {string} filename - Original filename
 * @param {string} type - 'original' for TXT or 'processed' for PDF
 * @returns {Promise<Object>} - { url, publicId }
 */
const uploadForm66ToCloudinary = async (buffer, filename, type = 'original') => {
  try {
    const folder = 'capabble/form66';
    const timestamp = Date.now();
    const baseName = filename.replace(/\.[^/.]+$/, ''); // Remove extension
    const publicId = `${baseName}_${type}_${timestamp}`;

    const options = {
      folder,
      resource_type: 'raw',
      public_id: publicId,
    };

    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(options, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }).end(buffer);
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
    };
  } catch (error) {
    console.error('Cloudinary Form 66 upload error:', error);
    throw new Error('Failed to upload Form 66 file to Cloudinary');
  }
};

/**
 * Extract public ID from Cloudinary URL
 * @param {string} url - Cloudinary URL
 * @returns {string|null} - Public ID or null
 */
const extractPublicId = (url) => {
  if (!url || !url.includes('cloudinary.com')) {
    return null;
  }

  try {
    // Extract public_id from URL
    // Example: https://res.cloudinary.com/demo/image/upload/v1234567890/folder/image.jpg
    const parts = url.split('/upload/');
    if (parts.length < 2) return null;

    const pathParts = parts[1].split('/');
    // Remove version (v1234567890) if present
    const relevantParts = pathParts.filter(part => !part.startsWith('v') || isNaN(part.substring(1)));
    
    // Join folder and filename, remove extension
    const publicIdWithExt = relevantParts.join('/');
    const publicId = publicIdWithExt.substring(0, publicIdWithExt.lastIndexOf('.')) || publicIdWithExt;
    
    return publicId;
  } catch (error) {
    console.error('Error extracting public ID:', error);
    return null;
  }
};

module.exports = {
  cloudinary,
  uploadToCloudinary,
  deleteFromCloudinary,
  extractPublicId,
  uploadDocumentToCloudinary,
  deleteRawFromCloudinary,
  uploadForm66ToCloudinary,
};
