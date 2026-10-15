const {
  LESSON_PLAN_TRANSITIONS,
  CLASS_WORK_TRANSITIONS,
  canTransition,
  assertTransition,
  normalizeLessonPlan,
  normalizeClassWork,
  normalizeCurriculum,
  computeCoverage,
  mergeRoster,
  applySubmissionUpdates,
  summarizeSubmissions,
  sumQuestionMarks,
  validateQuestions,
  weekRange
} = require('../academics');

const syllabus = {
  units: [
    { _id: 'u1', title: 'Numbers', order: 1, topics: [{ _id: 't1', title: 'Integers', periods: 3 }, { _id: 't2', title: 'Fractions', periods: 4 }] },
    { _id: 'u2', title: 'Algebra', order: 2, topics: [{ _id: 't3', title: 'Expressions' }, { _id: 't4', title: 'Equations' }, { _id: 't5', title: 'Graphs' }] }
  ]
};

describe('ACDMC status transitions', () => {
  it('allows the lesson plan flow and blocks skipping back from delivered to draft', () => {
    expect(canTransition(LESSON_PLAN_TRANSITIONS, 'draft', 'planned')).toBe(true);
    expect(canTransition(LESSON_PLAN_TRANSITIONS, 'planned', 'delivered')).toBe(true);
    expect(canTransition(LESSON_PLAN_TRANSITIONS, 'delivered', 'draft')).toBe(false);
    expect(() => assertTransition(LESSON_PLAN_TRANSITIONS, 'delivered', 'cancelled')).toThrow('Can\'t move from Delivered to Cancelled.');
  });

  it('treats a same-status update as a no-op', () => {
    expect(() => assertTransition(CLASS_WORK_TRANSITIONS, 'closed', 'closed')).not.toThrow();
  });

  it('requires class work to be published before it is closed', () => {
    expect(canTransition(CLASS_WORK_TRANSITIONS, 'draft', 'closed')).toBe(false);
    expect(canTransition(CLASS_WORK_TRANSITIONS, 'published', 'closed')).toBe(true);
  });
});

describe('ACDMC legacy normalisation', () => {
  it('maps placeholder lesson plans', () => {
    const plan = normalizeLessonPlan({ _id: '1', subject: 'Maths', status: 'published' });
    expect(plan.subjectName).toBe('Maths');
    expect(plan.status).toBe('planned');
    expect(plan.topicIds).toEqual([]);
  });

  it('maps placeholder homework', () => {
    const hw = normalizeClassWork({ _id: '1', subject: 'Science', description: 'Read ch 2', status: 'published' });
    expect(hw.subjectName).toBe('Science');
    expect(hw.instructions).toBe('Read ch 2');
    expect(hw.submissions).toEqual([]);
  });

  it('folds a placeholder curriculum book into books[]', () => {
    const c = normalizeCurriculum({ _id: 'c1', className: '7th', subject: 'Maths', bookTitle: 'NCERT Maths', author: 'NCERT', sessionType: 'next', status: 'selected' });
    expect(c.subjectName).toBe('Maths');
    expect(c.status).toBe('draft');
    expect(c.books).toEqual([{ _id: 'legacy-c1', title: 'NCERT Maths', author: 'NCERT', publisher: '', sessionType: 'next', status: 'selected' }]);
  });

  it('sorts units by order', () => {
    const c = normalizeCurriculum({ _id: 'c1', units: [{ title: 'B', order: 2 }, { title: 'A', order: 1 }] });
    expect(c.units.map((u) => u.title)).toEqual(['A', 'B']);
  });
});

describe('ACDMC coverage', () => {
  it('counts distinct delivered topics per section', () => {
    const plans = [
      { section: 'A', status: 'delivered', topicIds: ['t1', 't2'] },
      { section: 'A', status: 'delivered', topicIds: ['t2'] },
      { section: 'A', status: 'planned', topicIds: ['t3'] },
      { section: 'B', status: 'delivered', topicIds: ['t1', 'unknown'] }
    ];
    const coverage = computeCoverage(syllabus, plans, ['A', 'B', 'C']);
    expect(coverage).toEqual([
      { section: 'A', deliveredTopicIds: ['t1', 't2'], covered: 2, total: 5, percent: 40 },
      { section: 'B', deliveredTopicIds: ['t1'], covered: 1, total: 5, percent: 20 },
      { section: 'C', deliveredTopicIds: [], covered: 0, total: 5, percent: 0 }
    ]);
  });

  it('returns 0% for an empty syllabus', () => {
    expect(computeCoverage({ units: [] }, [], ['A'])[0].percent).toBe(0);
  });
});

describe('ACDMC roster', () => {
  const students = [
    { _id: 's2', name: 'Bela', classRollNo: '2' },
    { _id: 's1', name: 'Aarav', classRollNo: '1' },
    { _id: 's3', name: 'Chirag', classRollNo: '10' }
  ];

  it('merges saved submissions, adds new students as pending and keeps leavers', () => {
    const rows = mergeRoster(students, [
      { studentId: 's1', studentName: 'Aarav', status: 'submitted', marks: 18 },
      { studentId: 'gone', studentName: 'Left School', rollNo: '9', status: 'late' }
    ]);
    expect(rows.map((r) => r.studentId)).toEqual(['s1', 's2', 'gone', 's3']);
    expect(rows[0]).toMatchObject({ status: 'submitted', marks: 18, enrolled: true });
    expect(rows[1]).toMatchObject({ status: 'pending', marks: null, enrolled: true });
    expect(rows[2]).toMatchObject({ status: 'late', enrolled: false });
  });
});

describe('ACDMC submissions', () => {
  it('rejects marks above the maximum with a fixable message', () => {
    expect(() => applySubmissionUpdates([], [{ studentId: 's1', studentName: 'Aarav', status: 'submitted', marks: 25 }], 20))
      .toThrow('Marks can\'t be more than 20 (Aarav has 25).');
  });

  it('rejects negative marks and unknown statuses', () => {
    expect(() => applySubmissionUpdates([], [{ studentId: 's1', marks: -1 }], 20)).toThrow(/0 or more/);
    expect(() => applySubmissionUpdates([], [{ studentId: 's1', status: 'lost' }], 20)).toThrow(/Unknown submission status/);
  });

  it('drops marks for unmarked work and keeps other rows', () => {
    const rows = applySubmissionUpdates(
      [{ studentId: 's2', studentName: 'Bela', status: 'late' }],
      [{ studentId: 's1', studentName: 'Aarav', status: 'submitted', marks: 10 }],
      null
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.studentId === 's1')).toMatchObject({ status: 'submitted', marks: null });
  });

  it('summarises counts and marks', () => {
    const summary = summarizeSubmissions([
      { status: 'submitted', marks: 18 },
      { status: 'late', marks: 11 },
      { status: 'missing', marks: null },
      { status: 'pending' }
    ], 20);
    expect(summary).toMatchObject({ total: 4, submitted: 1, late: 1, missing: 1, pending: 1, turnedIn: 2, marked: 2, average: 14.5, highest: 18, lowest: 11 });
  });
});

describe('ACDMC quizzes', () => {
  it('sums question marks', () => {
    expect(sumQuestionMarks([{ marks: 1 }, { marks: 2 }, { marks: 5 }])).toBe(8);
  });

  it('checks MCQ options and answers', () => {
    expect(() => validateQuestions([{ type: 'mcq', text: 'Q', options: ['a'] }])).toThrow('Question 1 needs at least two options.');
    expect(() => validateQuestions([{ type: 'mcq', text: 'Q', options: ['a', 'b'], answer: 'c' }])).toThrow('Question 1\'s answer must be one of its options.');
    expect(() => validateQuestions([{ type: 'short', text: '' }])).toThrow('Question 1 needs some text.');
    expect(() => validateQuestions([{ type: 'mcq', text: 'Q', options: ['a', 'b'], answer: 'b' }])).not.toThrow();
  });
});

describe('ACDMC dates', () => {
  it('returns the Monday–Sunday week', () => {
    expect(weekRange(new Date(2026, 9, 15))).toEqual({ from: '2026-10-12', to: '2026-10-18' });
    expect(weekRange(new Date(2026, 9, 18))).toEqual({ from: '2026-10-12', to: '2026-10-18' });
  });
});
