const mongoose = require('mongoose');
const createContextModelProxy = require('../tenancy/createContextModelProxy');

const { ObjectId } = mongoose.Schema.Types;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const TRIP_DIRECTIONS = ['pickup', 'drop'];
const ASSIGNMENT_SHIFTS = ['pickup', 'drop', 'both'];
const BOARDING_EVENTS = ['boarded', 'dropped', 'absent'];
const BOARDING_METHODS = ['scan', 'manual'];

// Which route and stop a student uses. One active assignment per student.
const assignmentSchema = new mongoose.Schema({
  studentId: { type: ObjectId, ref: 'Student', required: true },
  rollNumber: { type: String, trim: true, default: '' },
  name: { type: String, trim: true, default: '' },
  className: { type: String, trim: true, default: '' },
  section: { type: String, trim: true, default: '' },
  routeId: { type: ObjectId, ref: 'TransportRoute', required: true },
  stopId: { type: ObjectId, default: null },
  stopName: { type: String, trim: true, default: '' },
  shift: { type: String, enum: ASSIGNMENT_SHIFTS, default: 'both' },
  isActive: { type: Boolean, default: true },
  updatedBy: { type: String, trim: true, default: '' }
}, { timestamps: true });
assignmentSchema.index({ studentId: 1 }, { unique: true });
assignmentSchema.index({ routeId: 1, isActive: 1 });

const locationSchema = new mongoose.Schema({
  lat: { type: Number, min: -90, max: 90, required: true },
  lng: { type: Number, min: -180, max: 180, required: true },
  accuracy: { type: Number, min: 0, default: null },
  speed: { type: Number, default: null },
  heading: { type: Number, default: null },
  at: { type: Date, required: true }
}, { _id: false });

// One run of a bus on a route. Only one active trip per vehicle.
const tripSchema = new mongoose.Schema({
  vehicleId: { type: ObjectId, ref: 'TransportVehicle', required: true },
  routeId: { type: ObjectId, ref: 'TransportRoute', required: true },
  direction: { type: String, enum: TRIP_DIRECTIONS, required: true },
  serviceDate: { type: String, match: DATE, required: true },
  status: { type: String, enum: ['active', 'ended'], default: 'active' },
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date, default: null },
  endReason: { type: String, enum: ['crew', 'stale', 'admin', ''], default: '' },
  startedBy: { type: ObjectId, ref: 'User', default: null },
  startedByName: { type: String, trim: true, default: '' },
  lastLocation: { type: locationSchema, default: null },
  pingCount: { type: Number, default: 0 }
}, { timestamps: true });
tripSchema.index({ vehicleId: 1 }, { unique: true, partialFilterExpression: { status: 'active' } });
tripSchema.index({ routeId: 1, status: 1 });
tripSchema.index({ serviceDate: -1, startedAt: -1 });

// GPS trail of a trip, kept 30 days for replay.
const pingSchema = new mongoose.Schema({
  tripId: { type: ObjectId, ref: 'TransportTrip', required: true },
  lat: { type: Number, min: -90, max: 90, required: true },
  lng: { type: Number, min: -180, max: 180, required: true },
  accuracy: { type: Number, min: 0, default: null },
  speed: { type: Number, default: null },
  heading: { type: Number, default: null },
  at: { type: Date, required: true }
});
pingSchema.index({ tripId: 1, at: 1 });
pingSchema.index({ at: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

// A student getting on, off, or not turning up for a trip.
const boardingSchema = new mongoose.Schema({
  tripId: { type: ObjectId, ref: 'TransportTrip', required: true },
  studentId: { type: ObjectId, ref: 'Student', required: true },
  event: { type: String, enum: BOARDING_EVENTS, required: true },
  method: { type: String, enum: BOARDING_METHODS, default: 'manual' },
  at: { type: Date, default: Date.now },
  markedBy: { type: ObjectId, ref: 'User', default: null },
  markedByName: { type: String, trim: true, default: '' },
  lat: { type: Number, default: null },
  lng: { type: Number, default: null }
}, { timestamps: true });
boardingSchema.index({ tripId: 1, studentId: 1, event: 1 }, { unique: true });
boardingSchema.index({ studentId: 1, at: -1 });

module.exports = {
  TRIP_DIRECTIONS,
  ASSIGNMENT_SHIFTS,
  BOARDING_EVENTS,
  BOARDING_METHODS,
  TransportAssignment: createContextModelProxy('TransportAssignment', assignmentSchema),
  TransportTrip: createContextModelProxy('TransportTrip', tripSchema),
  TransportLocationPing: createContextModelProxy('TransportLocationPing', pingSchema),
  TransportBoarding: createContextModelProxy('TransportBoarding', boardingSchema)
};
