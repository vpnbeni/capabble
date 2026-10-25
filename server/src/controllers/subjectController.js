const asyncHandler = require('../middleware/asyncHandler');
const Subject = require('../models/Subject');
const { generateResponse, getPaginationParams, buildPaginationResponse } = require('../utils/helpers');
const pdf = require('pdf-parse');
const fs = require('fs');
const os = require('os');
const { uploadDocumentToCloudinary } = require('../config/cloudinary');
const { SUCCESS_MESSAGES, HTTP_STATUS } = require('../utils/constants');

// @desc    Get all subjects
// @route   GET /api/subjects
// @access  Private
const getSubjects = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPaginationParams(req);
  const { isActive, search, class: classFilter, sortField, sortOrder } = req.query;

  // Build filter object
  const filter = {};
  if (isActive !== undefined) {
    filter.isActive = isActive === 'true';
  }

  // Add class filter
  if (classFilter) {
    filter.class = classFilter;
  }

  // Add search functionality
  if (search) {
    const searchRegex = new RegExp(search, 'i');
    filter.$or = [
      { name: searchRegex },
      { code: searchRegex }
    ];
  }

  // Build sort object
  let sortObj = { name: 1 }; // Default sort by name ascending
  if (sortField) {
    const validSortFields = ['name', 'code', 'class', 'duration', 'answerSheet'];
    if (validSortFields.includes(sortField)) {
      const sortDirection = sortOrder === 'desc' ? -1 : 1;
      sortObj = { [sortField]: sortDirection };
    }
  }

  // Get total count for pagination
  const totalCount = await Subject.countDocuments(filter);

  // Get subjects with pagination and sorting
  const subjects = await Subject.find(filter)
    .select('_id name code class duration isActive answerSheet')
    .sort(sortObj)
    .skip(skip)
    .limit(limit)
    .lean();

  // Build pagination response
  const response = buildPaginationResponse(subjects, totalCount, page, limit);

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, SUCCESS_MESSAGES.FETCHED, response.data, response.pagination)
  );
});

// @desc    Get single subject
// @route   GET /api/subjects/:id
// @access  Private
const getSubject = asyncHandler(async (req, res) => {
  const subject = await Subject.findById(req.params.id);

  if (!subject) {
    return res.status(HTTP_STATUS.NOT_FOUND).json(
      generateResponse(false, 'Subject not found')
    );
  }

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, SUCCESS_MESSAGES.FETCHED, subject)
  );
});

// @desc    Create new subject
// @route   POST /api/subjects
// @access  Private
const createSubject = asyncHandler(async (req, res) => {
  // Check if subject with same code and class already exists
  const existingSubject = await Subject.findOne({ 
    code: req.body.code,
    class: req.body.class 
  });
  
  if (existingSubject) {
    return res.status(HTTP_STATUS.CONFLICT).json(
      generateResponse(false, `Subject with code ${req.body.code} already exists for class ${req.body.class}`)
    );
  }

  const subject = await Subject.create(req.body);

  res.status(HTTP_STATUS.CREATED).json(
    generateResponse(true, SUCCESS_MESSAGES.CREATED, subject)
  );
});

// @desc    Update subject
// @route   PUT /api/subjects/:id
// @access  Private
const updateSubject = asyncHandler(async (req, res) => {
  let subject = await Subject.findById(req.params.id);

  if (!subject) {
    return res.status(HTTP_STATUS.NOT_FOUND).json(
      generateResponse(false, 'Subject not found')
    );
  }

  // Check for code+class conflicts (exclude current subject)
  const codeChanged = req.body.code && req.body.code !== subject.code;
  const classChanged = req.body.class && req.body.class !== subject.class;
  
  if (codeChanged || classChanged) {
    const checkCode = req.body.code || subject.code;
    const checkClass = req.body.class || subject.class;
    
    const existingSubject = await Subject.findOne({ 
      code: checkCode,
      class: checkClass,
      _id: { $ne: req.params.id }
    });
    
    if (existingSubject) {
      return res.status(HTTP_STATUS.CONFLICT).json(
        generateResponse(false, `Subject with code ${checkCode} already exists for class ${checkClass}`)
      );
    }
  }

  subject = await Subject.findByIdAndUpdate(
    req.params.id,
    req.body,
    {
      new: true,
      runValidators: true
    }
  );

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, SUCCESS_MESSAGES.UPDATED, subject)
  );
});

// @desc    Delete subject (permanent)
// @route   DELETE /api/subjects/:id
// @access  Private
const deleteSubject = asyncHandler(async (req, res) => {
  const subject = await Subject.findById(req.params.id)
  if (!subject) {
    return res.status(HTTP_STATUS.NOT_FOUND).json(
      generateResponse(false, 'Subject not found')
    )
  }

  await Subject.deleteOne({ _id: subject._id })

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, SUCCESS_MESSAGES.DELETED)
  )
})

// @desc    Get subject statistics
// @route   GET /api/subjects/stats
// @access  Private
const getSubjectStats = asyncHandler(async (req, res) => {
  const total = await Subject.countDocuments({ isActive: true });
  const class10th = await Subject.countDocuments({ class: '10th', isActive: true });
  const class12th = await Subject.countDocuments({ class: '12th', isActive: true });

  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, SUCCESS_MESSAGES.FETCHED, {
      total,
      class10th,
      class12th
    })
  );
});

module.exports = {
  getSubjects,
  getSubject,
  createSubject,
  updateSubject,
  deleteSubject,
  getSubjectStats
};

// @desc    Delete ALL subjects (permanent)
// @route   DELETE /api/subjects
// @access  Private (admin)
const deleteAllSubjects = asyncHandler(async (req, res) => {
  const result = await Subject.deleteMany({})
  res.status(HTTP_STATUS.OK).json(
    generateResponse(true, 'All subjects permanently deleted', { deletedCount: result.deletedCount })
  )
})

module.exports.deleteAllSubjects = deleteAllSubjects

// Helper function to parse answer sheet format
const parseAnswerSheet = (text) => {
  if (!text) return 'none';
  const normalized = text.toLowerCase().trim();
  if (normalized.includes('32')) return '32_pages';
  if (normalized.includes('20')) return '20_pages';
  if (normalized.includes('40') && normalized.includes('graph')) return '40_graph';
  return 'none';
};

const withTimeout = (promise, timeoutMs, message) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);
};

// Helper function to extract subjects from CBSE PDF format
const extractSubjectsFromCBSEPDF = (text) => {
  const subjects = [];
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  
  // Pattern: SubCode | SubjectName | Class | Duration(Hours) | AnswerSheet
  // Example: 002HINDI COURSE - A10th332 Pages
  // Format: CODE(3 digits) + NAME + CLASS(10th/12th) + DURATION(1 digit) + REST(answer sheet info)
  const subjectPattern = /^(\d{3})(.+?)(10th|12th)(\d)(.+)$/;
  
  for (const line of lines) {
    // Skip header lines
    if (line.includes('SubCode') || line.includes('SubjectName')) continue;
    
    const match = line.match(subjectPattern);
    if (match) {
      const code = match[1];
      const name = match[2].trim();
      const studentClass = match[3];
      const duration = parseInt(match[4]);
      const answerSheetText = match[5]; // This contains "32 Pages", "20 Pages", etc.
      
      subjects.push({
        code,
        name,
        class: studentClass,
        duration,
        answerSheet: parseAnswerSheet(answerSheetText),
        isActive: true
      });
    }
  }
  
  return subjects;
};

// @desc    Import subjects from CBSE PDF
// @route   POST /api/subjects/import-pdf
// @access  Private
module.exports.importSubjectsFromPdf = asyncHandler(async (req, res) => {
  console.log('Import request received');
  console.log('Files:', req.files);
  console.log('Body:', req.body);
  
  if (!req.files || !req.files.file) {
    console.log('No file found in request');
    return res.status(HTTP_STATUS.BAD_REQUEST).json(
      generateResponse(false, 'PDF file is required')
    );
  }
  
  const file = req.files.file;
  console.log('File details:', { name: file.name, size: file.size, mimetype: file.mimetype });
  
  // Validate file type
  if (file.mimetype !== 'application/pdf') {
    return res.status(HTTP_STATUS.BAD_REQUEST).json(
      generateResponse(false, 'Please upload a valid PDF file')
    );
  }
  
  try {
    // Parse PDF content
    const dataBuffer = fs.readFileSync(file.tempFilePath);
    const pdfData = await pdf(dataBuffer);
    const text = pdfData.text;
    
    if (!text || text.trim().length < 10) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        generateResponse(false, 'Could not extract text from PDF')
      );
    }
    
    // Extract subjects from PDF
    const extractedSubjects = extractSubjectsFromCBSEPDF(text);
    
    if (extractedSubjects.length === 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        generateResponse(false, 'No subjects found in PDF. Please check the format.')
      );
    }
    
    // Process subjects for insertion
    const inserted = [];
    const updated = [];
    const skipped = [];
    const errors = [];
    
    for (const subjectData of extractedSubjects) {
      try {
        // Check if subject with same code and class exists
        const existing = await Subject.findOne({ 
          code: subjectData.code, 
          class: subjectData.class 
        });
        
        if (existing) {
          // Update existing subject
          existing.name = subjectData.name;
          existing.duration = subjectData.duration;
          existing.answerSheet = subjectData.answerSheet;
          await existing.save();
          updated.push({ code: subjectData.code, class: subjectData.class });
        } else {
          // Create new subject
          const newSubject = await Subject.create(subjectData);
          inserted.push({ code: newSubject.code, class: newSubject.class });
        }
      } catch (error) {
        if (error.code === 11000) {
          // Duplicate key error
          skipped.push({ 
            code: subjectData.code, 
            class: subjectData.class,
            reason: 'Already exists'
          });
        } else {
          errors.push({ 
            code: subjectData.code, 
            class: subjectData.class,
            error: error.message 
          });
        }
      }
    }

    // Cloudinary archival is best-effort; do not block import completion.
    let uploadedUrl = null;
    try {
      const upload = await withTimeout(
        uploadDocumentToCloudinary(
          file.tempFilePath,
          'subjects/pdfs',
          `subjects_${Date.now()}`
        ),
        8000,
        'Cloudinary upload timed out'
      );
      uploadedUrl = upload.url;
    } catch (error) {
      console.error('Cloudinary upload skipped:', error.message);
    }
    
    return res.status(HTTP_STATUS.OK).json(
      generateResponse(true, 'Subjects import completed', {
        total: extractedSubjects.length,
        inserted: inserted.length,
        updated: updated.length,
        skipped: skipped.length,
        errors: errors.length,
        details: {
          inserted,
          updated,
          skipped,
          errors
        },
        pdfUrl: uploadedUrl
      })
    );
    
  } catch (error) {
    console.error('PDF import error:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      generateResponse(false, 'Error processing PDF file', { error: error.message })
    );
  } finally {
    if (file.tempFilePath && fs.existsSync(file.tempFilePath)) {
      fs.unlinkSync(file.tempFilePath);
    }
  }
});
