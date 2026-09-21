const mongoose = require('mongoose');
const createContextModelProxy = require('../tenancy/createContextModelProxy');

const schoolProfileSchema = new mongoose.Schema({
  schoolName: { type: String, default: '', trim: true },
  schoolCode: { type: String, default: '', trim: true },
  affiliationNo: { type: String, default: '', trim: true },
  affiliationTill: { type: Date, default: null },
  logoUrl: { type: String, default: '' },
  logoPublicId: { type: String, default: '' },
  tagline: { type: String, default: '', trim: true },
  address: { type: String, default: '', trim: true },
  contact: { type: String, default: '', trim: true },
  email: { type: String, default: '', trim: true },
  awardListDesign: { type: mongoose.Schema.Types.Mixed, default: null },
  admitCardDesign: { type: mongoose.Schema.Types.Mixed, default: null },
  reportCardDesign: { type: mongoose.Schema.Types.Mixed, default: null },
  metadata: {
    studentRollNumberAssignment: {
      mode: { type: String, default: 'alphabetical_by_class_section' },
      sortBy: { type: String, default: 'name_then_father_name' },
      scope: { type: String, default: 'each class and section' },
      description: {
        type: String,
        default:
          'Roll numbers are assigned automatically to students of each section of each class by sorting them in alphabetical order of name. If two students have the same name, they are ordered alphabetically by father name. If a student changes section, roll numbers in both the previous and new sections are reassigned.',
      },
    },
    parentNameHonorifics: {
      fatherPrefix: { type: String, default: 'Mr.' },
      motherPrefix: { type: String, default: 'Mrs.' },
      stripExisting: { type: Boolean, default: true },
      applyOnTemplateImport: { type: Boolean, default: true },
      backfillVersion: { type: Number, default: 0 },
      backfilledAt: { type: Date, default: null },
      backfilledCount: { type: Number, default: 0 },
      description: {
        type: String,
        default:
          'Parent names use Mr. (father) or Mrs. (mother): capital M, lowercase r/rs, period, then a space, then the name in Title Case. Existing titles are normalized even when glued to the name (mr.aj → Mr. Aj).',
      },
    },
    uiContrast: {
      enabled: { type: Boolean, default: true },
      darkBackgroundUsesLightText: { type: Boolean, default: true },
      lightBackgroundUsesDarkText: { type: Boolean, default: true },
      description: {
        type: String,
        default:
          'Always use light (white) font colour on dark backgrounds and dark font colour on light backgrounds so text stays readable.',
      },
    },
  },
}, { timestamps: true });

module.exports = createContextModelProxy('SchoolProfile', schoolProfileSchema);
