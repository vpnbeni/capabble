const mongoose = require('mongoose');
const createContextModelProxy = require('../tenancy/createContextModelProxy');
const academicSessionPlugin = require('./plugins/academicSessionPlugin');

const roomSchema = new mongoose.Schema({
  roomNo: {
    type: String,
    required: true,
    trim: true
  },
  roomName: {
    type: String,
    trim: true
  },
  floor: {
    type: String,
    default: 'First Floor',
    trim: true
  },
  capacity: {
    type: Number,
    default: 24
  },
  seatingLayout: {
    rows: [{
      benchCount: {
        type: Number,
        min: 0,
        max: 50,
        default: 12,
      },
      benchType: {
        type: String,
        enum: ['single', 'double', 'triple'],
        default: 'double',
      },
    }],
  },
  allocatedExamDates: {
    type: [String],
    default: []
  },
  allocationOrderByDate: {
    type: Map,
    of: Number,
    default: {}
  },
  isActive: {
    type: Boolean,
    default: true
  },
  assetLocationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AssetLocation',
    default: null,
  },
}, {
  timestamps: true
});

roomSchema.index({ assetLocationId: 1 }, { sparse: true });
roomSchema.plugin(academicSessionPlugin);

module.exports = createContextModelProxy('Room', roomSchema);
