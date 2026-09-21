const mongoose = require('mongoose');
const createContextModelProxy = require('../tenancy/createContextModelProxy');
const academicSessionPlugin = require('./plugins/academicSessionPlugin');

const supportTicketSchema = new mongoose.Schema(
  {
    productModule: {
      type: String,
      required: [true, 'Product module is required'],
      trim: true,
      maxlength: [40, 'Product module cannot exceed 40 characters'],
    },
    productModuleLabel: {
      type: String,
      trim: true,
      maxlength: [120, 'Product module label cannot exceed 120 characters'],
      default: '',
    },
    pageOrArea: {
      type: String,
      required: [true, 'Page or area is required'],
      trim: true,
      maxlength: [120, 'Page or area cannot exceed 120 characters'],
    },
    pagePath: {
      type: String,
      trim: true,
      maxlength: [200, 'Page path cannot exceed 200 characters'],
      default: '',
    },
    schoolCode: {
      type: String,
      trim: true,
      maxlength: [20, 'School code cannot exceed 20 characters'],
      default: '',
    },
    affiliationNo: {
      type: String,
      trim: true,
      maxlength: [30, 'Affiliation number cannot exceed 30 characters'],
      default: '',
    },
    issueDate: {
      type: Date,
      default: null,
    },
    centreCode: {
      type: String,
      trim: true,
      maxlength: [20, 'Centre code cannot exceed 20 characters'],
      default: '',
    },
    examDate: {
      type: Date,
      default: null,
    },
    module: {
      type: String,
      trim: true,
      maxlength: [160, 'Module label cannot exceed 160 characters'],
      default: '',
    },
    description: {
      type: String,
      required: [true, 'Issue description is required'],
      trim: true,
      maxlength: [4000, 'Description cannot exceed 4000 characters'],
    },
    screenshot: {
      type: String,
      trim: true,
      maxlength: [500, 'Screenshot URL cannot exceed 500 characters'],
    },
    status: {
      type: String,
      enum: ['Open', 'In Progress', 'Resolved', 'Closed'],
      default: 'Open',
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: true },
  }
);

supportTicketSchema.index({ createdAt: -1 });
supportTicketSchema.index({ productModule: 1, status: 1 });
supportTicketSchema.index({ centreCode: 1, status: 1 });

supportTicketSchema.plugin(academicSessionPlugin);

module.exports = createContextModelProxy('SupportTicket', supportTicketSchema);

