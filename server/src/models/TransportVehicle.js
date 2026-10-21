const mongoose = require('mongoose');
const createContextModelProxy = require('../tenancy/createContextModelProxy');

const transportVehicleSchema = new mongoose.Schema({
  busNo: {
    type: String,
    required: [true, 'Bus number is required'],
    trim: true,
    maxlength: 20,
  },
  registrationNumber: {
    type: String,
    required: [true, 'Registration number is required'],
    trim: true,
    uppercase: true,
    maxlength: 20,
  },
  vehicleType: {
    type: String,
    enum: ['Bus', 'Mini Bus', 'Van', 'Winger', 'Other'],
    default: 'Bus',
  },
  make: { type: String, trim: true, default: '' },
  model: { type: String, trim: true, default: '' },
  color: { type: String, trim: true, default: '' },
  capacity: { type: Number, min: 1, default: 40 },
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Teacher',
    default: null,
  },
  driverName: { type: String, trim: true, default: '' },
  driverPhone: { type: String, trim: true, default: '' },
  conductorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Teacher',
    default: null,
  },
  conductorName: { type: String, trim: true, default: '' },
  conductorPhone: { type: String, trim: true, default: '' },
  insuranceExpiry: { type: Date, default: null },
  fitnessExpiry: { type: Date, default: null },
  status: {
    type: String,
    enum: ['active', 'maintenance', 'inactive'],
    default: 'active',
  },
  notes: { type: String, trim: true, default: '', maxlength: 400 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

transportVehicleSchema.index({ busNo: 1 }, { unique: true });
transportVehicleSchema.index({ registrationNumber: 1 }, { unique: true });
transportVehicleSchema.index({ status: 1, isActive: 1 });
transportVehicleSchema.index({ driverId: 1 });
transportVehicleSchema.index({ conductorId: 1 });

module.exports = createContextModelProxy('TransportVehicle', transportVehicleSchema);
