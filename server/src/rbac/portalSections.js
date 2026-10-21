/**
 * Which parts of the family portal a parent or student login can open: the
 * sections their kind of account may see (catalog `portal`), limited to the
 * modules this school has switched on.
 */
const { normalizeTenantFeatureToggles } = require('../constants/tenantFeatures');
const { catalog } = require('./catalog');

const featureOn = (req, ...keys) => {
  const toggles = normalizeTenantFeatureToggles(req.tenant?.featureToggles);
  return keys.some((key) => toggles[key] !== false);
};

/** Sections of the portal each kind of account may open. */
const portalSections = (kind) => catalog.portal[kind] || [];

/** Sections a parent or student login of this school can open now (kind + active modules). */
const openSections = (req, kind) => portalSections(kind).filter((section) => ({
  attendance: featureOn(req, 'attnd_student_attendance'),
  timetable: featureOn(req, 'timetable_classes', 'timetable_class_wise'),
  results: featureOn(req, 'exmcl_exams', 'exmcl_result'),
  fees: featureOn(req, 'cpitl_fees'),
  notices: featureOn(req, 'exmcl_centre_guidelines'),
  transport: featureOn(req, 'trnst_transport'),
  appointments: featureOn(req, 'appnt_desk') && Boolean(req.models?.Appointment),
  profile: true
}[section]));

module.exports = { featureOn, portalSections, openSections };
