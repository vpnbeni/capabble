/**
 * Cntr module route registrar — Exam Centre Management.
 *
 * Mounts all routes that belong to the cntr module: candidates, datesheets,
 * answer sheets, seating plans, duties, dispatch, Form 66, guidelines,
 * undertakings, CBSE circulars, centre details, attendance, remuneration.
 *
 * These routes are available only when the tenant has at least one cntr
 * feature enabled. Per-route feature guards enforce granular access.
 */
const { requireTenantFeature, requireAnyTenantFeature } = require('../../middleware/tenantFeatureAccess');

const studentRoutes = require('../../routes/studentRoutes');
const candidateRoutes = require('../../routes/candidateRoutes');
const datesheetRoutes = require('../../routes/datesheetRoutes');
const centreDatesheetRoutes = require('../../routes/centreDatesheet');
const answerSheetRoutes = require('../../routes/answerSheets');
const dispatchRoutes = require('../../routes/dispatchRoutes');
const form66Routes = require('../../routes/form66');
const seatingPlanRoutes = require('../../routes/seatingPlan');
const dutiesRoutes = require('../../routes/dutiesRoutes');
const guidelinesRoutes = require('../../routes/guidelines');
const undertakingsRoutes = require('../../routes/undertakings');
const cbseCircularsRoutes = require('../../routes/cbseCirculars');
const centreDetailsRoutes = require('../../routes/centreDetailsRoutes');
const attendanceRoutes = require('../../routes/attendanceRoutes');
const remunerationRoutes = require('../../routes/remunerationRoutes');
const examCircularRoutes = require('../../routes/examCircularRoutes');
const examDefinitionRoutes = require('../../routes/examDefinitionRoutes');
const examResultRoutes = require('../../routes/examResultRoutes');
const reportCardRoutes = require('../../routes/reportCardRoutes');
const awardListRoutes = require('../../routes/awardListRoutes');
const admitCardRoutes = require('../../routes/admitCardRoutes');
const schoolProfileRoutes = require('../../routes/schoolProfileRoutes');
const cbseRegistrationRoutes = require('../../routes/cbseRegistrationRoutes');

const mountRoutes = (router) => {
  router.use('/students', requireTenantFeature('candidates'), studentRoutes);
  router.use('/candidates', requireTenantFeature('candidates'), candidateRoutes);
  router.use('/datesheets', requireAnyTenantFeature('datesheets', 'exmcl_datesheets'), datesheetRoutes);
  router.use('/centre-datesheet', requireTenantFeature('datesheets'), centreDatesheetRoutes);
  router.use('/answersheets', requireTenantFeature('answersheets'), answerSheetRoutes);
  router.use('/dispatch', requireTenantFeature('answersheets'), dispatchRoutes);
  router.use('/form66', requireTenantFeature('form66'), form66Routes);
  router.use('/seating-plan', requireTenantFeature('seatingplan'), seatingPlanRoutes);
  router.use('/duties', requireTenantFeature('duties'), dutiesRoutes);
  router.use('/guidelines', requireTenantFeature('centre_guidelines'), guidelinesRoutes);
  router.use('/undertakings', requireTenantFeature('undertaking'), undertakingsRoutes);
  router.use('/cbse-circulars', requireTenantFeature('cbse_circulars'), cbseCircularsRoutes);
  router.use('/centre-details', requireTenantFeature('centre_details'), centreDetailsRoutes);
  router.use('/attendance', requireTenantFeature('attendance'), attendanceRoutes);
  router.use('/remuneration', requireTenantFeature('remuneration'), remunerationRoutes);
  router.use('/exam-circulars', requireTenantFeature('exmcl_centre_guidelines'), examCircularRoutes);
  router.use('/exam-definitions', requireAnyTenantFeature('exmcl_exams', 'exmcl_datesheets'), examDefinitionRoutes);
  router.use('/exam-results', requireTenantFeature('exmcl_exams'), examResultRoutes);
  router.use('/report-card', requireTenantFeature('exmcl_exams'), reportCardRoutes);
  router.use('/award-list', requireTenantFeature('exmcl_award_list'), awardListRoutes);
  router.use('/admit-cards', requireTenantFeature('exmcl_admit_cards'), admitCardRoutes);
  router.use('/cbse-registration', requireTenantFeature('exmcl_cbse_registration'), cbseRegistrationRoutes);
  router.use('/school-profile', schoolProfileRoutes);
};

module.exports = { mountRoutes };
