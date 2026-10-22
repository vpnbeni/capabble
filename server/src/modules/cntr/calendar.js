/**
 * Exam dates on the calendar: published internal datesheets (EXMCL) for the
 * classes concerned, and each functionary's own exam duties (CNTR/EXMCL).
 * Board candidates and other functionaries' names never leave the exam pages.
 */
const schoolDate = require('../../utils/schoolDate');
const { normalizeClassName, normalizeSection } = require('../../rbac/scope');
const { item, dateFieldRange } = require('../clndr/providers');

const DUTY_LABELS = {
  CS: 'Centre Superintendent',
  DCS: 'Deputy Centre Superintendent',
  Observer: 'Observer',
  Invigilator: 'Invigilator',
  ASI: 'Assistant Superintendent',
  Clerk: 'Clerk',
  'Class IV': 'Class IV duty'
};

const subjectNames = async (Subject, ids) => {
  if (!Subject || !ids.length) return new Map();
  const subjects = await Subject.find({ _id: { $in: ids } }).select('name code').lean();
  return new Map(subjects.map((subject) => [String(subject._id), subject.name || subject.code || 'Paper']));
};

const datesheets = {
  key: 'exmcl.datesheets',
  layer: 'exams',
  features: ['exmcl_datesheets', 'datesheets'],
  audiences: ['staff', 'parent', 'student'],
  list: async ({ models, viewer, rbac, from, to, timeZone, portal }) => {
    const { DateSheet, Subject } = models;
    if (!DateSheet) return [];
    const sheets = await DateSheet.find({
      status: 'published',
      examType: { $ne: 'board' },
      'subjects.examDate': dateFieldRange(from, to, timeZone)
    }).select('title class section subjects.subject subjects.examDate subjects.timeSlot subjects.instructions').lean();
    if (!sheets.length) return [];

    const seesAll = viewer.kind === 'staff' && rbac?.hasAny(['exam.setup.read', 'exam.conduct.read']);
    const classMatches = (sheet, className, section) => (
      normalizeClassName(sheet.class) === normalizeClassName(className))
      && (!sheet.section || normalizeSection(sheet.section) === normalizeSection(section));

    const subjectIds = [...new Set(sheets.flatMap((s) => s.subjects.map((p) => String(p.subject))))];
    const names = await subjectNames(Subject, subjectIds);
    const items = [];
    sheets.forEach((sheet) => {
      let audience = [];
      if (viewer.kind === 'staff') {
        const teaches = viewer.keys.has(`staff@class:${normalizeClassName(sheet.class)}`);
        if (seesAll || teaches) audience = [null];
      } else {
        audience = viewer.children.filter((child) => classMatches(sheet, child.className, child.section));
      }
      audience.forEach((child) => {
        sheet.subjects.forEach((paper) => {
          const day = schoolDate.dateKey(paper.examDate, timeZone);
          if (!day || day < from || day > to) return;
          const subject = names.get(String(paper.subject)) || 'Paper';
          const forClass = sheet.section ? `${sheet.class} ${sheet.section}` : `class ${sheet.class}`;
          items.push(item({
            id: `exam:${sheet._id}:${paper.subject}:${day}${child ? `:${child.studentId}` : ''}`,
            title: `${subject} exam${viewer.kind === 'staff' ? ` — ${forClass}` : ''}`,
            startDate: day,
            startTime: paper.timeSlot?.start,
            endTime: paper.timeSlot?.end,
            detail: [sheet.title, paper.instructions].filter(Boolean).join(' · '),
            link: portal ? '/portal/calendar' : '/exmcl/datesheets',
            child: child ? { studentId: child.studentId, name: child.name } : null
          }));
        });
      });
    });
    return items;
  }
};

const duties = {
  key: 'exam.duties',
  layer: 'duties',
  features: ['duties', 'exmcl_duties'],
  audiences: ['staff'],
  list: async ({ models, user, from, to, timeZone }) => {
    const teacherId = user?.teacher;
    if (!teacherId) return [];
    const { DutySelection, DutyAssignment, Room } = models;
    const [selections, assignments] = await Promise.all([
      DutySelection
        ? DutySelection.find({ functionary: teacherId, examDate: { $gte: from, $lte: to } })
          .select('dutyType examDate').lean()
        : [],
      DutyAssignment ? DutyAssignment.find({
        isActive: { $ne: false },
        examDate: dateFieldRange(from, to, timeZone),
        $or: [{ functionary: teacherId }, { functionary2: teacherId }]
      }).select('examDate room').lean() : []
    ]);
    const rooms = Room && assignments.length
      ? new Map((await Room.find({ _id: { $in: assignments.map((a) => a.room).filter(Boolean) } })
        .select('roomNo roomName').lean())
        .map((room) => [String(room._id), room.roomNo || room.roomName || '']))
      : new Map();

    const items = selections
      .filter((selection) => schoolDate.isDateKey(selection.examDate))
      .map((selection) => item({
        id: `duty:${selection._id}`,
        title: `Exam duty: ${DUTY_LABELS[selection.dutyType] || selection.dutyType}`,
        startDate: selection.examDate,
        link: '/duties'
      }));
    assignments.forEach((assignment) => {
      const day = schoolDate.dateKey(assignment.examDate, timeZone);
      const room = rooms.get(String(assignment.room));
      items.push(item({
        id: `invigilation:${assignment._id}`,
        title: room ? `Invigilation — room ${room}` : 'Invigilation duty',
        startDate: day,
        link: '/duties'
      }));
    });
    return items;
  }
};

module.exports = [datesheets, duties];
