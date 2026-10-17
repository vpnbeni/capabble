const mongoose = require('mongoose');
const createContextModelProxy = require('../tenancy/createContextModelProxy');

/**
 * Tenant-defined role: a named bundle of permissions. Built-in roles live in
 * the permission catalog and are not stored; users reference custom roles as
 * `custom:<_id>` in User.roles.
 */
const roleGrantSchema = new mongoose.Schema({
  key: { type: String, required: true, trim: true },
  scope: { type: String, enum: ['all', 'assigned'], default: 'all' }
}, { _id: false });

const roleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Role name is required'],
    trim: true,
    maxlength: [60, 'Role name cannot exceed 60 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: 240,
    default: ''
  },
  permissions: {
    type: [roleGrantSchema],
    default: []
  },
  basedOn: {
    type: String,
    trim: true,
    default: ''
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

roleSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

module.exports = createContextModelProxy('Role', roleSchema);
