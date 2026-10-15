const mongoose = require('mongoose');
const createContextModelProxy = require('../tenancy/createContextModelProxy');
const academicSessionPlugin = require('./plugins/academicSessionPlugin');

const examDefinitionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40,
    },
    duration: {
      type: String,
      trim: true,
      maxlength: 40,
      default: '',
    },
    maximumMarks: {
      type: Number,
      min: 0,
      default: 0,
    },
    displayOrder: {
      type: Number,
      default: 0,
      min: 0,
    },
    subjectKeys: {
      type: [String],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Parents and students only see marks for exams whose results are published.
    resultsPublished: {
      type: Boolean,
      default: false,
    },
    resultsPublishedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

examDefinitionSchema.index({ academicSession: 1, isActive: 1, displayOrder: 1, name: 1 });
examDefinitionSchema.index({ academicSession: 1, code: 1, isActive: 1 });

examDefinitionSchema.plugin(academicSessionPlugin);

module.exports = createContextModelProxy('ExamDefinition', examDefinitionSchema);
