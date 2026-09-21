const mongoose = require('mongoose');
const { STUDENT_CLASSES, DATESHEET_STATUS, TIME_SLOTS } = require('../utils/constants');
const createContextModelProxy = require('../tenancy/createContextModelProxy');
const academicSessionPlugin = require('./plugins/academicSessionPlugin');

const dateSheetSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Date sheet title is required'],
    trim: true,
    maxlength: [200, 'Title cannot be more than 200 characters']
  },
  examType: {
    type: String,
    required: [true, 'Examination type is required'],
    enum: ['board', 'internal', 'practical', 'supplementary', 'annual', 'half_yearly'],
    default: 'board'
  },
  class: {
    type: String,
    required: [true, 'Class is required'],
    enum: Object.values(STUDENT_CLASSES)
  },
  examId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExamDefinition',
    default: null,
  },
  section: {
    type: String,
    trim: true,
    default: '',
    maxlength: [50, 'Section cannot be more than 50 characters'],
  },
  academicYear: {
    type: String,
    required: [true, 'Academic year is required'],
    match: [/^\d{4}-\d{4}$/, 'Academic year must be in format YYYY-YYYY (e.g., 2023-2024)']
  },
  startDate: {
    type: Date,
    required: [true, 'Examination start date is required']
  },
  endDate: {
    type: Date,
    required: [true, 'Examination end date is required'],
    validate: {
      validator: function(value) {
        return value >= this.startDate;
      },
      message: 'End date must be after or equal to start date'
    }
  },
  subjects: [{
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true
    },
    examDate: {
      type: Date,
      required: true
    },
    dayName: {
      type: String,
      required: false // Will be auto-calculated from examDate
    },
    timeSlot: {
      start: {
        type: String,
        required: true,
        match: [/^([01]\d|2[0-3]):([0-5]\d)$/, 'Start time must be in HH:MM format']
      },
      end: {
        type: String,
        required: true,
        match: [/^([01]\d|2[0-3]):([0-5]\d)$/, 'End time must be in HH:MM format']
      }
    },
    duration: {
      type: Number,
      required: true,
      min: [30, 'Duration must be at least 30 minutes']
    },
    instructions: {
      type: String,
      trim: true,
      maxlength: [1000, 'Instructions cannot be more than 1000 characters']
    },
    isOptional: {
      type: Boolean,
      default: false
    }
  }],
  status: {
    type: String,
    enum: Object.values(DATESHEET_STATUS),
    default: DATESHEET_STATUS.DRAFT
  },
  publishedDate: {
    type: Date
  },
  publishedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  generalInstructions: [{
    type: String,
    trim: true,
    maxlength: [500, 'Instruction cannot be more than 500 characters']
  }],
  centerCode: {
    type: String,
    trim: true,
    uppercase: true,
    maxlength: [10, 'Center code cannot be more than 10 characters']
  },
  boardName: {
    type: String,
    trim: true,
    maxlength: [100, 'Board name cannot be more than 100 characters'],
    default: 'Central Board of Secondary Education (CBSE)'
  },
  schoolName: {
    type: String,
    trim: true,
    maxlength: [200, 'School name cannot be more than 200 characters']
  },
  schoolCode: {
    type: String,
    trim: true,
    uppercase: true,
    maxlength: [10, 'School code cannot be more than 10 characters']
  },
  notifications: [{
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: [500, 'Notification message cannot be more than 500 characters']
    },
    type: {
      type: String,
      enum: ['info', 'warning', 'important', 'update'],
      default: 'info'
    },
    isActive: {
      type: Boolean,
      default: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  attachments: [{
    filename: {
      type: String,
      required: true
    },
    originalName: {
      type: String,
      required: true
    },
    path: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['pdf', 'image', 'document'],
      required: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
dateSheetSchema.index({ class: 1, academicYear: 1 });
dateSheetSchema.index({ status: 1 });
dateSheetSchema.index({ examType: 1 });
dateSheetSchema.index({ startDate: 1, endDate: 1 });
dateSheetSchema.index({ publishedDate: -1 });
dateSheetSchema.index({ isActive: 1 });
dateSheetSchema.index({ createdBy: 1 });
dateSheetSchema.index({ 'subjects.examDate': 1 });

// Compound indexes
dateSheetSchema.index({ class: 1, examType: 1, academicYear: 1 });
dateSheetSchema.index({ examId: 1, class: 1, section: 1, academicYear: 1 });
dateSheetSchema.index({ status: 1, isActive: 1 });

dateSheetSchema.plugin(academicSessionPlugin);

// Virtual for total examination days
dateSheetSchema.virtual('totalDays').get(function() {
  if (!this.startDate || !this.endDate) return 0;
  
  const diffTime = Math.abs(this.endDate - this.startDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays + 1; // Include both start and end dates
});

// Virtual for total subjects
dateSheetSchema.virtual('totalSubjects').get(function() {
  return this.subjects ? this.subjects.length : 0;
});

// Virtual for display title
dateSheetSchema.virtual('displayTitle').get(function() {
  return `${this.title} - ${this.class} (${this.academicYear})`;
});

// Virtual for examination period
dateSheetSchema.virtual('examPeriod').get(function() {
  if (!this.startDate || !this.endDate) return '';
  
  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  const start = this.startDate.toLocaleDateString('en-IN', options);
  const end = this.endDate.toLocaleDateString('en-IN', options);
  
  return `${start} to ${end}`;
});

// Pre-save middleware to validate subjects and add day names
dateSheetSchema.pre('save', function(next) {
  // Validate that all subject exam dates are within the date sheet period
  for (const subjectEntry of this.subjects) {
    if (subjectEntry.examDate < this.startDate || subjectEntry.examDate > this.endDate) {
      return next(new Error(`Subject exam date must be between ${this.startDate} and ${this.endDate}`));
    }
    
    // Automatically add day name if not present
    if (subjectEntry.examDate && !subjectEntry.dayName) {
      const date = new Date(subjectEntry.examDate)
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      subjectEntry.dayName = days[date.getDay()]
    }
  }
  
  // Set published date when status changes to published
  if (this.isModified('status') && this.status === DATESHEET_STATUS.PUBLISHED && !this.publishedDate) {
    this.publishedDate = new Date();
  }
  
  next();
});

// Pre-save middleware to sort subjects by exam date
dateSheetSchema.pre('save', function(next) {
  if (this.subjects && this.subjects.length > 0) {
    this.subjects.sort((a, b) => new Date(a.examDate) - new Date(b.examDate));
  }
  next();
});

// Static method to find by class and academic year
dateSheetSchema.statics.findByClassAndYear = function(className, academicYear) {
  return this.find({ 
    class: className, 
    academicYear,
    isActive: true 
  }).populate('subjects.subject createdBy publishedBy');
};

// Static method to find published date sheets
dateSheetSchema.statics.findPublished = function(className = null) {
  const query = { 
    status: DATESHEET_STATUS.PUBLISHED,
    isActive: true 
  };
  
  if (className) {
    query.class = className;
  }
  
  return this.find(query).populate('subjects.subject createdBy publishedBy');
};

// Static method to find current examinations
dateSheetSchema.statics.findCurrent = function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return this.find({
    status: DATESHEET_STATUS.PUBLISHED,
    startDate: { $lte: today },
    endDate: { $gte: today },
    isActive: true
  }).populate('subjects.subject');
};

// Static method to get date sheet statistics
dateSheetSchema.statics.getStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: { class: '$class', status: '$status' },
        count: { $sum: 1 }
      }
    }
  ]);

  const classStats = await this.aggregate([
    {
      $group: {
        _id: '$class',
        total: { $sum: 1 },
        published: {
          $sum: {
            $cond: [{ $eq: ['$status', DATESHEET_STATUS.PUBLISHED] }, 1, 0]
          }
        },
        draft: {
          $sum: {
            $cond: [{ $eq: ['$status', DATESHEET_STATUS.DRAFT] }, 1, 0]
          }
        }
      }
    }
  ]);

  const total = await this.countDocuments({ isActive: true });
  const published = await this.countDocuments({ 
    status: DATESHEET_STATUS.PUBLISHED, 
    isActive: true 
  });

  return {
    total,
    published,
    byClass: classStats,
    byClassAndStatus: stats,
    lastUpdated: new Date()
  };
};

// Instance method to publish date sheet
dateSheetSchema.methods.publish = function(publishedBy) {
  this.status = DATESHEET_STATUS.PUBLISHED;
  this.publishedDate = new Date();
  this.publishedBy = publishedBy;
  return this.save();
};

// Instance method to add subject
dateSheetSchema.methods.addSubject = function(subjectData) {
  this.subjects.push(subjectData);
  return this.save();
};

// Instance method to remove subject
dateSheetSchema.methods.removeSubject = function(subjectId) {
  this.subjects = this.subjects.filter(
    subjectEntry => subjectEntry.subject.toString() !== subjectId.toString()
  );
  return this.save();
};

// Instance method to update subject
dateSheetSchema.methods.updateSubject = function(subjectId, updateData) {
  const subjectIndex = this.subjects.findIndex(
    subjectEntry => subjectEntry.subject.toString() === subjectId.toString()
  );
  
  if (subjectIndex !== -1) {
    Object.assign(this.subjects[subjectIndex], updateData);
    return this.save();
  }
  
  throw new Error('Subject not found in date sheet');
};

// Instance method to add notification
dateSheetSchema.methods.addNotification = function(notificationData) {
  this.notifications.push(notificationData);
  return this.save();
};

// Instance method to get subjects by date
dateSheetSchema.methods.getSubjectsByDate = function(date) {
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);
  
  return this.subjects.filter(subjectEntry => {
    const examDate = new Date(subjectEntry.examDate);
    examDate.setHours(0, 0, 0, 0);
    return examDate.getTime() === targetDate.getTime();
  });
};

module.exports = createContextModelProxy('DateSheet', dateSheetSchema);
