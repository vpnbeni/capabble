const mongoose = require('mongoose');
const createContextModelProxy = require('../tenancy/createContextModelProxy');
const academicSessionPlugin = require('./plugins/academicSessionPlugin');

/**
 * Academics (ACDMC) records.
 *
 * Class, section, subject and teacher are stored as names (plus the teacher's
 * id when one was picked) so each record is a snapshot that survives changes
 * in the Students, Staff or Timetable modules. Legacy placeholder fields
 * (`subject`, `bookTitle`, …) are kept optional and normalised on read by
 * `modules/acdmc/academics.js`.
 */

const withCommon = (definition) => {
  const schema = new mongoose.Schema({
    ...definition,
    createdBy: { type: String, trim: true, default: '' },
    updatedBy: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true }
  }, { timestamps: true });
  schema.plugin(academicSessionPlugin);
  return schema;
};

const topicSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  periods: { type: Number, min: 0, max: 200, default: 1 },
  targetMonth: { type: String, trim: true, default: '' } // YYYY-MM
});

const unitSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  order: { type: Number, default: 0 },
  topics: { type: [topicSchema], default: [] }
});

const bookSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  author: { type: String, trim: true, default: '' },
  publisher: { type: String, trim: true, default: '' },
  sessionType: { type: String, enum: ['current', 'next'], default: 'current' },
  status: { type: String, enum: ['proposed', 'selected'], default: 'proposed' }
});

const submissionSchema = new mongoose.Schema({
  studentId: { type: String, required: true, trim: true },
  studentName: { type: String, trim: true, default: '' },
  rollNo: { type: String, trim: true, default: '' },
  status: {
    type: String,
    enum: ['pending', 'submitted', 'late', 'missing', 'excused'],
    default: 'pending'
  },
  marks: { type: Number, min: 0, default: null },
  remark: { type: String, trim: true, default: '' },
  updatedAt: { type: Date, default: Date.now }
}, { _id: false });

const questionSchema = new mongoose.Schema({
  type: { type: String, enum: ['mcq', 'short', 'long'], default: 'mcq' },
  text: { type: String, required: true, trim: true, maxlength: 2000 },
  options: { type: [String], default: [] },
  answer: { type: String, trim: true, default: '' },
  marks: { type: Number, min: 0, max: 100, default: 1 }
});

const classWorkFields = {
  title: { type: String, required: true, trim: true, maxlength: 200 },
  teacherId: { type: String, trim: true, default: '' },
  teacherName: { type: String, trim: true, default: '' },
  className: { type: String, trim: true, default: '' },
  section: { type: String, trim: true, default: '' },
  subjectName: { type: String, trim: true, default: '' },
  curriculumId: { type: String, trim: true, default: '' },
  topicIds: { type: [String], default: [] },
  assignedDate: { type: String, trim: true, default: '' }, // YYYY-MM-DD
  dueDate: { type: String, trim: true, default: '' },
  instructions: { type: String, trim: true, default: '' },
  status: { type: String, enum: ['draft', 'published', 'closed'], default: 'draft' },
  submissions: { type: [submissionSchema], default: [] },
  // Legacy placeholder fields
  subject: { type: String, trim: true },
  description: { type: String, trim: true }
};

const lessonPlanSchema = withCommon({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  teacherId: { type: String, trim: true, default: '' },
  teacherName: { type: String, trim: true, default: '' },
  className: { type: String, trim: true, default: '' },
  section: { type: String, trim: true, default: '' },
  subjectName: { type: String, trim: true, default: '' },
  curriculumId: { type: String, trim: true, default: '' },
  topicIds: { type: [String], default: [] },
  topic: { type: String, trim: true, default: '' },
  date: { type: String, trim: true, default: '' }, // YYYY-MM-DD
  periods: { type: Number, min: 1, max: 20, default: 1 },
  objectives: { type: String, trim: true, default: '' },
  activities: { type: String, trim: true, default: '' },
  resources: { type: String, trim: true, default: '' },
  assessment: { type: String, trim: true, default: '' },
  status: {
    type: String,
    enum: ['draft', 'planned', 'delivered', 'cancelled', 'published'],
    default: 'draft'
  },
  deliveredOn: { type: String, trim: true, default: '' },
  deliveryNote: { type: String, trim: true, default: '' },
  // Legacy placeholder field
  subject: { type: String, trim: true }
});
lessonPlanSchema.index({ className: 1, section: 1, subjectName: 1, date: -1 });
lessonPlanSchema.index({ curriculumId: 1, status: 1 });

const homeworkSchema = withCommon({ ...classWorkFields });
homeworkSchema.index({ className: 1, section: 1, dueDate: -1 });

const assignmentSchema = withCommon({
  ...classWorkFields,
  maxMarks: { type: Number, min: 1, max: 1000, default: 20 }
});
assignmentSchema.index({ className: 1, section: 1, dueDate: -1 });

const quizSchema = withCommon({
  ...classWorkFields,
  topic: { type: String, trim: true, default: '' },
  date: { type: String, trim: true, default: '' },
  durationMinutes: { type: Number, min: 1, max: 600, default: 15 },
  questions: { type: [questionSchema], default: [] },
  maxMarks: { type: Number, min: 0, max: 1000, default: 0 }
});
quizSchema.index({ className: 1, section: 1, date: -1 });

const curriculumSchema = withCommon({
  className: { type: String, required: true, trim: true },
  subjectName: { type: String, trim: true, default: '' },
  subjectId: { type: String, trim: true, default: '' },
  description: { type: String, trim: true, default: '' },
  status: { type: String, enum: ['draft', 'published', 'proposed', 'selected'], default: 'draft' },
  units: { type: [unitSchema], default: [] },
  books: { type: [bookSchema], default: [] },
  // Legacy placeholder fields (one book per record)
  subject: { type: String, trim: true },
  bookTitle: { type: String, trim: true },
  author: { type: String, trim: true },
  publisher: { type: String, trim: true },
  sessionType: { type: String, trim: true }
});
curriculumSchema.index({ className: 1, subjectName: 1 });

module.exports = {
  AcademicLessonPlan: createContextModelProxy('AcademicLessonPlan', lessonPlanSchema),
  AcademicHomework: createContextModelProxy('AcademicHomework', homeworkSchema),
  AcademicAssignment: createContextModelProxy('AcademicAssignment', assignmentSchema),
  AcademicQuiz: createContextModelProxy('AcademicQuiz', quizSchema),
  AcademicCurriculum: createContextModelProxy('AcademicCurriculum', curriculumSchema)
};
