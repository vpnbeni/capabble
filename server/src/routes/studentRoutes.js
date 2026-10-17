const express = require('express');
const Joi = require('joi');
const {
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
} = require('../controllers/studentController');

const { protect } = require('../middleware/auth');
const { requireSectionInScope } = require('../rbac/scope');
const Student = require('../models/Student');
const { validateJoi, validateParams, validateQuery } = require('../middleware/validation');
const {
  createStudentSchema,
  updateStudentSchema,
  assignSubjectsSchema,
  studentQuerySchema,
  bulkUploadSchema,
  bulkDeleteSchema,
  documentUploadSchema,
  nextRollNumberSchema
} = require('../validations/studentValidation');

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// A teacher whose write access is limited to their own sections may only
// change individual students in those sections (no bulk or import routes).
const STUDENT_ID_PATH = /^\/([0-9a-fA-F]{24})(\/|$)/;
router.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const permission = req.method === 'DELETE' ? 'stdnt.students.delete' : 'stdnt.students.write';
  return requireSectionInScope(permission, async () => {
    const idMatch = req.path.match(STUDENT_ID_PATH);
    if (idMatch) {
      const student = await (req.models?.Student || Student).findById(idMatch[1]).select('class section').lean();
      return student ? { className: student.class, section: student.section } : null;
    }
    if (req.method === 'POST' && req.path === '/') {
      return { className: req.body?.class, section: req.body?.section };
    }
    return null;
  })(req, res, next);
});

// Object ID validation schema
const objectIdSchema = Joi.string()
  .pattern(/^[0-9a-fA-F]{24}$/)
  .required()
  .messages({
    'string.pattern.base': 'Invalid ID format'
  });

// Class validation schema
const classSchema = Joi.string()
  .trim()
  .min(2)
  .max(10)
  .required()
  .messages({
    'string.min': 'Class must be at least 2 characters',
    'string.max': 'Class cannot exceed 10 characters',
    'any.required': 'Class is required'
  });

// Section validation schema
const sectionSchema = Joi.string()
  .trim()
  .length(1)
  .uppercase()
  .required()
  .messages({
    'string.length': 'Section must be exactly 1 character',
    'any.required': 'Section is required'
  });

// Main student routes
router.route('/')
  .get(validateQuery(studentQuerySchema), getStudents)
  .post(validateJoi(createStudentSchema), createStudent);

// Statistics route
router.get('/stats', getStudentStats);

// Next roll number route
router.get('/next-roll-number', 
  validateQuery(nextRollNumberSchema), 
  getNextRollNumber
);

// Bulk operations
router.post('/bulk', validateJoi(bulkUploadSchema), bulkCreateStudents);
router.post('/bulk-delete', validateJoi(bulkDeleteSchema), bulkDeleteStudents);
router.get('/import-template', downloadStudentImportTemplate);
router.post('/import-template/upload', uploadStudentsFromTemplate);

// Class-based routes
router.get('/class/:className', 
  validateParams(Joi.object({ className: classSchema })),
  getStudentsByClass
);

// Class and section based routes
router.get('/class/:className/section/:section',
  validateParams(Joi.object({ 
    className: classSchema,
    section: sectionSchema
  })),
  getStudentsByClassSection
);

// Subject-based routes
router.get('/subject/:subjectId',
  validateParams(Joi.object({ subjectId: objectIdSchema })),
  getStudentsBySubject
);

// Individual student routes
router.route('/:id')
  .get(validateParams(Joi.object({ id: objectIdSchema })), getStudent)
  .put(
    validateParams(Joi.object({ id: objectIdSchema })),
    validateJoi(updateStudentSchema),
    updateStudent
  )
  .delete(validateParams(Joi.object({ id: objectIdSchema })), deleteStudent);

// Subject assignment routes
router.route('/:id/subjects')
  .post(
    validateParams(Joi.object({ id: objectIdSchema })),
    validateJoi(assignSubjectsSchema),
    assignSubjects
  )
  .delete(
    validateParams(Joi.object({ id: objectIdSchema })),
    validateJoi(assignSubjectsSchema),
    removeSubjects
  );

// Document management routes
router.route('/:id/documents')
  .post(
    validateParams(Joi.object({ id: objectIdSchema })),
    validateJoi(documentUploadSchema),
    uploadDocument
  );

router.delete('/:id/documents/:docId',
  validateParams(Joi.object({ 
    id: objectIdSchema,
    docId: objectIdSchema
  })),
  deleteDocument
);

// Profile image upload route
router.post('/:id/profile-image',
  validateParams(Joi.object({ id: objectIdSchema })),
  uploadProfileImage
);

module.exports = router;
