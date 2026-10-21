const { getPlatformConnection } = require('../config/platformDatabase');
const { getTenantModel } = require('../models/platform/Tenant');
const { getPlatformAdminModel } = require('../models/platform/PlatformAdmin');
const { getTenantOnboardingTicketModel } = require('../models/platform/TenantOnboardingTicket');
const { getTenantUserDirectoryModel } = require('../models/platform/TenantUserDirectory');
const { getMasterSubjectModel } = require('../models/platform/MasterSubject');
const { getMasterCBSEDatesheetModel } = require('../models/platform/MasterCBSEDatesheet');
const { getMasterGuidelineModel } = require('../models/platform/MasterGuideline');
const { getMasterUndertakingModel } = require('../models/platform/MasterUndertaking');
const { getDataRolloutModel } = require('../models/platform/DataRollout');
const { getMasterTeacherTemplateModel } = require('../models/platform/MasterTeacherTemplate');
const { getMasterRemunerationRateModel } = require('../models/platform/MasterRemunerationRate');
const { getMasterPackingDispatchModel } = require('../models/platform/MasterPackingDispatch');
const { getMasterSchoolDirectoryModel } = require('../models/platform/MasterSchoolDirectory');
const { getSchoolDirectoryTypeSettingsModel } = require('../models/platform/SchoolDirectoryTypeSettings');
const { getTenantFeatureDefaultsModel } = require('../models/platform/TenantFeatureDefaults');
const { getDemoRequestModel } = require('../models/platform/DemoRequest');

const getPlatformModels = () => {
  const connection = getPlatformConnection();

  return {
    Tenant: getTenantModel(connection),
    PlatformAdmin: getPlatformAdminModel(connection),
    TenantOnboardingTicket: getTenantOnboardingTicketModel(connection),
    TenantUserDirectory: getTenantUserDirectoryModel(connection),
    jsMasterSubject: getMasterSubjectModel(connection),
    MasterSubject: getMasterSubjectModel(connection),
    MasterCBSEDatesheet: getMasterCBSEDatesheetModel(connection),
    MasterGuideline: getMasterGuidelineModel(connection),
    MasterUndertaking: getMasterUndertakingModel(connection),
    DataRollout: getDataRolloutModel(connection),
    MasterTeacherTemplate: getMasterTeacherTemplateModel(connection),
    MasterRemunerationRate: getMasterRemunerationRateModel(connection),
    MasterPackingDispatch: getMasterPackingDispatchModel(connection),
    MasterSchoolDirectory: getMasterSchoolDirectoryModel(connection),
    SchoolDirectoryTypeSettings: getSchoolDirectoryTypeSettingsModel(connection),
    TenantFeatureDefaults: getTenantFeatureDefaultsModel(connection),
    DemoRequest: getDemoRequestModel(connection),
  };
};

module.exports = {
  getPlatformModels
};
