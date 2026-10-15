const Joi = require('joi');

const dateKey = (label) => Joi.string().trim().allow('').pattern(/^\d{4}-\d{2}-\d{2}$/).messages({
  'string.pattern.base': `${label} must be a date (YYYY-MM-DD)`
});
const text = (max = 4000) => Joi.string().trim().allow('').max(max);
const id = Joi.string().trim().allow('').max(64);

const title = Joi.string().trim().min(1).max(200).required().messages({
  'string.empty': 'Add a title',
  'any.required': 'Add a title',
  'string.max': 'Title can be at most 200 characters'
});
const className = Joi.string().trim().min(1).max(50).required().messages({
  'string.empty': 'Choose a class',
  'any.required': 'Choose a class'
});
const subjectName = Joi.string().trim().min(1).max(100).required().messages({
  'string.empty': 'Choose a subject',
  'any.required': 'Choose a subject'
});

const lessonPlanSchema = Joi.object({
  title,
  teacherId: id,
  teacherName: text(120),
  className,
  section: Joi.string().trim().min(1).max(50).required().messages({
    'string.empty': 'Choose a section',
    'any.required': 'Choose a section'
  }),
  subjectName,
  curriculumId: id,
  topicIds: Joi.array().items(Joi.string().trim().max(64)).max(100).default([]),
  topic: text(300),
  date: dateKey('Date').required().invalid('').messages({ 'any.invalid': 'Choose the date of the lesson', 'any.required': 'Choose the date of the lesson' }),
  periods: Joi.number().integer().min(1).max(20).default(1).messages({ 'number.min': 'Periods must be at least 1', 'number.max': 'Periods can be at most 20' }),
  objectives: text(),
  activities: text(),
  resources: text(),
  assessment: text(),
  status: Joi.string().valid('draft', 'planned').default('draft')
});

const lessonPlanStatusSchema = Joi.object({
  status: Joi.string().valid('draft', 'planned', 'delivered', 'cancelled').required(),
  deliveryNote: text(2000),
  deliveredOn: dateKey('Delivered on')
});

const classWorkBase = {
  title,
  teacherId: id,
  teacherName: text(120),
  className,
  section: Joi.string().trim().min(1).max(50).required().messages({
    'string.empty': 'Choose a section',
    'any.required': 'Choose a section'
  }),
  subjectName,
  curriculumId: id,
  topicIds: Joi.array().items(Joi.string().trim().max(64)).max(100).default([]),
  assignedDate: dateKey('Set on'),
  dueDate: dateKey('Due date'),
  instructions: text(8000),
  status: Joi.string().valid('draft', 'published').default('draft')
};

const homeworkSchema = Joi.object({
  ...classWorkBase,
  dueDate: dateKey('Due date').required().invalid('').messages({ 'any.invalid': 'Choose a due date', 'any.required': 'Choose a due date' })
});

const assignmentSchema = Joi.object({
  ...classWorkBase,
  dueDate: dateKey('Due date').required().invalid('').messages({ 'any.invalid': 'Choose a due date', 'any.required': 'Choose a due date' }),
  maxMarks: Joi.number().integer().min(1).max(1000).required().messages({
    'number.base': 'Enter the maximum marks',
    'number.min': 'Maximum marks must be at least 1',
    'number.max': 'Maximum marks can be at most 1000',
    'any.required': 'Enter the maximum marks'
  })
});

const questionSchema = Joi.object({
  _id: id,
  type: Joi.string().valid('mcq', 'short', 'long').default('mcq'),
  text: Joi.string().trim().min(1).max(2000).required().messages({ 'string.empty': 'Every question needs some text' }),
  options: Joi.array().items(Joi.string().trim().allow('').max(500)).max(8).default([]),
  answer: text(2000),
  marks: Joi.number().min(0).max(100).default(1)
});

const quizSchema = Joi.object({
  ...classWorkBase,
  date: dateKey('Quiz date').required().invalid('').messages({ 'any.invalid': 'Choose the quiz date', 'any.required': 'Choose the quiz date' }),
  topic: text(300),
  durationMinutes: Joi.number().integer().min(1).max(600).default(15).messages({ 'number.min': 'Duration must be at least 1 minute' }),
  questions: Joi.array().items(questionSchema).max(200)
});

const classWorkStatusSchema = Joi.object({
  status: Joi.string().valid('draft', 'published', 'closed').required()
});

const submissionsSchema = Joi.object({
  rows: Joi.array().items(Joi.object({
    studentId: Joi.string().trim().min(1).max(64).required(),
    studentName: text(200),
    rollNo: text(50),
    status: Joi.string().valid('pending', 'submitted', 'late', 'missing', 'excused').default('pending'),
    marks: Joi.alternatives().try(Joi.number(), Joi.valid(null, '')).default(null),
    remark: text(500)
  })).max(500).required()
});

const topicSchema = Joi.object({
  _id: id,
  title: Joi.string().trim().min(1).max(200).required().messages({ 'string.empty': 'Every topic needs a name' }),
  periods: Joi.number().integer().min(0).max(200).default(1),
  targetMonth: Joi.string().trim().allow('').pattern(/^\d{4}-\d{2}$/).messages({ 'string.pattern.base': 'Target month must be a month (YYYY-MM)' })
});

const unitSchema = Joi.object({
  _id: id,
  title: Joi.string().trim().min(1).max(200).required().messages({ 'string.empty': 'Every unit needs a name' }),
  order: Joi.number().integer().min(0).default(0),
  topics: Joi.array().items(topicSchema).max(100).default([])
});

const bookSchema = Joi.object({
  _id: id,
  title: Joi.string().trim().min(1).max(200).required().messages({ 'string.empty': 'Every book needs a title' }),
  author: text(200),
  publisher: text(200),
  sessionType: Joi.string().valid('current', 'next').default('current'),
  status: Joi.string().valid('proposed', 'selected').default('proposed')
});

const curriculumSchema = Joi.object({
  className,
  subjectName,
  subjectId: id,
  description: text(),
  units: Joi.array().items(unitSchema).max(60).default([]),
  books: Joi.array().items(bookSchema).max(30).default([])
});

const curriculumStatusSchema = Joi.object({
  status: Joi.string().valid('draft', 'published').required()
});

const curriculumCopySchema = Joi.object({
  classNames: Joi.array().items(Joi.string().trim().min(1).max(50)).max(20).default([]),
  toNextSession: Joi.boolean().default(false)
}).custom((value, helpers) => {
  if (!value.classNames.length && !value.toNextSession) {
    return helpers.message('Choose at least one class or the next session');
  }
  return value;
});

module.exports = {
  lessonPlanSchema,
  lessonPlanStatusSchema,
  homeworkSchema,
  assignmentSchema,
  quizSchema,
  classWorkStatusSchema,
  submissionsSchema,
  curriculumSchema,
  curriculumStatusSchema,
  curriculumCopySchema
};
