const asyncHandler = require('../middleware/asyncHandler');
const ExamResult = require('../models/ExamResult');
const ExamDefinition = require('../models/ExamDefinition');
const Student = require('../models/Student');
const Subject = require('../models/Subject');
const { sortSectionNames } = require('../utils/sortSections');

const normalizeSubjectKey = (name) =>
  String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');

const normalizeMarksMap = (marks) => {
  if (marks instanceof Map) return Object.fromEntries(marks);
  if (marks && typeof marks === 'object') return marks;
  return {};
};

const isResultCellFilled = (result, subjectId, subjectIds) => {
  if (!result) return false;

  const marks = normalizeMarksMap(result.marks);
  const absentSubjects = new Set(
    (Array.isArray(result.absentSubjects) ? result.absentSubjects : []).map(String)
  );

  if (absentSubjects.has(subjectId)) return true;
  if (marks[subjectId] !== undefined && marks[subjectId] !== null && marks[subjectId] !== '') {
    return true;
  }
  if (result.absent) {
    if (absentSubjects.size === 0) return true;
    if (subjectIds.length > 0 && absentSubjects.size >= subjectIds.length) return true;
  }
  return false;
};

const getResults = asyncHandler(async (req, res) => {
  const ExamResultModel = req.models?.ExamResult || ExamResult;
  const { examId, class: className, section } = req.query;

  if (!examId || !className || !section) {
    return res.status(400).json({
      success: false,
      message: 'examId, class, and section are required.',
    });
  }

  const rows = await ExamResultModel.find({
    examId,
    class: className,
    section,
  }).lean();

  const data = rows.map((row) => ({
    studentId: row.studentId,
    marks: row.marks instanceof Map ? Object.fromEntries(row.marks) : (row.marks || {}),
    absent: Boolean(row.absent),
    absentSubjects: Array.isArray(row.absentSubjects) ? row.absentSubjects.map(String) : [],
  }));

  res.status(200).json({ success: true, data });
});

const upsertResults = asyncHandler(async (req, res) => {
  const ExamResultModel = req.models?.ExamResult || ExamResult;
  const { examId, class: className, section, results } = req.body;

  if (!examId || !className || !section) {
    return res.status(400).json({
      success: false,
      message: 'examId, class, and section are required.',
    });
  }

  if (!Array.isArray(results) || results.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'results must be a non-empty array.',
    });
  }

  const ExamDefinitionModel = req.models?.ExamDefinition || ExamDefinition;
  const exam = await ExamDefinitionModel.findById(examId).select('maximumMarks code name').lean();
  if (!exam) {
    return res.status(404).json({ success: false, message: 'Exam not found.' });
  }

  const maxMarks = Number(exam.maximumMarks);
  if (Number.isFinite(maxMarks) && maxMarks > 0) {
    for (const row of results) {
      if (row?.absent) continue;
      const absentSet = new Set(
        Array.isArray(row?.absentSubjects) ? row.absentSubjects.map((id) => String(id)) : []
      );
      const marks = row?.marks && typeof row.marks === 'object' ? row.marks : {};
      for (const [subject, value] of Object.entries(marks)) {
        if (absentSet.has(String(subject))) continue;
        if (value === null || value === undefined || value === '') continue;
        const num = Number(value);
        if (!Number.isFinite(num) || num < 0) {
          return res.status(400).json({
            success: false,
            message: `Invalid marks for ${subject}.`,
          });
        }
        if (num > maxMarks) {
          return res.status(400).json({
            success: false,
            message: `Marks cannot exceed M.M. ${maxMarks} for ${exam.code || exam.name || 'this exam'}.`,
          });
        }
      }
    }
  }

  const academicSession = req.academicSession || null;

  const ops = results.map(({ studentId, marks, absent, absentSubjects }) => {
    const subjects = Array.isArray(absentSubjects)
      ? [...new Set(absentSubjects.map((id) => String(id).trim()).filter(Boolean))]
      : [];
    return {
    updateOne: {
      filter: {
        examId,
        studentId,
        ...(academicSession ? { academicSession } : {}),
      },
      update: {
        $set: {
          class: className,
          section,
          marks: marks || {},
          absent: Boolean(absent),
          absentSubjects: subjects,
          ...(academicSession ? { academicSession } : {}),
        },
        $setOnInsert: {
          examId,
          studentId,
        },
      },
      upsert: true,
    },
  };
  });

  await ExamResultModel.bulkWrite(ops);

  res.status(200).json({ success: true, message: 'Results saved successfully.' });
});

const getResultEntryStatus = asyncHandler(async (req, res) => {
  const ExamResultModel = req.models?.ExamResult || ExamResult;
  const StudentModel = req.models?.Student || Student;
  const SubjectModel = req.models?.Subject || Subject;
  const { examId } = req.query;

  if (!examId) {
    return res.status(400).json({
      success: false,
      message: 'examId is required.',
    });
  }

  const academicSession = req.academicSession || null;
  const sessionFilter = academicSession ? { academicSession } : {};

  const [students, results, classSubjects] = await Promise.all([
    StudentModel.find({ isActive: true, ...sessionFilter })
      .select('_id class section subjects')
      .populate('subjects', 'name')
      .lean(),
    ExamResultModel.find({ examId, ...sessionFilter })
      .select('studentId marks absent absentSubjects')
      .lean(),
    SubjectModel.find({ isActive: true, ...sessionFilter }).select('name class').lean(),
  ]);

  const resultsByStudent = new Map(results.map((row) => [String(row.studentId), row]));
  const subjectsByClass = new Map();

  classSubjects.forEach((subject) => {
    const className = String(subject.class || '').trim();
    const key = normalizeSubjectKey(subject.name);
    if (!className || !key) return;
    if (!subjectsByClass.has(className)) subjectsByClass.set(className, new Map());
    subjectsByClass.get(className).set(key, String(subject.name || '').trim());
  });

  const groups = new Map();

  students.forEach((student) => {
    const className = String(student.class || '').trim();
    const section = String(student.section || '').trim();
    if (!className || !section) return;

    const groupKey = `${className.toLowerCase()}\0${section.toLowerCase()}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        class: className,
        section,
        students: [],
        subjectKeys: new Map(),
      });
    }

    const group = groups.get(groupKey);
    group.students.push(student);

    const classSubjectMap = subjectsByClass.get(className) || new Map();
    classSubjectMap.forEach((label, key) => {
      group.subjectKeys.set(key, label);
    });

    (student.subjects || []).forEach((subjectRef) => {
      const name =
        subjectRef && typeof subjectRef === 'object'
          ? String(subjectRef.name || '').trim()
          : String(subjectRef || '').trim();
      const key = normalizeSubjectKey(name);
      if (!key) return;
      if (!group.subjectKeys.has(key)) group.subjectKeys.set(key, name);
    });
  });

  const rows = [];

  groups.forEach((group) => {
    const subjectIds = Array.from(group.subjectKeys.keys()).sort((a, b) =>
      String(group.subjectKeys.get(a) || a).localeCompare(String(group.subjectKeys.get(b) || b), undefined, {
        sensitivity: 'base',
      })
    );

    const subjectStats = subjectIds.map((subjectId) => ({
      subjectId,
      subjectName: group.subjectKeys.get(subjectId) || subjectId,
      filledCount: 0,
      pendingCount: 0,
      studentCount: group.students.length,
      status: 'pending',
    }));

    let filledCells = 0;
    const totalCells = group.students.length * subjectIds.length;

    group.students.forEach((student) => {
      const result = resultsByStudent.get(String(student._id));
      subjectIds.forEach((subjectId, index) => {
        if (isResultCellFilled(result, subjectId, subjectIds)) {
          subjectStats[index].filledCount += 1;
          filledCells += 1;
        } else {
          subjectStats[index].pendingCount += 1;
        }
      });
    });

    subjectStats.forEach((subject) => {
      if (subject.pendingCount === 0 && subject.studentCount > 0) subject.status = 'complete';
      else if (subject.filledCount === 0) subject.status = 'pending';
      else subject.status = 'partial';
    });

    const pendingCells = totalCells - filledCells;
    let overallStatus = 'pending';
    if (totalCells > 0 && pendingCells === 0) overallStatus = 'complete';
    else if (filledCells > 0) overallStatus = 'partial';

    rows.push({
      class: group.class,
      section: group.section,
      studentCount: group.students.length,
      subjectCount: subjectIds.length,
      subjects: subjectStats,
      filledCells,
      pendingCells,
      totalCells,
      overallStatus,
    });
  });

  rows.sort((left, right) => {
    const classCompare = left.class.localeCompare(right.class, undefined, { numeric: true, sensitivity: 'base' });
    if (classCompare !== 0) return classCompare;
    return sortSectionNames(left.section, right.section, left.class);
  });

  res.status(200).json({ success: true, data: rows });
});

module.exports = { getResults, upsertResults, getResultEntryStatus };
