/**
 * Pure helpers for the Academics (ACDMC) module: status rules, legacy
 * normalisation, roster merging and syllabus coverage maths. No database
 * access here, so everything is unit-testable.
 */

const LESSON_PLAN_STATUSES = ['draft', 'planned', 'delivered', 'cancelled'];
const CLASS_WORK_STATUSES = ['draft', 'published', 'closed'];
const SUBMISSION_STATUSES = ['pending', 'submitted', 'late', 'missing', 'excused'];
const CURRICULUM_STATUSES = ['draft', 'published'];

const LESSON_PLAN_TRANSITIONS = Object.freeze({
  draft: ['planned', 'delivered', 'cancelled'],
  planned: ['draft', 'delivered', 'cancelled'],
  delivered: ['planned'],
  cancelled: ['draft', 'planned']
});

const CLASS_WORK_TRANSITIONS = Object.freeze({
  draft: ['published'],
  published: ['draft', 'closed'],
  closed: ['published']
});

const CURRICULUM_TRANSITIONS = Object.freeze({
  draft: ['published'],
  published: ['draft']
});

const STATUS_LABELS = {
  draft: 'Draft',
  planned: 'Planned',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  published: 'Published',
  closed: 'Closed'
};

const httpError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const canTransition = (map, from, to) => Boolean(map[from] && map[from].includes(to));

const assertTransition = (map, from, to) => {
  if (from === to) return;
  if (!canTransition(map, from, to)) {
    throw httpError(`Can't move from ${STATUS_LABELS[from] || from} to ${STATUS_LABELS[to] || to}.`);
  }
};

const str = (value) => (value === undefined || value === null ? '' : String(value).trim());

/** Map placeholder-era lesson plan fields onto the current shape. */
const normalizeLessonPlan = (doc) => {
  if (!doc) return doc;
  const status = doc.status === 'published' ? 'planned' : (doc.status || 'draft');
  return {
    ...doc,
    subjectName: str(doc.subjectName) || str(doc.subject),
    topicIds: Array.isArray(doc.topicIds) ? doc.topicIds.map(String) : [],
    status
  };
};

/** Map placeholder-era homework / assignment / quiz fields onto the current shape. */
const normalizeClassWork = (doc) => {
  if (!doc) return doc;
  return {
    ...doc,
    subjectName: str(doc.subjectName) || str(doc.subject),
    instructions: str(doc.instructions) || str(doc.description),
    assignedDate: str(doc.assignedDate) || str(doc.date),
    dueDate: str(doc.dueDate) || str(doc.date),
    topicIds: Array.isArray(doc.topicIds) ? doc.topicIds.map(String) : [],
    submissions: Array.isArray(doc.submissions) ? doc.submissions : [],
    status: CLASS_WORK_STATUSES.includes(doc.status) ? doc.status : 'draft'
  };
};

/**
 * Placeholder-era curriculum records were one book per record. Fold those
 * fields into `books[]` and map `proposed/selected` record status to draft.
 */
const normalizeCurriculum = (doc) => {
  if (!doc) return doc;
  const books = Array.isArray(doc.books) ? [...doc.books] : [];
  if (str(doc.bookTitle) && books.length === 0) {
    books.push({
      _id: `legacy-${doc._id}`,
      title: str(doc.bookTitle),
      author: str(doc.author),
      publisher: str(doc.publisher),
      sessionType: doc.sessionType === 'next' ? 'next' : 'current',
      status: doc.status === 'selected' ? 'selected' : 'proposed'
    });
  }
  const units = (Array.isArray(doc.units) ? doc.units : [])
    .slice()
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  return {
    ...doc,
    subjectName: str(doc.subjectName) || str(doc.subject),
    status: CURRICULUM_STATUSES.includes(doc.status) ? doc.status : 'draft',
    units,
    books
  };
};

const listTopicIds = (curriculum) => {
  const ids = [];
  (curriculum?.units || []).forEach((unit) => {
    (unit.topics || []).forEach((topic) => {
      if (topic?._id) ids.push(String(topic._id));
    });
  });
  return ids;
};

/** Total number of periods the syllabus plans for. */
const sumPlannedPeriods = (curriculum) => (curriculum?.units || []).reduce(
  (total, unit) => total + (unit.topics || []).reduce((t, topic) => t + (Number(topic.periods) || 0), 0),
  0
);

/**
 * Coverage of one syllabus by section, from delivered lesson plans.
 * Returns `[{ section, delivered: Set-like array of topic ids, covered, total, percent }]`
 * for every section in `sections` plus any section that has delivered plans.
 */
const computeCoverage = (curriculum, lessonPlans, sections = []) => {
  const topicIds = new Set(listTopicIds(curriculum));
  const total = topicIds.size;
  const bySection = new Map();
  sections.forEach((section) => bySection.set(section, new Set()));

  (lessonPlans || []).forEach((plan) => {
    if (plan.status !== 'delivered') return;
    const section = str(plan.section);
    if (!section) return;
    if (!bySection.has(section)) bySection.set(section, new Set());
    const delivered = bySection.get(section);
    (plan.topicIds || []).forEach((id) => {
      if (topicIds.has(String(id))) delivered.add(String(id));
    });
  });

  return Array.from(bySection.entries())
    .map(([section, delivered]) => ({
      section,
      deliveredTopicIds: Array.from(delivered),
      covered: delivered.size,
      total,
      percent: total ? Math.round((delivered.size / total) * 100) : 0
    }))
    .sort((a, b) => a.section.localeCompare(b.section, undefined, { numeric: true }));
};

/**
 * Merge the class's current students with saved submissions. Students
 * admitted after the work was set appear as pending; saved rows for students
 * who left stay so marks are never lost.
 */
const mergeRoster = (students, submissions) => {
  const saved = new Map((submissions || []).map((row) => [String(row.studentId), row]));
  const rows = (students || []).map((student) => {
    const id = String(student._id);
    const existing = saved.get(id);
    saved.delete(id);
    return {
      studentId: id,
      studentName: student.name || existing?.studentName || '',
      rollNo: str(student.classRollNo) || str(student.rollNumber) || existing?.rollNo || '',
      status: existing?.status || 'pending',
      marks: existing?.marks ?? null,
      remark: existing?.remark || '',
      updatedAt: existing?.updatedAt || null,
      enrolled: true
    };
  });
  saved.forEach((row) => rows.push({ ...row, enrolled: false }));
  return rows.sort((a, b) => {
    const ra = Number.parseInt(a.rollNo, 10);
    const rb = Number.parseInt(b.rollNo, 10);
    if (Number.isFinite(ra) && Number.isFinite(rb) && ra !== rb) return ra - rb;
    return a.studentName.localeCompare(b.studentName);
  });
};

/**
 * Validate and apply submission updates. `maxMarks` null means the work is
 * not marked (homework), so marks are dropped.
 */
const applySubmissionUpdates = (existing, updates, maxMarks) => {
  const byId = new Map((existing || []).map((row) => [String(row.studentId), { ...row }]));
  const now = new Date();
  (updates || []).forEach((update) => {
    const id = str(update.studentId);
    if (!id) throw httpError('Each row needs a student.');
    if (update.status && !SUBMISSION_STATUSES.includes(update.status)) {
      throw httpError(`Unknown submission status "${update.status}".`);
    }
    let marks = null;
    if (maxMarks !== null && maxMarks !== undefined && update.marks !== null && update.marks !== undefined && update.marks !== '') {
      marks = Number(update.marks);
      if (!Number.isFinite(marks) || marks < 0) {
        throw httpError(`Marks for ${update.studentName || 'a student'} must be 0 or more.`);
      }
      if (marks > maxMarks) {
        throw httpError(`Marks can't be more than ${maxMarks} (${update.studentName || 'a student'} has ${marks}).`);
      }
    }
    const prev = byId.get(id) || {};
    byId.set(id, {
      studentId: id,
      studentName: str(update.studentName) || prev.studentName || '',
      rollNo: str(update.rollNo) || prev.rollNo || '',
      status: update.status || prev.status || 'pending',
      marks,
      remark: str(update.remark),
      updatedAt: now
    });
  });
  return Array.from(byId.values());
};

const summarizeSubmissions = (submissions, maxMarks = null) => {
  const rows = submissions || [];
  const counts = { pending: 0, submitted: 0, late: 0, missing: 0, excused: 0 };
  rows.forEach((row) => { counts[row.status] = (counts[row.status] || 0) + 1; });
  const marked = rows.filter((row) => row.marks !== null && row.marks !== undefined);
  const marks = marked.map((row) => Number(row.marks));
  const average = marks.length ? marks.reduce((a, b) => a + b, 0) / marks.length : null;
  return {
    total: rows.length,
    ...counts,
    turnedIn: counts.submitted + counts.late,
    marked: marked.length,
    average: average === null ? null : Math.round(average * 10) / 10,
    highest: marks.length ? Math.max(...marks) : null,
    lowest: marks.length ? Math.min(...marks) : null,
    maxMarks
  };
};

const sumQuestionMarks = (questions) => (questions || []).reduce((total, q) => total + (Number(q.marks) || 0), 0);

/** MCQs need at least two options and an answer that is one of them. */
const validateQuestions = (questions) => {
  (questions || []).forEach((question, index) => {
    const n = index + 1;
    if (!str(question.text)) throw httpError(`Question ${n} needs some text.`);
    if (question.type === 'mcq') {
      const options = (question.options || []).map(str).filter(Boolean);
      if (options.length < 2) throw httpError(`Question ${n} needs at least two options.`);
      if (str(question.answer) && !options.includes(str(question.answer))) {
        throw httpError(`Question ${n}'s answer must be one of its options.`);
      }
    }
  });
};

const toDateKey = (date) => {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** Monday–Sunday week containing `date`, as YYYY-MM-DD keys. */
const weekRange = (date = new Date()) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (d.getDay() + 6) % 7;
  const start = new Date(d);
  start.setDate(d.getDate() - offset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { from: toDateKey(start), to: toDateKey(end) };
};

const addDays = (date, days) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
};

module.exports = {
  LESSON_PLAN_STATUSES,
  CLASS_WORK_STATUSES,
  SUBMISSION_STATUSES,
  CURRICULUM_STATUSES,
  LESSON_PLAN_TRANSITIONS,
  CLASS_WORK_TRANSITIONS,
  CURRICULUM_TRANSITIONS,
  httpError,
  canTransition,
  assertTransition,
  normalizeLessonPlan,
  normalizeClassWork,
  normalizeCurriculum,
  listTopicIds,
  sumPlannedPeriods,
  computeCoverage,
  mergeRoster,
  applySubmissionUpdates,
  summarizeSubmissions,
  sumQuestionMarks,
  validateQuestions,
  toDateKey,
  weekRange,
  addDays
};
