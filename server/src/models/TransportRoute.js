const mongoose = require('mongoose');
const createContextModelProxy = require('../tenancy/createContextModelProxy');

const stopSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  landmark: { type: String, trim: true, default: '' },
  pickupTime: { type: String, trim: true, default: '' },
  dropTime: { type: String, trim: true, default: '' },
  sequence: { type: Number, default: 1 },
  // Map position; optional so routes without coordinates keep working.
  lat: { type: Number, min: -90, max: 90, default: null },
  lng: { type: Number, min: -180, max: 180, default: null },
});

const transportRouteSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Route name is required'],
    trim: true,
    maxlength: 80,
  },
  code: {
    type: String,
    required: [true, 'Route code is required'],
    trim: true,
    uppercase: true,
    maxlength: 20,
  },
  vehicleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TransportVehicle',
    default: null,
  },
  shift: {
    type: String,
    enum: ['morning', 'afternoon', 'both'],
    default: 'both',
  },
  startPoint: { type: String, trim: true, default: '' },
  endPoint: { type: String, trim: true, default: '' },
  distanceKm: { type: Number, min: 0, default: 0 },
  stops: { type: [stopSchema], default: [] },
  // The road between the stops, from the routing server; refetched when a stop moves.
  roadPath: {
    type: new mongoose.Schema({
      key: { type: String, default: '' },
      polyline: { type: String, default: '' },
      distanceM: { type: Number, default: 0 },
      durationS: { type: Number, default: 0 },
      at: { type: Date, default: null },
    }, { _id: false }),
    default: null,
  },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

transportRouteSchema.index({ code: 1 }, { unique: true });
transportRouteSchema.index({ vehicleId: 1, isActive: 1 });

module.exports = createContextModelProxy('TransportRoute', transportRouteSchema);
