const User = require('../models/User');
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const Subject = require('../models/Subject');
const Candidate = require('../models/Candidate');
const DateSheet = require('../models/DateSheet');
const Room = require('../models/Room');
const AnswerSheet = require('../models/AnswerSheet');
const AnswerSheetDispatch = require('../models/AnswerSheetDispatch');
const FolderMapping = require('../models/FolderMapping');
const CBSEDatesheet = require('../models/CBSEDatesheet');
const CBSECircular = require('../models/CBSECircular');
const Calendar = require('../models/Calendar');
const { Form66, Form66Upload } = require('../models/Form66');
const Guideline = require('../models/Guideline');
const Undertaking = require('../models/Undertaking');
const CentreDetail = require('../models/CentreDetail');
const SeatingPlanTemplateSetting = require('../models/SeatingPlanTemplateSetting');
const SeatingPlanAllocation = require('../models/SeatingPlanAllocation');
const DutyAllocationSetting = require('../models/DutyAllocationSetting');
const DutyAssignment = require('../models/DutyAssignment');
const DutySelection = require('../models/DutySelection');
const Feedback = require('../models/Feedback');
const SupportTicket = require('../models/SupportTicket');
const AcademicSession = require('../models/AcademicSession');
const { AttendanceRecord, AttendanceUpload } = require('../models/AttendanceRecord');
const TimetableState = require('../models/TimetableState');
const TimetableVersion = require('../models/TimetableVersion');
const BellTimingVersion = require('../models/BellTimingVersion');
const OnboardingSession = require('../models/OnboardingSession');
const ExamCircular = require('../models/ExamCircular');
const ExamDefinition = require('../models/ExamDefinition');
const ExamResult = require('../models/ExamResult');
const CbseRegistration = require('../models/CbseRegistration');
const CbseClassSubjectMatrix = require('../models/CbseClassSubjectMatrix');
const { StaffAttendanceDaily, StudentAttendanceDaily, StudentAttendanceDay } = require('../models/AttndDailyRecord');
const SchoolProfile = require('../models/SchoolProfile');
const Alumni = require('../models/Alumni');
const TransportVehicle = require('../models/TransportVehicle');
const TransportRoute = require('../models/TransportRoute');
const TransportSelfStudent = require('../models/TransportSelfStudent');
const {
  AcademicLessonPlan,
  AcademicHomework,
  AcademicAssignment,
  AcademicQuiz,
  AcademicCurriculum,
} = require('../models/AcademicRecords');
const {
  ActivityClub,
  ActivityHouse,
  ActivityTour,
  ActivitySportsFacility,
  ActivitySportsMeet,
  ActivityFunction,
  ActivityEvent,
  ActivityCriteria,
  ActivityPoints,
  ActivityCertificate,
  ActivityCouncil,
  ActivityCouncilPost,
  ActivityCouncilRegistration,
} = require('../models/ActivityRecords');
const {
  MedicalCase,
  MedicalSupply,
} = require('../models/MedicalRecords');
const {
  AssetCategory,
  AssetLocation,
  AssetVendor,
  Asset,
  AssetAllocation,
  AssetTransfer,
  AssetMaintenance,
  AssetAudit,
  AssetAuditItem,
  AssetProcurement,
  AssetDisposal,
  AssetLifecycleEvent,
  AssetStockItem,
  AssetStockTransaction,
  AssetSettings,
} = require('../models/AssetRecords');

const tenantModelExports = {
  User,
  Teacher,
  Student,
  Subject,
  Candidate,
  DateSheet,
  Room,
  AnswerSheet,
  AnswerSheetDispatch,
  FolderMapping,
  CBSEDatesheet,
  CBSECircular,
  Calendar,
  Form66,
  Form66Upload,
  Guideline,
  Undertaking,
  CentreDetail,
  SeatingPlanTemplateSetting,
  SeatingPlanAllocation,
  DutyAllocationSetting,
  DutyAssignment,
  DutySelection,
  Feedback,
  SupportTicket,
  AcademicSession,
  AttendanceRecord,
  AttendanceUpload,
  TimetableState,
  TimetableVersion,
  BellTimingVersion,
  OnboardingSession,
  ExamCircular,
  ExamDefinition,
  ExamResult,
  CbseRegistration,
  CbseClassSubjectMatrix,
  StaffAttendanceDaily,
  StudentAttendanceDaily,
  StudentAttendanceDay,
  SchoolProfile,
  Alumni,
  TransportVehicle,
  TransportRoute,
  TransportSelfStudent,
  AcademicLessonPlan,
  AcademicHomework,
  AcademicAssignment,
  AcademicQuiz,
  AcademicCurriculum,
  ActivityClub,
  ActivityHouse,
  ActivityTour,
  ActivitySportsFacility,
  ActivitySportsMeet,
  ActivityFunction,
  ActivityEvent,
  ActivityCriteria,
  ActivityPoints,
  ActivityCertificate,
  ActivityCouncil,
  ActivityCouncilPost,
  ActivityCouncilRegistration,
  MedicalCase,
  MedicalSupply,
  AssetCategory,
  AssetLocation,
  AssetVendor,
  Asset,
  AssetAllocation,
  AssetTransfer,
  AssetMaintenance,
  AssetAudit,
  AssetAuditItem,
  AssetProcurement,
  AssetDisposal,
  AssetLifecycleEvent,
  AssetStockItem,
  AssetStockTransaction,
  AssetSettings,
};

const registerModelOnConnection = (modelExport, connection) => {
  if (modelExport && typeof modelExport.getModel === 'function') {
    return modelExport.getModel(connection);
  }

  if (modelExport?.modelName && modelExport?.schema) {
    return connection.models[modelExport.modelName]
      || connection.model(modelExport.modelName, modelExport.schema);
  }

  throw new Error('Invalid model export: expected getModel() or { modelName, schema }');
};

const getTenantModelKeys = () => Object.keys(tenantModelExports);

const registerTenantModels = (connection, requestedKeys = getTenantModelKeys()) => {
  const models = {};
  const keys = Array.isArray(requestedKeys) ? requestedKeys : [requestedKeys];

  keys.forEach((key) => {
    if (!tenantModelExports[key]) {
      throw new Error(`Unknown tenant model key '${key}'`);
    }

    models[key] = registerModelOnConnection(tenantModelExports[key], connection);
  });

  return models;
};

module.exports = {
  getTenantModelKeys,
  registerTenantModels
};
