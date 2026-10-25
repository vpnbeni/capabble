jest.mock('../../utils/pdfGenerator', () => ({ generatePDF: jest.fn(async () => Buffer.from('%PDF')) }));
jest.mock('puppeteer', () => ({ launch: jest.fn() }));

const { getHomework } = require('../portalController');
const { openSections } = require('../../rbac/portalSections');

// Minimal stand-in for a Mongoose query: chainable and awaitable.
const query = (result) => {
  const q = {};
  ['select', 'sort', 'limit', 'lean'].forEach((name) => { q[name] = () => q; });
  q.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return q;
};

const createRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const student = { _id: 'stu1', class: '7th', section: 'A' };
const rows = [
  {
    _id: 'hw1',
    title: 'Chapter 5, questions 1 to 5',
    subjectName: 'English',
    teacherName: 'Mrs. Anjali Sharma',
    assignedDate: '2026-10-25',
    dueDate: '2026-10-27',
    instructions: 'In the English notebook.',
    status: 'published',
    submissions: [
      { studentId: 'stu1', status: 'submitted', remark: 'Neat work' },
      { studentId: 'stu2', status: 'missing' }
    ]
  },
  { _id: 'hw2', title: 'Old placeholder', subject: 'Maths', date: '2026-10-20', status: 'closed', submissions: [] }
];

const run = async ({ toggles = {}, kind = 'parent', models } = {}) => {
  const find = jest.fn(() => query(rows));
  const res = createRes();
  const next = jest.fn();
  getHomework({
    user: { kind },
    tenant: { featureToggles: toggles },
    models: models === undefined ? { AcademicHomework: { find } } : models,
    portalStudent: student
  }, res, next);
  // asyncHandler doesn't return its promise: wait for the handler to answer (or fail).
  await new Promise((resolve) => { setImmediate(resolve); });
  if (next.mock.calls.length) throw next.mock.calls[0][0];
  return { res, find };
};

describe('GET /portal/students/:id/homework', () => {
  it('lists the class\'s published homework with the child\'s own mark', async () => {
    const { res, find } = await run();
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data[0]).toEqual({
      id: 'hw1',
      title: 'Chapter 5, questions 1 to 5',
      subjectName: 'English',
      teacherName: 'Mrs. Anjali Sharma',
      assignedDate: '2026-10-25',
      dueDate: '2026-10-27',
      instructions: 'In the English notebook.',
      status: 'published',
      submission: { status: 'submitted', remark: 'Neat work' }
    });
    // Older records keep their subject and date in the old fields.
    expect(body.data[1]).toMatchObject({ subjectName: 'Maths', dueDate: '2026-10-20', submission: null });

    const filter = find.mock.calls[0][0];
    const parts = Object.assign({}, ...filter.$and);
    expect(parts.status).toEqual({ $in: ['published', 'closed'] });
    expect(parts.className.test('7')).toBe(true);
    expect(parts.className.test('Class 7th')).toBe(true);
    expect(parts.className.test('8')).toBe(false);
    expect(parts.section.test('A')).toBe(true);
    expect(parts.section.test('B')).toBe(false);
  });

  it('is not available when Academics is off for the school', async () => {
    const { res } = await run({ toggles: { acdmc_academics: false } });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].errorCode).toBe('not_available');
  });

  it('is a section families see only while Academics is on', () => {
    const on = {
      user: { kind: 'parent' }, tenant: { featureToggles: {} }, models: { AcademicHomework: {}, Appointment: {} }
    };
    expect(openSections(on, 'parent')).toContain('homework');
    expect(openSections(on, 'student')).toContain('homework');
    const off = { ...on, tenant: { featureToggles: { acdmc_academics: false } } };
    expect(openSections(off, 'parent')).not.toContain('homework');
  });
});
