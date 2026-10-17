// User roles
// Legacy single-role field. Access is decided by RBAC roles (src/rbac); this is
// kept so older records and code paths still read sensibly.
const USER_ROLES = {
  ADMIN: 'admin',
  DATA_ENTRY_OPERATOR: 'data_entry_operator',
  STAFF: 'staff',
  PARENT: 'parent',
  STUDENT: 'student'
};

// Student classes
const STUDENT_CLASSES = {
  CLASS_1: '1st',
  CLASS_2: '2nd',
  CLASS_3: '3rd',
  CLASS_4: '4th',
  CLASS_5: '5th',
  CLASS_6: '6th',
  CLASS_7: '7th',
  CLASS_8: '8th',
  CLASS_9: '9th',
  CLASS_10: '10th',
  CLASS_11: '11th',
  CLASS_12: '12th',
};
const STUDENT_CLASS_LIST = Object.values(STUDENT_CLASSES);

// Student sections
const STUDENT_SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const STUDENT_GENDERS = ['Boy', 'Girl', 'Other', 'Unspecified'];

// Examination types
const EXAM_TYPES = {
  BOARD: 'board',
  INTERNAL: 'internal',
  PRACTICAL: 'practical',
  SUPPLEMENTARY: 'supplementary'
};

// Date sheet status
const DATESHEET_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

// Room facilities
const ROOM_FACILITIES = [
  'projector',
  'whiteboard',
  'blackboard',
  'ac',
  'fan',
  'microphone',
  'cctv',
  'wheelchair_accessible'
];

// Answer sheet dispatch status
const DISPATCH_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  DISPATCHED: 'dispatched',
  DELIVERED: 'delivered',
  RETURNED: 'returned'
};

// File upload paths
const UPLOAD_PATHS = {
  PROFILES: 'profiles',
  DOCUMENTS: 'documents',
  DATESHEETS: 'datesheets',
  ANSWER_SHEETS: 'answer_sheets',
  REPORTS: 'reports'
};

// Subject types
const SUBJECT_TYPES = {
  CORE: 'core',
  ELECTIVE: 'elective',
  OPTIONAL: 'optional',
  PRACTICAL: 'practical'
};

// Pagination defaults
const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100
};

// Time slots for examinations
const TIME_SLOTS = [
  { start: '10:30', end: '13:30', label: 'Morning (10:30 AM - 1:30 PM)' },
  { start: '14:00', end: '17:00', label: 'Afternoon (2:00 PM - 5:00 PM)' }
];

// CBSE board codes
const CBSE_CODES = {
  BOARD_CODE: '30',
  SCHOOL_CODE: process.env.CBSE_SCHOOL_CODE || '12345',
  CENTER_CODE: process.env.CBSE_CENTER_CODE || '001'
};

// Error messages
const ERROR_MESSAGES = {
  UNAUTHORIZED: 'Not authorized to access this route',
  FORBIDDEN: 'Access forbidden',
  NOT_FOUND: 'Resource not found',
  VALIDATION_ERROR: 'Validation failed',
  DUPLICATE_ERROR: 'Duplicate entry',
  SERVER_ERROR: 'Internal server error',
  TOKEN_EXPIRED: 'Token expired',
  INVALID_TOKEN: 'Invalid token',
  INVALID_CREDENTIALS: 'Invalid credentials',
  USER_NOT_FOUND: 'User not found',
  USER_INACTIVE: 'User account is inactive'
};

// Success messages
const SUCCESS_MESSAGES = {
  LOGIN_SUCCESS: 'Login successful',
  LOGOUT_SUCCESS: 'Logout successful',
  CREATED: 'Resource created successfully',
  UPDATED: 'Resource updated successfully',
  DELETED: 'Resource deleted successfully',
  FETCHED: 'Data fetched successfully'
};

// HTTP status codes
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500
};

// Regex patterns
const REGEX_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^[6-9]\d{9}$/,
  ROLL_NUMBER: /^[A-Z0-9]{1,20}$/,
  SUBJECT_CODE: /^[A-Z0-9]{3,8}$/,
  ROOM_NUMBER: /^[A-Z0-9\-]{1,10}$/
};

module.exports = {
  USER_ROLES,
  STUDENT_CLASSES,
  STUDENT_CLASS_LIST,
  STUDENT_SECTIONS,
  STUDENT_GENDERS,
  EXAM_TYPES,
  DATESHEET_STATUS,
  ROOM_FACILITIES,
  DISPATCH_STATUS,
  UPLOAD_PATHS,
  SUBJECT_TYPES,
  PAGINATION,
  TIME_SLOTS,
  CBSE_CODES,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  HTTP_STATUS,
  REGEX_PATTERNS
};
