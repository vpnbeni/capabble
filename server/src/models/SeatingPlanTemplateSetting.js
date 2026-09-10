const mongoose = require('mongoose');
const createContextModelProxy = require('../tenancy/createContextModelProxy');
const academicSessionPlugin = require('./plugins/academicSessionPlugin');

const cbseCopySchema = new mongoose.Schema({
  infoCol1Width: { type: Number, default: 20 },
  infoCol2Width: { type: Number, default: 26 },
  infoCol3Width: { type: Number, default: 26 },
  infoCol4Width: { type: Number, default: 14 },
  infoCol5Width: { type: Number, default: 14 },
  col1Width: { type: Number, default: 23 },
  col2Width: { type: Number, default: 10 },
  col3Width: { type: Number, default: 23 },
  col4Width: { type: Number, default: 10 },
  col5Width: { type: Number, default: 23 },
  col6Width: { type: Number, default: 11 },
  rowHeight: { type: Number, default: 28 },
  cellPaddingY: { type: Number, default: 6 },
  cellPaddingX: { type: Number, default: 8 },
  headerFontSize: { type: Number, default: 12 },
  subHeaderFontSize: { type: Number, default: 11 },
  bodyFontSize: { type: Number, default: 11 },
}, { _id: false });

const mainGateSchema = new mongoose.Schema({
  col1Width: { type: Number, default: 16 },
  col2Width: { type: Number, default: 28 },
  col3Width: { type: Number, default: 28 },
  col4Width: { type: Number, default: 28 },
  rowHeight: { type: Number, default: 22 },
}, { _id: false });

const roomFolderSlipSchema = new mongoose.Schema({
  infoCol1Width: { type: Number, default: 14.3 },
  infoCol2Width: { type: Number, default: 19.05 },
  infoCol3Width: { type: Number, default: 19.05 },
  infoCol4Width: { type: Number, default: 14.3 },
  infoCol5Width: { type: Number, default: 9.5 },
  infoCol6Width: { type: Number, default: 9.5 },
  infoCol7Width: { type: Number, default: 14.3 },
  col1Width: { type: Number, default: 14.14 },
  col2Width: { type: Number, default: 8.08 },
  col3Width: { type: Number, default: 11.11 },
  col4Width: { type: Number, default: 14.14 },
  col5Width: { type: Number, default: 8.08 },
  col6Width: { type: Number, default: 11.11 },
  col7Width: { type: Number, default: 14.14 },
  col8Width: { type: Number, default: 8.08 },
  col9Width: { type: Number, default: 11.12 },
  rowHeight: { type: Number, default: 24 },
}, { _id: false });

const roomDoorSlipSchema = new mongoose.Schema({
  infoCol1Width: { type: Number, default: 16.67 },
  infoCol2Width: { type: Number, default: 20.83 },
  infoCol3Width: { type: Number, default: 20.83 },
  infoCol4Width: { type: Number, default: 16.67 },
  infoCol5Width: { type: Number, default: 12.5 },
  infoCol6Width: { type: Number, default: 12.5 },
  col1Width: { type: Number, default: 33.33 },
  col2Width: { type: Number, default: 33.33 },
  col3Width: { type: Number, default: 33.34 },
  rowHeight: { type: Number, default: 30 },
}, { _id: false });

const functionaryDutyListSchema = new mongoose.Schema({
  pageSize: {
    type: String,
    enum: ['A4'],
    default: 'A4',
  },
  orientation: {
    type: String,
    enum: ['landscape', 'portrait'],
    default: 'landscape',
  },
  columnWidths: {
    srNo: { type: Number, default: 50 },
    roomNo: { type: Number, default: 70 },
    roomName: { type: Number, default: 120 },
    floor: { type: Number, default: 70 },
    inv1School: { type: Number, default: 90 },
    inv1Teacher: { type: Number, default: 130 },
    inv1TeacherId: { type: Number, default: 100 },
    inv1Signature: { type: Number, default: 130 },
    inv2School: { type: Number, default: 90 },
    inv2Teacher: { type: Number, default: 130 },
    inv2TeacherId: { type: Number, default: 100 },
    inv2Signature: { type: Number, default: 130 },
  },
}, { _id: false });

const seatingPlanTemplateSettingSchema = new mongoose.Schema({
  roomAllocationMode: {
    type: String,
    enum: ['auto', 'manual'],
    default: 'auto',
  },
  seatingPlanMode: {
    type: String,
    enum: ['same_across_days', 'different_per_day'],
    default: 'different_per_day',
  },
  mainGate: {
    type: mainGateSchema,
    default: () => ({}),
  },
  cbseCopy: {
    type: cbseCopySchema,
    default: () => ({}),
  },
  roomFolderSlip: {
    type: roomFolderSlipSchema,
    default: () => ({}),
  },
  roomDoorSlip: {
    type: roomDoorSlipSchema,
    default: () => ({}),
  },
  functionaryDutyList: {
    type: functionaryDutyListSchema,
    default: () => ({}),
  },
}, {
  timestamps: true,
});

seatingPlanTemplateSettingSchema.index({ updatedAt: -1 });

seatingPlanTemplateSettingSchema.plugin(academicSessionPlugin);

module.exports = createContextModelProxy('SeatingPlanTemplateSetting', seatingPlanTemplateSettingSchema);
