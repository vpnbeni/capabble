const Joi = require('joi');
const { STUDENT_GENDERS, REGEX_PATTERNS } = require('../utils/constants');

// Base student schema
const baseStudentSchema = {
  rollNumber: Joi.string()
    .pattern(REGEX_PATTERNS.ROLL_NUMBER)
    .required()
    .messages({
      'string.pattern.base': 'Admission number must be 1-20 characters with letters and numbers only',
      'any.required': 'Roll number is required'
    }),
  
  name: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.min': 'Name must be at least 2 characters',
      'string.max': 'Name cannot exceed 100 characters',
      'any.required': 'Name is required'
    }),
  
  email: Joi.string()
    .email()
    .trim()
    .lowercase()
    .optional()
    .allow('')
    .messages({
      'string.email': 'Please provide a valid email address'
    }),
  
  phone: Joi.string()
    .pattern(REGEX_PATTERNS.PHONE)
    .optional()
    .allow('')
    .messages({
      'string.pattern.base': 'Please provide a valid 10-digit phone number'
    }),

  penNumber: Joi.string()
    .trim()
    .max(50)
    .optional()
    .allow('')
    .messages({
      'string.max': 'PEN number cannot exceed 50 characters'
    }),

  house: Joi.string()
    .trim()
    .max(50)
    .optional()
    .allow('')
    .messages({
      'string.max': 'House cannot exceed 50 characters'
    }),

  houseId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional()
    .allow(null, '')
    .messages({
      'string.pattern.base': 'Invalid house ID format',
    }),

  busNo: Joi.string()
    .trim()
    .max(30)
    .optional()
    .allow('')
    .messages({
      'string.max': 'Bus number cannot exceed 30 characters'
    }),
  
  class: Joi.string()
    .trim()
    .min(1)
    .max(50)
    .required()
    .messages({
      'string.min': 'Class is required',
      'string.max': 'Class cannot exceed 50 characters',
      'any.required': 'Class is required'
    }),
  
  section: Joi.string()
    .trim()
    .max(50)
    .required()
    .messages({
      'string.max': 'Section cannot exceed 50 characters',
      'any.required': 'Section is required'
    }),

  gender: Joi.string()
    .valid(...STUDENT_GENDERS)
    .optional()
    .default('Unspecified')
    .messages({
      'any.only': 'Gender must be one of: ' + STUDENT_GENDERS.join(', ')
    }),
  
  subjects: Joi.array()
    .items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/))
    .optional()
    .messages({
      'string.pattern.base': 'Invalid subject ID format'
    }),
  
  fatherName: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.min': 'Father name must be at least 2 characters',
      'string.max': 'Father name cannot exceed 100 characters',
      'any.required': 'Father name is required'
    }),
  
  motherName: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.min': 'Mother name must be at least 2 characters',
      'string.max': 'Mother name cannot exceed 100 characters',
      'any.required': 'Mother name is required'
    }),
  
  guardianName: Joi.string()
    .trim()
    .max(100)
    .allow('', null),

  guardianEmail: Joi.string()
    .trim()
    .lowercase()
    .email()
    .allow('', null)
    .messages({
      'string.email': 'Please provide a valid guardian email'
    }),

  guardianPhone: Joi.string()
    .pattern(REGEX_PATTERNS.PHONE)
    .required()
    .messages({
      'string.pattern.base': 'Please provide a valid guardian phone number',
      'any.required': 'Guardian phone is required'
    }),
  
  address: Joi.object({
    street: Joi.string()
      .trim()
      .min(5)
      .max(200)
      .required()
      .messages({
        'string.min': 'Street address must be at least 5 characters',
        'string.max': 'Street address cannot exceed 200 characters',
        'any.required': 'Street address is required'
      }),
    
    city: Joi.string()
      .trim()
      .min(2)
      .max(50)
      .required()
      .messages({
        'string.min': 'City must be at least 2 characters',
        'string.max': 'City cannot exceed 50 characters',
        'any.required': 'City is required'
      }),
    
    state: Joi.string()
      .trim()
      .min(2)
      .max(50)
      .required()
      .messages({
        'string.min': 'State must be at least 2 characters',
        'string.max': 'State cannot exceed 50 characters',
        'any.required': 'State is required'
      }),
    
    pincode: Joi.string()
      .pattern(/^\d{6}$/)
      .required()
      .messages({
        'string.pattern.base': 'Please provide a valid 6-digit pincode',
        'any.required': 'Pincode is required'
      })
  }).required(),
  
  dateOfBirth: Joi.date()
    .max('now')
    .required()
    .messages({
      'date.max': 'Date of birth cannot be in the future',
      'any.required': 'Date of birth is required'
    }),
  
  admissionDate: Joi.date()
    .max('now')
    .required()
    .messages({
      'date.max': 'Admission date cannot be in the future',
      'any.required': 'Admission date is required'
    }),
  
  aadharNumber: Joi.string()
    .pattern(/^\d{12}$/)
    .optional()
    .allow('')
    .messages({
      'string.pattern.base': 'Please provide a valid 12-digit Aadhar number'
    }),
  
  category: Joi.string()
    .valid('General', 'OBC', 'SC', 'ST', 'EWS')
    .required()
    .messages({
      'any.only': 'Category must be one of: General, OBC, SC, ST, EWS',
      'any.required': 'Category is required'
    }),
  
  religion: Joi.string()
    .trim()
    .max(30)
    .optional()
    .allow('')
    .messages({
      'string.max': 'Religion cannot exceed 30 characters'
    }),
  
  nationality: Joi.string()
    .trim()
    .max(30)
    .default('Indian')
    .optional()
    .messages({
      'string.max': 'Nationality cannot exceed 30 characters'
    }),
  
  previousSchool: Joi.object({
    name: Joi.string()
      .trim()
      .max(200)
      .optional()
      .allow('')
      .messages({
        'string.max': 'Previous school name cannot exceed 200 characters'
      }),
    
    board: Joi.string()
      .trim()
      .max(50)
      .optional()
      .allow('')
      .messages({
        'string.max': 'Previous board cannot exceed 50 characters'
      }),
    
    passingYear: Joi.number()
      .integer()
      .min(1950)
      .max(new Date().getFullYear())
      .optional()
      .messages({
        'number.min': 'Passing year must be after 1950',
        'number.max': 'Passing year cannot be in the future'
      }),
    
    percentage: Joi.number()
      .min(0)
      .max(100)
      .optional()
      .messages({
        'number.min': 'Percentage cannot be negative',
        'number.max': 'Percentage cannot be more than 100'
      })
  }).optional(),
  
  medicalInfo: Joi.object({
    bloodGroup: Joi.string()
      .valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')
      .optional()
      .allow('')
      .messages({
        'any.only': 'Blood group must be one of: A+, A-, B+, B-, AB+, AB-, O+, O-'
      }),
    
    allergies: Joi.array()
      .items(Joi.string().trim().max(100))
      .optional()
      .messages({
        'string.max': 'Allergy description cannot exceed 100 characters'
      }),
    
    medications: Joi.array()
      .items(Joi.string().trim().max(100))
      .optional()
      .messages({
        'string.max': 'Medication description cannot exceed 100 characters'
      }),
    
    specialNeeds: Joi.string()
      .trim()
      .max(500)
      .optional()
      .allow('')
      .messages({
        'string.max': 'Special needs description cannot exceed 500 characters'
      })
  }).optional(),
  
  notes: Joi.string()
    .trim()
    .max(1000)
    .optional()
    .allow('')
    .messages({
      'string.max': 'Notes cannot exceed 1000 characters'
    }),
  
  isActive: Joi.boolean()
    .optional()
    .default(true)
};

// Create student schema
const createStudentSchema = Joi.object(baseStudentSchema);

// Update student schema (all fields optional except ID validation)
const updateStudentSchema = Joi.object({
  ...Object.keys(baseStudentSchema).reduce((acc, key) => {
    if (key === 'rollNumber') {
      // Roll number is optional for updates but must be valid if provided
      acc[key] = baseStudentSchema[key].optional();
    } else {
      acc[key] = baseStudentSchema[key].optional();
    }
    return acc;
  }, {})
});

// Subject assignment schema
const assignSubjectsSchema = Joi.object({
  subjectIds: Joi.array()
    .items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/))
    .min(1)
    .required()
    .messages({
      'array.min': 'At least one subject ID is required',
      'string.pattern.base': 'Invalid subject ID format',
      'any.required': 'Subject IDs are required'
    })
});

// Student query schema
const studentQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(500).optional(),
  search: Joi.string().trim().optional(),
  class: Joi.string().trim().max(50).optional(),
  section: Joi.string().trim().max(50).optional(),
  subject: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
  category: Joi.string().valid('General', 'OBC', 'SC', 'ST', 'EWS').optional(),
  isActive: Joi.string().valid('true', 'false').optional(),
  sort: Joi.string().optional(),
  // Lightweight list mode for pickers / report cards (skips populate + roll backfill)
  lite: Joi.string().valid('true', 'false').optional(),
  populate: Joi.string().valid('true', 'false').optional(),
  skipBackfill: Joi.string().valid('true', 'false').optional(),
  fields: Joi.string().trim().max(500).optional(),
});

// Bulk upload schema
const bulkUploadSchema = Joi.object({
  students: Joi.array()
    .items(createStudentSchema)
    .min(1)
    .max(100)
    .required()
    .messages({
      'array.min': 'At least one student is required',
      'array.max': 'Cannot upload more than 100 students at once',
      'any.required': 'Students array is required'
    })
});

const bulkDeleteSchema = Joi.object({
  ids: Joi.array()
    .items(
      Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .messages({
          'string.pattern.base': 'Invalid student ID format',
        })
    )
    .min(1)
    .max(250)
    .required()
    .messages({
      'array.min': 'At least one student id is required',
      'array.max': 'Cannot delete more than 250 students at once',
      'any.required': 'Student ids are required',
    }),
});

// Document upload schema
const documentUploadSchema = Joi.object({
  type: Joi.string()
    .valid('aadhar', 'birth_certificate', 'previous_marksheet', 'transfer_certificate', 'photo', 'other')
    .required()
    .messages({
      'any.only': 'Document type must be one of: aadhar, birth_certificate, previous_marksheet, transfer_certificate, photo, other',
      'any.required': 'Document type is required'
    })
});

// Next roll number query schema
const nextRollNumberSchema = Joi.object({
  class: Joi.string()
    .trim()
    .min(1)
    .max(50)
    .required()
    .messages({
      'string.min': 'Class is required',
      'string.max': 'Class cannot exceed 50 characters',
      'any.required': 'Class is required'
    }),
  
  section: Joi.string()
    .trim()
    .max(50)
    .required()
    .messages({
      'string.max': 'Section cannot exceed 50 characters',
      'any.required': 'Section is required'
    })
});

module.exports = {
  createStudentSchema,
  updateStudentSchema,
  assignSubjectsSchema,
  studentQuerySchema,
  bulkUploadSchema,
  bulkDeleteSchema,
  documentUploadSchema,
  nextRollNumberSchema
};
