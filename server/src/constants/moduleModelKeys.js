/**
 * Maps purchasable modules to the Mongoose model keys they require.
 *
 * Model keys must match the export keys in registerTenantModels.js exactly.
 * Core models are ALWAYS loaded regardless of which modules are active.
 *
 * The mapping is module-level (not feature-level): if ANY feature in a module
 * is enabled, ALL models for that module are registered. This is simpler and
 * safer than tracking per-feature model dependencies.
 */
const { getModuleFeatureKeys } = require('./tenantFeatures');

/**
 * Module → Model keys mapping.
 *
 * core:      Shared kernel — always loaded for auth, sessions, event bus, etc.
 * cntr:      Exam centre management models
 * timetable: Timetable generation models
 */
const MODULE_MODEL_KEYS = Object.freeze({
  core: Object.freeze([
    'User',
    'Teacher',
    'Subject',
    'Room',
    'AcademicSession',
    'CBSEDatesheet',
    'Calendar',
    'Feedback',
    'SupportTicket',
    'OnboardingSession',
    'SchoolProfile',
  ]),
  cntr: Object.freeze([
    'Student',
    'Candidate',
    'DateSheet',
    'AnswerSheet',
    'AnswerSheetDispatch',
    'FolderMapping',
    'CBSECircular',
    'Form66',
    'Form66Upload',
    'Guideline',
    'Undertaking',
    'CentreDetail',
    'SeatingPlanTemplateSetting',
    'SeatingPlanAllocation',
    'DutyAllocationSetting',
    'DutyAssignment',
    'DutySelection',
    'AttendanceRecord',
    'AttendanceUpload',
  ]),
  exmcl: Object.freeze([
    'Student',
    'Candidate',
    'DateSheet',
    'AnswerSheet',
    'AnswerSheetDispatch',
    'FolderMapping',
    'CBSECircular',
    'Form66',
    'Form66Upload',
    'Guideline',
    'Undertaking',
    'CentreDetail',
    'SeatingPlanTemplateSetting',
    'SeatingPlanAllocation',
    'DutyAllocationSetting',
    'DutyAssignment',
    'DutySelection',
    'AttendanceRecord',
    'AttendanceUpload',
    'ExamCircular',
    'ExamDefinition',
    'ExamResult',
    'CbseRegistration',
    'CbseClassSubjectMatrix',
  ]),
  attnd: Object.freeze([
    'Teacher',
    'Student',
    'TimetableState',
    'StaffAttendanceDaily',
    'StudentAttendanceDaily',
    'StudentAttendanceDay',
  ]),
  timetable: Object.freeze([
    'TimetableState',
    'TimetableVersion',
    'BellTimingVersion',
  ]),
  stdnt: Object.freeze([
    'Student',
    'AcademicSession',
    'Alumni',
  ]),
  trnst: Object.freeze([
    'TransportVehicle',
    'TransportRoute',
    'TransportSelfStudent',
    'Student',
  ]),
  acdmc: Object.freeze([
    'AcademicLessonPlan',
    'AcademicHomework',
    'AcademicAssignment',
    'AcademicQuiz',
    'AcademicCurriculum',
  ]),
  actvt: Object.freeze([
    'ActivityClub',
    'ActivityHouse',
    'ActivityTour',
    'ActivitySportsFacility',
    'ActivitySportsMeet',
    'ActivityFunction',
    'ActivityEvent',
    'ActivityCriteria',
    'ActivityPoints',
    'ActivityCertificate',
    'ActivityCouncil',
    'ActivityCouncilPost',
    'ActivityCouncilRegistration',
  ]),
  mdcl: Object.freeze([
    'MedicalCase',
    'MedicalSupply',
  ]),
  asets: Object.freeze([
    'AssetCategory',
    'AssetLocation',
    'AssetVendor',
    'Asset',
    'AssetAllocation',
    'AssetTransfer',
    'AssetMaintenance',
    'AssetAudit',
    'AssetAuditItem',
    'AssetProcurement',
    'AssetDisposal',
    'AssetLifecycleEvent',
    'AssetStockItem',
    'AssetStockTransaction',
    'AssetSettings',
  ]),
});

/**
 * Feature keys grouped by module (pre-computed from the catalog).
 * Used to detect whether a module is active based on feature toggles.
 */
const MODULE_FEATURE_KEYS = Object.freeze({
  cntr: Object.freeze(getModuleFeatureKeys('cntr')),
  exmcl: Object.freeze(getModuleFeatureKeys('exmcl')),
  attnd: Object.freeze(getModuleFeatureKeys('attnd')),
  timetable: Object.freeze(getModuleFeatureKeys('timetable')),
  stdnt: Object.freeze(getModuleFeatureKeys('stdnt')),
  trnst: Object.freeze(getModuleFeatureKeys('trnst')),
  acdmc: Object.freeze(getModuleFeatureKeys('acdmc')),
  actvt: Object.freeze(getModuleFeatureKeys('actvt')),
  mdcl: Object.freeze(getModuleFeatureKeys('mdcl')),
  asets: Object.freeze(getModuleFeatureKeys('asets')),
});

/**
 * Returns true if at least one feature in the given module is enabled.
 * @param {string} moduleKey - 'cntr' or 'timetable'
 * @param {Record<string, boolean>} featureToggles - normalized toggles
 * @returns {boolean}
 */
const isModuleActive = (moduleKey, featureToggles) => {
  const features = MODULE_FEATURE_KEYS[moduleKey];
  if (!features) return false;
  return features.some((key) => featureToggles[key] !== false);
};

/**
 * Given a tenant's normalized feature toggles, returns the deduplicated list
 * of Mongoose model keys that should be registered.
 *
 * Core models are always included. Module-specific models are included only
 * if at least one feature in that module is enabled.
 *
 * @param {Record<string, boolean>} featureToggles - normalized feature toggles
 * @returns {string[]} model keys to register
 */
const getActiveModelKeys = (featureToggles) => {
  // Core always loaded
  const keys = [...MODULE_MODEL_KEYS.core];

  if (isModuleActive('cntr', featureToggles)) {
    keys.push(...MODULE_MODEL_KEYS.cntr);
  }

  if (isModuleActive('exmcl', featureToggles)) {
    keys.push(...MODULE_MODEL_KEYS.exmcl);
  }

  if (isModuleActive('timetable', featureToggles)) {
    keys.push(...MODULE_MODEL_KEYS.timetable);
  }

  if (isModuleActive('attnd', featureToggles)) {
    keys.push(...MODULE_MODEL_KEYS.attnd);
  }

  if (isModuleActive('stdnt', featureToggles)) {
    keys.push(...MODULE_MODEL_KEYS.stdnt);
  }

  if (isModuleActive('trnst', featureToggles)) {
    keys.push(...MODULE_MODEL_KEYS.trnst);
  }

  if (isModuleActive('acdmc', featureToggles)) {
    keys.push(...MODULE_MODEL_KEYS.acdmc);
  }

  if (isModuleActive('actvt', featureToggles)) {
    keys.push(...MODULE_MODEL_KEYS.actvt);
  }

  if (isModuleActive('mdcl', featureToggles)) {
    keys.push(...MODULE_MODEL_KEYS.mdcl);
  }

  if (isModuleActive('asets', featureToggles)) {
    keys.push(...MODULE_MODEL_KEYS.asets);
  }

  return keys;
};

module.exports = {
  MODULE_MODEL_KEYS,
  isModuleActive,
  getActiveModelKeys,
};
