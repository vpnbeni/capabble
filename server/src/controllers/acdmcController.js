const mongoose = require('mongoose');
const {
  LESSON_PLAN_TRANSITIONS,
  CLASS_WORK_TRANSITIONS,
  CURRICULUM_TRANSITIONS,
  httpError,
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
} = require('../modules/acdmc/academics');
const { buildClassSectionOptions, normalizeClassValue } = require('../utils/classSectionMatrix');
const { sortSectionNames } = require('../utils/sortSections');
const { STUDENT_CLASS_LIST, STUDENT_SECTIONS } = require('../utils/constants');

const MODEL_KEYS = {
  LessonPlan: 'AcademicLessonPlan',
  Homework: 'AcademicHomework',
  Assignment: 'AcademicAssignment',
  Quiz: 'AcademicQuiz',
  Curriculum: 'AcademicCurriculum'
};

const CLASS_WORK = {
  homework: { key: MODEL_KEYS.Homework, label: 'Homework', marked: false, dateField: 'dueDate' },
  assignment: { key: MODEL_KEYS.Assignment, label: 'Assignment', marked: true, dateField: 'dueDate' },
  quiz: { key: MODEL_KEYS.Quiz, label: 'Quiz', marked: true, dateField: 'date' }
};

const getModel = (req, key) => {
  const Model = req.models?.[key];
  if (!Model) throw httpError(`${key} is not available for this school. Turn on Academics.`, 500);
  return Model;
};

const sendError = (res, error, fallback = 'Academics request failed.') => {
  const status = error.statusCode || (error.name === 'ValidationError' || error.name === 'CastError' ? 400 : 500);
  return res.status(status).json({
    success: false,
    message: status === 500 ? (error.message || fallback) : error.message,
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
};

const actor = (req) => String(req.user?.name || req.user?.email || '').trim();
const str = (value) => (value === undefined || value === null ? '' : String(value).trim());
const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || '')) && String(value).length === 24;
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exactInsensitive = (value) => new RegExp(`^${escapeRegex(value)}$`, 'i');

const parsePagination = (query) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 25));
  return { page, limit, skip: (page - 1) * limit };
};

// "7th" → "Class 7", the way schools write it.
const classDisplay = (className) => `Class ${String(className || '').replace(/^(\d+)(st|nd|rd|th)$/i, '$1')}`;

const compareClass = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });

const nextSessionLabel = (label) => {
  const match = /^(\d{4})-(\d{4})$/.exec(String(label || ''));
  if (!match) return '';
  return `${Number(match[1]) + 1}-${Number(match[2]) + 1}`;
};

// Mongoose plugins add their own top-level `$or` (session scoping), so every
// condition here is collected into an `$and` list instead of a bare `$or`.
const buildListFilter = (query, { subjectLegacy = true, searchFields = ['title'] } = {}) => {
  const and = [{ isActive: { $ne: false } }];
  if (str(query.className)) and.push({ className: str(query.className) });
  if (str(query.section)) and.push({ section: str(query.section) });
  if (str(query.subjectName)) {
    const subject = exactInsensitive(str(query.subjectName));
    and.push(subjectLegacy ? { $or: [{ subjectName: subject }, { subject }] } : { subjectName: subject });
  }
  if (str(query.teacherId)) and.push({ teacherId: str(query.teacherId) });
  if (str(query.q)) {
    const rx = new RegExp(escapeRegex(str(query.q)), 'i');
    and.push({ $or: searchFields.map((field) => ({ [field]: rx })) });
  }
  return and;
};

const finalizeFilter = (and) => (and.length === 1 ? and[0] : { $and: and });

// ── Shared lookups (other modules' data, read-only) ─────────────────────

const getLatestTimetableState = async (req, select) => {
  const TimetableState = req.models?.TimetableState;
  if (!TimetableState) return null;
  const filter = req.academicSession ? { academicSession: req.academicSession } : {};
  return TimetableState.findOne(filter).sort({ updatedAt: -1 }).select(select).lean();
};

/**
 * Classes and their sections: the timetable's class matrix when the school
 * has set one up, otherwise the classes students are enrolled in, otherwise
 * the standard class list.
 */
const getClassOptions = async (req) => {
  if (req._acdmcClassOptions) return req._acdmcClassOptions;
  let options = [];
  let source = 'default';

  const state = await getLatestTimetableState(req, 'matrixClasses matrixSections matrixSelection');
  if (state) {
    options = buildClassSectionOptions(state);
    if (options.length) source = 'timetable';
  }

  if (!options.length && req.models?.Student) {
    const students = await req.models.Student.find({ isActive: true }).select('class section').lean();
    const map = new Map();
    students.forEach((student) => {
      const className = normalizeClassValue(student.class);
      const sectionName = str(student.section);
      if (!className || !sectionName) return;
      if (!map.has(className)) map.set(className, new Set());
      map.get(className).add(sectionName);
    });
    options = Array.from(map.entries()).map(([name, sections]) => ({ className: name, sections: Array.from(sections) }));
    if (options.length) source = 'students';
  }

  if (!options.length) {
    options = STUDENT_CLASS_LIST.map((name) => ({ className: name, sections: STUDENT_SECTIONS.slice(0, 4) }));
  }

  const result = {
    source,
    classOptions: options
      .map((item) => ({
        className: item.className,
        sections: [...item.sections].sort((a, b) => sortSectionNames(a, b, item.className))
      }))
      .sort((a, b) => compareClass(a.className, b.className))
  };
  req._acdmcClassOptions = result;
  return result;
};

const sectionsForClass = async (req, className) => {
  const { classOptions } = await getClassOptions(req);
  return classOptions.find((item) => item.className === className)?.sections || [];
};

const getSubjects = async (req, state) => {
  const seen = new Map();
  const add = (name, className, code = '') => {
    const clean = str(name);
    if (!clean) return;
    const key = `${clean.toLowerCase()}|${className || ''}`;
    if (!seen.has(key)) seen.set(key, { name: clean, code: str(code), className: className || '' });
  };

  if (req.models?.Subject) {
    const subjects = await req.models.Subject.find({ isActive: { $ne: false } }).select('name code class').lean();
    subjects.forEach((subject) => add(subject.name, normalizeClassValue(subject.class), subject.code));
  }

  if (state) {
    const subjectNameById = new Map((state.subjects || []).map((s) => [String(s.id), s.name]));
    (state.classes || []).forEach((cls) => {
      (cls.subjects || []).forEach((subject) => add(subjectNameById.get(String(subject)) || subject, normalizeClassValue(cls.className)));
    });
    (state.subjects || []).forEach((subject) => add(subject.name, ''));
  }

  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
};

const getAllocations = (state) => {
  if (!state) return [];
  const subjectNameById = new Map((state.subjects || []).map((s) => [String(s.id), s.name]));
  const rows = [];
  (state.teacherSubjectAllocations || []).forEach((allocation) => {
    (allocation.assignments || []).forEach((assignment) => {
      (assignment.subjects || []).forEach((subject) => {
        rows.push({
          teacherId: str(allocation.teacherId),
          teacherName: str(allocation.teacherName),
          className: normalizeClassValue(assignment.className),
          section: str(assignment.section),
          subjectName: str(subjectNameById.get(String(subject)) || subject)
        });
      });
    });
  });
  return rows;
};

const resolveTeacherName = async (req, teacherId, fallback) => {
  if (!teacherId || !isObjectId(teacherId) || !req.models?.Teacher) return str(fallback);
  const teacher = await req.models.Teacher.findById(teacherId).select('name').lean();
  return teacher?.name || str(fallback);
};

/** Keep only topic ids that belong to the chosen syllabus. */
const resolveTopics = async (req, curriculumId, topicIds) => {
  if (!curriculumId || !isObjectId(curriculumId)) return { curriculumId: '', topicIds: [] };
  const curriculum = await getModel(req, MODEL_KEYS.Curriculum).findOne({ _id: curriculumId, isActive: { $ne: false } }).select('units').lean();
  if (!curriculum) return { curriculumId: '', topicIds: [] };
  const valid = new Set(listTopicIds(curriculum));
  return { curriculumId, topicIds: (topicIds || []).map(String).filter((t) => valid.has(t)) };
};

const findActive = async (Model, id, label) => {
  if (!isObjectId(id)) throw httpError(`${label} not found.`, 404);
  const doc = await Model.findOne({ _id: id, isActive: { $ne: false } });
  if (!doc) throw httpError(`${label} not found.`, 404);
  return doc;
};

const countByStatus = async (Model, and, statuses, aliases = {}) => {
  const counts = {};
  await Promise.all(statuses.map(async (status) => {
    const values = [status, ...(aliases[status] || [])];
    counts[status] = await Model.countDocuments(finalizeFilter([...and, { status: { $in: values } }]));
  }));
  return counts;
};

// ── Options + overview ───────────────────────────────────────────────────

const getOptions = async (req, res) => {
  try {
    const state = await getLatestTimetableState(req, 'subjects classes teacherSubjectAllocations');
    const [{ classOptions, source }, subjects, teachers] = await Promise.all([
      getClassOptions(req),
      getSubjects(req, state),
      req.models?.Teacher
        ? req.models.Teacher.find({ isActive: { $ne: false } }).select('name employeeId designation department').sort({ name: 1 }).lean()
        : []
    ]);
    return res.json({
      success: true,
      data: {
        classSource: source,
        classOptions,
        subjects,
        teachers: teachers.map((t) => ({
          _id: String(t._id),
          name: t.name,
          employeeId: t.employeeId || '',
          designation: t.designation || '',
          department: t.department || ''
        })),
        allocations: getAllocations(state),
        academicSession: req.academicSession || ''
      }
    });
  } catch (error) {
    return sendError(res, error, 'Failed to load class and subject options.');
  }
};

const getOverview = async (req, res) => {
  try {
    const today = new Date();
    const todayKey = toDateKey(today);
    const weekAheadKey = toDateKey(addDays(today, 7));
    const week = weekRange(today);
    const LessonPlan = getModel(req, MODEL_KEYS.LessonPlan);
    const Homework = getModel(req, MODEL_KEYS.Homework);
    const Assignment = getModel(req, MODEL_KEYS.Assignment);
    const Quiz = getModel(req, MODEL_KEYS.Quiz);
    const Curriculum = getModel(req, MODEL_KEYS.Curriculum);
    const active = { isActive: { $ne: false } };

    const [weekPlans, todayPlans, homework, assignments, quizzes, curricula] = await Promise.all([
      LessonPlan.find({ ...active, date: { $gte: week.from, $lte: week.to } }).select('status').lean(),
      LessonPlan.find({ ...active, date: todayKey, status: { $ne: 'cancelled' } })
        .select('title className section subjectName subject teacherName status periods topic')
        .sort({ className: 1, section: 1 }).lean(),
      Homework.find({ ...active, status: 'published', dueDate: { $gte: todayKey, $lte: weekAheadKey } })
        .select('title className section subjectName subject dueDate submissions').lean(),
      Assignment.find({ ...active, status: { $in: ['published', 'closed'] } })
        .select('title className section subjectName subject dueDate status submissions maxMarks').lean(),
      Quiz.find({ ...active, status: 'published', date: { $gte: todayKey, $lte: weekAheadKey } })
        .select('title className section subjectName subject date').lean(),
      Curriculum.find(active).lean()
    ]);

    const plansThisWeek = weekPlans.filter((p) => p.status !== 'cancelled' && p.status !== 'draft').length;
    const deliveredThisWeek = weekPlans.filter((p) => p.status === 'delivered').length;

    const awaitingMarks = assignments.filter((a) => {
      if (!a.dueDate || a.dueDate > todayKey) return false;
      const summary = summarizeSubmissions(a.submissions || []);
      return summary.marked < Math.max(summary.turnedIn, 1);
    });

    const normalizedCurricula = curricula.map(normalizeCurriculum);
    const curriculumIds = normalizedCurricula.map((c) => String(c._id));
    const deliveredPlans = curriculumIds.length
      ? await LessonPlan.find({ ...active, status: 'delivered', curriculumId: { $in: curriculumIds } })
        .select('curriculumId section topicIds status').lean()
      : [];

    const coverage = [];
    for (const curriculum of normalizedCurricula) {
      const total = listTopicIds(curriculum).length;
      if (!total) continue;
      const sections = await sectionsForClass(req, curriculum.className);
      const plans = deliveredPlans.filter((p) => p.curriculumId === String(curriculum._id));
      computeCoverage(curriculum, plans, sections).forEach((row) => {
        coverage.push({
          curriculumId: String(curriculum._id),
          className: curriculum.className,
          section: row.section,
          subjectName: curriculum.subjectName,
          covered: row.covered,
          total: row.total,
          percent: row.percent
        });
      });
    }
    coverage.sort((a, b) => compareClass(a.className, b.className) || a.section.localeCompare(b.section) || a.subjectName.localeCompare(b.subjectName));

    const dueSoon = [
      ...homework.map((h) => ({ kind: 'homework', date: h.dueDate, ...h })),
      ...assignments.filter((a) => a.status === 'published' && a.dueDate >= todayKey && a.dueDate <= weekAheadKey)
        .map((a) => ({ kind: 'assignment', date: a.dueDate, ...a })),
      ...quizzes.map((q) => ({ kind: 'quiz', date: q.date, ...q }))
    ]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 10)
      .map((item) => {
        const summary = summarizeSubmissions(item.submissions || []);
        return {
          kind: item.kind,
          _id: String(item._id),
          title: item.title,
          className: item.className,
          section: item.section,
          subjectName: str(item.subjectName) || str(item.subject),
          date: item.date,
          turnedIn: summary.turnedIn,
          total: summary.total
        };
      });

    return res.json({
      success: true,
      data: {
        today: todayKey,
        week,
        stats: {
          plansThisWeek,
          deliveredThisWeek,
          homeworkDueThisWeek: homework.length,
          assignmentsAwaitingMarks: awaitingMarks.length,
          syllabiPublished: normalizedCurricula.filter((c) => c.status === 'published').length,
          syllabiTotal: normalizedCurricula.length
        },
        coverage,
        dueSoon,
        todayPlans: todayPlans.map(normalizeLessonPlan)
      }
    });
  } catch (error) {
    return sendError(res, error, 'Failed to load the academics overview.');
  }
};

// ── Lesson plans ─────────────────────────────────────────────────────────

const listLessonPlans = async (req, res) => {
  try {
    const LessonPlan = getModel(req, MODEL_KEYS.LessonPlan);
    const { page, limit, skip } = parsePagination(req.query);
    const and = buildListFilter(req.query, { searchFields: ['title', 'topic', 'teacherName'] });
    if (req.sectionScope) and.push(req.sectionScope);
    if (str(req.query.from)) and.push({ date: { $gte: str(req.query.from) } });
    if (str(req.query.to)) and.push({ date: { $lte: str(req.query.to) } });
    const counts = await countByStatus(LessonPlan, and, ['draft', 'planned', 'delivered', 'cancelled'], { planned: ['published'] });
    const status = str(req.query.status);
    if (status) and.push({ status: { $in: status === 'planned' ? ['planned', 'published'] : [status] } });
    const filter = finalizeFilter(and);
    const [items, total] = await Promise.all([
      LessonPlan.find(filter).sort({ date: -1, updatedAt: -1 }).skip(skip).limit(limit).lean(),
      LessonPlan.countDocuments(filter)
    ]);
    return res.json({
      success: true,
      data: {
        items: items.map(normalizeLessonPlan),
        counts,
        pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
      }
    });
  } catch (error) {
    return sendError(res, error, 'Failed to load lesson plans.');
  }
};

const getLessonPlan = async (req, res) => {
  try {
    const doc = await findActive(getModel(req, MODEL_KEYS.LessonPlan), req.params.id, 'Lesson plan');
    return res.json({ success: true, data: normalizeLessonPlan(doc.toObject()) });
  } catch (error) {
    return sendError(res, error);
  }
};

const lessonPlanPayload = async (req) => {
  const { body } = req;
  const topics = await resolveTopics(req, body.curriculumId, body.topicIds);
  return {
    title: body.title,
    teacherId: body.teacherId || '',
    teacherName: await resolveTeacherName(req, body.teacherId, body.teacherName),
    className: body.className,
    section: body.section,
    subjectName: body.subjectName,
    curriculumId: topics.curriculumId,
    topicIds: topics.topicIds,
    topic: body.topic || '',
    date: body.date,
    periods: body.periods,
    objectives: body.objectives || '',
    activities: body.activities || '',
    resources: body.resources || '',
    assessment: body.assessment || ''
  };
};

const createLessonPlan = async (req, res) => {
  try {
    const LessonPlan = getModel(req, MODEL_KEYS.LessonPlan);
    const payload = await lessonPlanPayload(req);
    const doc = await LessonPlan.create({ ...payload, status: req.body.status || 'draft', createdBy: actor(req), updatedBy: actor(req) });
    return res.status(201).json({ success: true, data: normalizeLessonPlan(doc.toObject()), message: 'Lesson plan saved.' });
  } catch (error) {
    return sendError(res, error, 'Failed to save the lesson plan.');
  }
};

const updateLessonPlan = async (req, res) => {
  try {
    const doc = await findActive(getModel(req, MODEL_KEYS.LessonPlan), req.params.id, 'Lesson plan');
    const payload = await lessonPlanPayload(req);
    doc.set({ ...payload, subject: undefined, updatedBy: actor(req) });
    if (doc.status === 'published') doc.status = 'planned';
    const requested = req.body.status;
    if (requested && requested !== doc.status && ['draft', 'planned'].includes(doc.status)) {
      assertTransition(LESSON_PLAN_TRANSITIONS, doc.status, requested);
      doc.status = requested;
    }
    await doc.save();
    return res.json({ success: true, data: normalizeLessonPlan(doc.toObject()), message: 'Lesson plan updated.' });
  } catch (error) {
    return sendError(res, error, 'Failed to update the lesson plan.');
  }
};

const setLessonPlanStatus = async (req, res) => {
  try {
    const doc = await findActive(getModel(req, MODEL_KEYS.LessonPlan), req.params.id, 'Lesson plan');
    const from = doc.status === 'published' ? 'planned' : doc.status;
    const to = req.body.status;
    assertTransition(LESSON_PLAN_TRANSITIONS, from, to);
    doc.status = to;
    if (to === 'delivered') {
      doc.deliveredOn = req.body.deliveredOn || doc.date || toDateKey(new Date());
      doc.deliveryNote = req.body.deliveryNote || '';
    } else if (from === 'delivered') {
      doc.deliveredOn = '';
    }
    doc.updatedBy = actor(req);
    await doc.save();
    return res.json({ success: true, data: normalizeLessonPlan(doc.toObject()), message: 'Lesson plan updated.' });
  } catch (error) {
    return sendError(res, error, 'Failed to update the lesson plan.');
  }
};

const removeLessonPlan = async (req, res) => {
  try {
    const doc = await findActive(getModel(req, MODEL_KEYS.LessonPlan), req.params.id, 'Lesson plan');
    doc.isActive = false;
    doc.updatedBy = actor(req);
    await doc.save();
    return res.json({ success: true, message: 'Lesson plan deleted.' });
  } catch (error) {
    return sendError(res, error, 'Failed to delete the lesson plan.');
  }
};

// ── Homework, assignments, quizzes ───────────────────────────────────────

const workMaxMarks = (kind, doc) => {
  if (kind === 'assignment') return Number(doc.maxMarks) || null;
  if (kind === 'quiz') return Number(doc.maxMarks) || null;
  return null;
};

const toListItem = (kind, doc) => {
  const work = normalizeClassWork(doc);
  const summary = summarizeSubmissions(work.submissions, workMaxMarks(kind, work));
  const { submissions, questions, ...rest } = work;
  return { ...rest, questionCount: Array.isArray(questions) ? questions.length : undefined, summary };
};

const makeClassWorkHandlers = (kind) => {
  const config = CLASS_WORK[kind];
  const { label } = config;

  const list = async (req, res) => {
    try {
      const Model = getModel(req, config.key);
      const { page, limit, skip } = parsePagination(req.query);
      const and = buildListFilter(req.query, { searchFields: ['title', 'teacherName', 'instructions'] });
      if (req.sectionScope) and.push(req.sectionScope);
      if (str(req.query.from)) and.push({ [config.dateField]: { $gte: str(req.query.from) } });
      if (str(req.query.to)) and.push({ [config.dateField]: { $lte: str(req.query.to) } });
      const counts = await countByStatus(Model, and, ['draft', 'published', 'closed']);
      if (str(req.query.status)) and.push({ status: str(req.query.status) });
      const filter = finalizeFilter(and);
      const [items, total] = await Promise.all([
        Model.find(filter).sort({ [config.dateField]: -1, updatedAt: -1 }).skip(skip).limit(limit).lean(),
        Model.countDocuments(filter)
      ]);
      return res.json({
        success: true,
        data: {
          items: items.map((doc) => toListItem(kind, doc)),
          counts,
          pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
        }
      });
    } catch (error) {
      return sendError(res, error, `Failed to load ${label.toLowerCase()}.`);
    }
  };

  const get = async (req, res) => {
    try {
      const doc = await findActive(getModel(req, config.key), req.params.id, label);
      const work = normalizeClassWork(doc.toObject());
      return res.json({ success: true, data: { ...work, summary: summarizeSubmissions(work.submissions, workMaxMarks(kind, work)) } });
    } catch (error) {
      return sendError(res, error);
    }
  };

  const payloadFor = async (req) => {
    const { body } = req;
    const topics = await resolveTopics(req, body.curriculumId, body.topicIds);
    const payload = {
      title: body.title,
      teacherId: body.teacherId || '',
      teacherName: await resolveTeacherName(req, body.teacherId, body.teacherName),
      className: body.className,
      section: body.section,
      subjectName: body.subjectName,
      curriculumId: topics.curriculumId,
      topicIds: topics.topicIds,
      assignedDate: body.assignedDate || '',
      dueDate: body.dueDate || '',
      instructions: body.instructions || ''
    };
    if (kind === 'assignment') payload.maxMarks = body.maxMarks;
    if (kind === 'quiz') {
      payload.date = body.date;
      payload.dueDate = body.date;
      payload.topic = body.topic || '';
      payload.durationMinutes = body.durationMinutes;
    }
    // Questions are only replaced when the request sends them (the details
    // sheet doesn't), so editing a quiz's details never drops its questions.
    if (kind === 'quiz' && Array.isArray(body.questions)) {
      validateQuestions(body.questions);
      payload.questions = (body.questions || []).map((q) => ({
        ...(isObjectId(q._id) ? { _id: q._id } : {}),
        type: q.type,
        text: q.text,
        options: q.type === 'mcq' ? (q.options || []).map(str).filter(Boolean) : [],
        answer: q.answer || '',
        marks: q.marks
      }));
      payload.maxMarks = sumQuestionMarks(payload.questions);
    }
    return payload;
  };

  const create = async (req, res) => {
    try {
      const Model = getModel(req, config.key);
      const payload = await payloadFor(req);
      const doc = await Model.create({ ...payload, status: req.body.status || 'draft', createdBy: actor(req), updatedBy: actor(req) });
      return res.status(201).json({ success: true, data: normalizeClassWork(doc.toObject()), message: `${label} saved.` });
    } catch (error) {
      return sendError(res, error, `Failed to save the ${label.toLowerCase()}.`);
    }
  };

  const update = async (req, res) => {
    try {
      const doc = await findActive(getModel(req, config.key), req.params.id, label);
      const payload = await payloadFor(req);
      const classChanged = payload.className !== doc.className || payload.section !== doc.section;
      doc.set({ ...payload, subject: undefined, description: undefined, updatedBy: actor(req) });
      if (classChanged) doc.submissions = [];
      if (payload.maxMarks !== undefined) {
        const max = Number(payload.maxMarks) || 0;
        const over = (doc.submissions || []).find((row) => row.marks !== null && row.marks !== undefined && row.marks > max);
        if (over) throw httpError(`${over.studentName || 'A student'} already has ${over.marks} marks. Set maximum marks to at least ${over.marks}.`);
      }
      const requested = req.body.status;
      if (requested && requested !== doc.status && doc.status === 'draft') {
        assertTransition(CLASS_WORK_TRANSITIONS, doc.status, requested);
        doc.status = requested;
      }
      await doc.save();
      return res.json({ success: true, data: normalizeClassWork(doc.toObject()), message: `${label} updated.` });
    } catch (error) {
      return sendError(res, error, `Failed to update the ${label.toLowerCase()}.`);
    }
  };

  const setStatus = async (req, res) => {
    try {
      const doc = await findActive(getModel(req, config.key), req.params.id, label);
      if (kind === 'quiz' && req.body.status === 'published' && !(doc.questions || []).length) {
        throw httpError('Add at least one question before publishing this quiz.');
      }
      assertTransition(CLASS_WORK_TRANSITIONS, doc.status, req.body.status);
      doc.status = req.body.status;
      doc.updatedBy = actor(req);
      await doc.save();
      return res.json({ success: true, data: normalizeClassWork(doc.toObject()), message: `${label} updated.` });
    } catch (error) {
      return sendError(res, error, `Failed to update the ${label.toLowerCase()}.`);
    }
  };

  const remove = async (req, res) => {
    try {
      const doc = await findActive(getModel(req, config.key), req.params.id, label);
      doc.isActive = false;
      doc.updatedBy = actor(req);
      await doc.save();
      return res.json({ success: true, message: `${label} deleted.` });
    } catch (error) {
      return sendError(res, error, `Failed to delete the ${label.toLowerCase()}.`);
    }
  };

  const roster = async (req, res) => {
    try {
      const doc = await findActive(getModel(req, config.key), req.params.id, label);
      const work = normalizeClassWork(doc.toObject());
      let students = [];
      const studentsAvailable = Boolean(req.models?.Student);
      if (studentsAvailable && work.className && work.section) {
        const candidates = await req.models.Student
          .find({ isActive: true, section: exactInsensitive(work.section) })
          .select('name rollNumber classRollNo class section')
          .lean();
        students = candidates.filter((s) => normalizeClassValue(s.class) === normalizeClassValue(work.className));
      }
      const rows = mergeRoster(students, work.submissions);
      const maxMarks = workMaxMarks(kind, work);
      const { submissions, ...rest } = work;
      return res.json({
        success: true,
        data: { work: rest, rows, maxMarks, marked: config.marked, studentsAvailable, summary: summarizeSubmissions(rows, maxMarks) }
      });
    } catch (error) {
      return sendError(res, error, 'Failed to load the class list.');
    }
  };

  const saveSubmissions = async (req, res) => {
    try {
      const doc = await findActive(getModel(req, config.key), req.params.id, label);
      if (doc.status === 'draft') throw httpError(`Publish this ${label.toLowerCase()} before recording submissions.`);
      const maxMarks = config.marked ? workMaxMarks(kind, doc) : null;
      const plain = (doc.submissions || []).map((row) => (row.toObject ? row.toObject() : row));
      doc.submissions = applySubmissionUpdates(plain, req.body.rows, maxMarks);
      doc.updatedBy = actor(req);
      await doc.save();
      const work = normalizeClassWork(doc.toObject());
      return res.json({ success: true, data: { summary: summarizeSubmissions(work.submissions, maxMarks) }, message: 'Saved.' });
    } catch (error) {
      return sendError(res, error, 'Failed to save submissions.');
    }
  };

  return { list, get, create, update, setStatus, remove, roster, saveSubmissions };
};

// ── Curriculum (syllabus) ────────────────────────────────────────────────

const cleanUnits = (units) => (units || []).map((unit, index) => ({
  ...(isObjectId(unit._id) ? { _id: unit._id } : {}),
  title: unit.title,
  order: index,
  topics: (unit.topics || []).map((topic) => ({
    ...(isObjectId(topic._id) ? { _id: topic._id } : {}),
    title: topic.title,
    periods: topic.periods,
    targetMonth: topic.targetMonth || ''
  }))
}));

const cleanBooks = (books) => (books || []).map((book) => ({
  ...(isObjectId(book._id) ? { _id: book._id } : {}),
  title: book.title,
  author: book.author || '',
  publisher: book.publisher || '',
  sessionType: book.sessionType,
  status: book.status
}));

const findDuplicateCurriculum = (Curriculum, className, subjectName, excludeId, academicSession) => {
  const subject = exactInsensitive(subjectName);
  const and = [
    { isActive: { $ne: false } },
    { className },
    { $or: [{ subjectName: subject }, { subject }] }
  ];
  if (excludeId) and.push({ _id: { $ne: excludeId } });
  // A top-level academicSession stops the session plugin from adding the
  // current session, so copies into the next session are checked there.
  const filter = academicSession ? { academicSession, $and: and } : { $and: and };
  return Curriculum.findOne(filter).lean();
};

const curriculumWithCoverage = async (req, curricula) => {
  const LessonPlan = getModel(req, MODEL_KEYS.LessonPlan);
  const ids = curricula.map((c) => String(c._id));
  const plans = ids.length
    ? await LessonPlan.find({ isActive: { $ne: false }, status: 'delivered', curriculumId: { $in: ids } })
      .select('curriculumId section topicIds status').lean()
    : [];
  const results = [];
  for (const curriculum of curricula) {
    const sections = await sectionsForClass(req, curriculum.className);
    const rows = computeCoverage(curriculum, plans.filter((p) => p.curriculumId === String(curriculum._id)), sections);
    const topicCount = listTopicIds(curriculum).length;
    const percent = rows.length ? Math.round(rows.reduce((t, r) => t + r.percent, 0) / rows.length) : 0;
    results.push({
      ...curriculum,
      unitCount: (curriculum.units || []).length,
      topicCount,
      plannedPeriods: sumPlannedPeriods(curriculum),
      coverage: { percent, sections: rows.length }
    });
  }
  return results;
};

const listCurriculum = async (req, res) => {
  try {
    const Curriculum = getModel(req, MODEL_KEYS.Curriculum);
    const and = buildListFilter({ ...req.query, section: '', teacherId: '' }, { searchFields: ['subjectName', 'subject', 'description', 'bookTitle'] });
    const docs = await Curriculum.find(finalizeFilter(and)).lean();
    let items = docs.map(normalizeCurriculum);
    const counts = {
      draft: items.filter((c) => c.status === 'draft').length,
      published: items.filter((c) => c.status === 'published').length
    };
    if (str(req.query.status)) items = items.filter((c) => c.status === str(req.query.status));
    items.sort((a, b) => compareClass(a.className, b.className) || a.subjectName.localeCompare(b.subjectName));
    const withCoverage = await curriculumWithCoverage(req, items);
    return res.json({
      success: true,
      data: {
        items: withCoverage.map(({ units, ...rest }) => rest),
        counts,
        pagination: { page: 1, limit: withCoverage.length, total: withCoverage.length, pages: 1 }
      }
    });
  } catch (error) {
    return sendError(res, error, 'Failed to load syllabi.');
  }
};

const getCurriculum = async (req, res) => {
  try {
    const doc = await findActive(getModel(req, MODEL_KEYS.Curriculum), req.params.id, 'Syllabus');
    const [withCoverage] = await curriculumWithCoverage(req, [normalizeCurriculum(doc.toObject())]);
    return res.json({ success: true, data: withCoverage });
  } catch (error) {
    return sendError(res, error);
  }
};

const createCurriculum = async (req, res) => {
  try {
    const Curriculum = getModel(req, MODEL_KEYS.Curriculum);
    const { className, subjectName } = req.body;
    if (await findDuplicateCurriculum(Curriculum, className, subjectName)) {
      throw httpError(`A ${subjectName} syllabus for ${classDisplay(className)} already exists.`, 409);
    }
    const doc = await Curriculum.create({
      className,
      subjectName,
      subjectId: req.body.subjectId || '',
      description: req.body.description || '',
      units: cleanUnits(req.body.units),
      books: cleanBooks(req.body.books),
      status: 'draft',
      createdBy: actor(req),
      updatedBy: actor(req)
    });
    return res.status(201).json({ success: true, data: normalizeCurriculum(doc.toObject()), message: 'Syllabus saved.' });
  } catch (error) {
    return sendError(res, error, 'Failed to save the syllabus.');
  }
};

const updateCurriculum = async (req, res) => {
  try {
    const Curriculum = getModel(req, MODEL_KEYS.Curriculum);
    const doc = await findActive(Curriculum, req.params.id, 'Syllabus');
    const { className, subjectName } = req.body;
    if (await findDuplicateCurriculum(Curriculum, className, subjectName, doc._id)) {
      throw httpError(`A ${subjectName} syllabus for ${classDisplay(className)} already exists.`, 409);
    }
    const normalized = normalizeCurriculum(doc.toObject());
    doc.set({
      className,
      subjectName,
      subjectId: req.body.subjectId || '',
      description: req.body.description || '',
      units: cleanUnits(req.body.units),
      books: cleanBooks(req.body.books),
      status: normalized.status,
      subject: undefined,
      bookTitle: undefined,
      author: undefined,
      publisher: undefined,
      sessionType: undefined,
      updatedBy: actor(req)
    });
    await doc.save();
    const [withCoverage] = await curriculumWithCoverage(req, [normalizeCurriculum(doc.toObject())]);
    return res.json({ success: true, data: withCoverage, message: 'Syllabus updated.' });
  } catch (error) {
    return sendError(res, error, 'Failed to update the syllabus.');
  }
};

const setCurriculumStatus = async (req, res) => {
  try {
    const doc = await findActive(getModel(req, MODEL_KEYS.Curriculum), req.params.id, 'Syllabus');
    const from = normalizeCurriculum(doc.toObject()).status;
    const to = req.body.status;
    assertTransition(CURRICULUM_TRANSITIONS, from, to);
    if (to === 'published' && !listTopicIds(doc).length) {
      throw httpError('Add at least one topic before publishing this syllabus.');
    }
    doc.status = to;
    doc.updatedBy = actor(req);
    await doc.save();
    return res.json({ success: true, data: normalizeCurriculum(doc.toObject()), message: to === 'published' ? 'Syllabus published.' : 'Syllabus moved to draft.' });
  } catch (error) {
    return sendError(res, error, 'Failed to update the syllabus.');
  }
};

const removeCurriculum = async (req, res) => {
  try {
    const doc = await findActive(getModel(req, MODEL_KEYS.Curriculum), req.params.id, 'Syllabus');
    doc.isActive = false;
    doc.updatedBy = actor(req);
    await doc.save();
    return res.json({ success: true, message: 'Syllabus deleted.' });
  } catch (error) {
    return sendError(res, error, 'Failed to delete the syllabus.');
  }
};

const getCurriculumCoverage = async (req, res) => {
  try {
    const doc = await findActive(getModel(req, MODEL_KEYS.Curriculum), req.params.id, 'Syllabus');
    const curriculum = normalizeCurriculum(doc.toObject());
    const sections = await sectionsForClass(req, curriculum.className);
    const plans = await getModel(req, MODEL_KEYS.LessonPlan)
      .find({ isActive: { $ne: false }, curriculumId: String(curriculum._id), status: { $in: ['planned', 'delivered', 'published'] } })
      .select('section topicIds status date deliveredOn teacherName title')
      .sort({ date: 1 })
      .lean();
    const coverage = computeCoverage(curriculum, plans, sections);
    // Last delivery per section + topic, and topics planned but not yet delivered.
    const detail = {};
    plans.forEach((plan) => {
      const section = str(plan.section);
      if (!detail[section]) detail[section] = {};
      (plan.topicIds || []).forEach((topicId) => {
        const prev = detail[section][topicId];
        if (plan.status === 'delivered') {
          detail[section][topicId] = { status: 'delivered', date: plan.deliveredOn || plan.date, teacherName: plan.teacherName || '' };
        } else if (!prev) {
          detail[section][topicId] = { status: 'planned', date: plan.date, teacherName: plan.teacherName || '' };
        }
      });
    });
    return res.json({ success: true, data: { sections: coverage, detail } });
  } catch (error) {
    return sendError(res, error, 'Failed to load syllabus coverage.');
  }
};

const copyCurriculum = async (req, res) => {
  try {
    const Curriculum = getModel(req, MODEL_KEYS.Curriculum);
    const doc = await findActive(Curriculum, req.params.id, 'Syllabus');
    const source = normalizeCurriculum(doc.toObject());
    const strip = (items) => JSON.parse(JSON.stringify(items || [])).map((item) => {
      delete item._id;
      if (Array.isArray(item.topics)) item.topics.forEach((topic) => { delete topic._id; });
      return item;
    });
    const targets = [];
    req.body.classNames
      .filter((name) => name !== source.className)
      .forEach((name) => targets.push({ className: name, academicSession: req.academicSession || undefined }));
    if (req.body.toNextSession) {
      const next = nextSessionLabel(req.academicSession);
      if (!next) throw httpError('Choose a session first so the next session can be worked out.');
      targets.push({ className: source.className, academicSession: next });
    }

    const created = [];
    const skipped = [];
    for (const target of targets) {
      const existing = await findDuplicateCurriculum(Curriculum, target.className, source.subjectName, null, target.academicSession);
      const where = target.academicSession && target.academicSession !== req.academicSession
        ? `${classDisplay(target.className)}, ${target.academicSession.replace('-', '–')}`
        : classDisplay(target.className);
      if (existing) {
        skipped.push(where);
        continue;
      }
      await Curriculum.create({
        className: target.className,
        subjectName: source.subjectName,
        subjectId: source.subjectId || '',
        description: source.description || '',
        units: strip(source.units),
        books: strip(source.books.map(({ _id, ...book }) => book)),
        status: 'draft',
        ...(target.academicSession ? { academicSession: target.academicSession } : {}),
        createdBy: actor(req),
        updatedBy: actor(req)
      });
      created.push(where);
    }
    return res.json({ success: true, data: { created, skipped }, message: `Copied to ${created.length}.` });
  } catch (error) {
    return sendError(res, error, 'Failed to copy the syllabus.');
  }
};

module.exports = {
  MODEL_KEYS,
  getOptions,
  getOverview,
  lessonPlans: {
    list: listLessonPlans,
    get: getLessonPlan,
    create: createLessonPlan,
    update: updateLessonPlan,
    setStatus: setLessonPlanStatus,
    remove: removeLessonPlan
  },
  homework: makeClassWorkHandlers('homework'),
  assignments: makeClassWorkHandlers('assignment'),
  quizzes: makeClassWorkHandlers('quiz'),
  curriculum: {
    list: listCurriculum,
    get: getCurriculum,
    create: createCurriculum,
    update: updateCurriculum,
    setStatus: setCurriculumStatus,
    remove: removeCurriculum,
    coverage: getCurriculumCoverage,
    copy: copyCurriculum
  }
};
