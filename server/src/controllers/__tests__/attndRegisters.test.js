const { getStudentRegisters } = require('../attndController');
const { PermissionSet } = require('../../rbac/permissions');

// Minimal stand-in for a Mongoose query: chainable and awaitable.
const query = (result) => {
  const q = {};
  ['select', 'sort', 'lean'].forEach((name) => { q[name] = () => q; });
  q.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return q;
};

const createRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// 19 Oct 2026, a Monday. Classes 7-A and 7-B (timetable matrix) and 8-A (students only, ignored).
const models = {
  TimetableState: {
    findOne: jest.fn(() => query({
      matrixClasses: [{ id: 'c7', name: '7' }],
      matrixSections: [{ id: 'sA', name: 'A' }, { id: 'sB', name: 'B' }],
      matrixSelection: { c7: { sA: true, sB: true } }
    }))
  },
  Student: {
    aggregate: jest.fn(async () => [
      { _id: { className: 'Class 7th', section: 'A' }, count: 30 },
      { _id: { className: '7', section: 'B' }, count: 28 }
    ])
  },
  StudentAttendanceDay: {
    find: jest.fn(() => query([{ className: '7', section: 'A', updatedAt: new Date('2026-10-19T03:00:00Z') }]))
  },
  StudentAttendanceDaily: {
    find: jest.fn(() => query([{ className: '7', section: 'A' }, { className: '7', section: 'A' }]))
  }
};

const run = async (grants, user = {}) => {
  const res = createRes();
  await getStudentRegisters({
    query: { date: '2026-10-19' },
    models,
    user: { assignedSections: [], ...user },
    rbac: new PermissionSet(grants)
  }, res);
  return res.json.mock.calls[0][0];
};

describe('GET /attnd/student-registers', () => {
  it('shows a whole-school login every register, marked or not, with counts', async () => {
    const body = await run([
      { key: 'attnd.students.read', scope: 'all' },
      { key: 'attnd.students.write', scope: 'all' }
    ]);
    expect(body.success).toBe(true);
    expect(body.data.day).toMatchObject({ working: true });
    expect(body.data.registers).toEqual([
      expect.objectContaining({
        className: '7', section: 'A', marked: true, absent: 2, students: 30, canMark: true, mine: false
      }),
      expect.objectContaining({ className: '7', section: 'B', marked: false, absent: 0, students: 28, canMark: true })
    ]);
  });

  it('shows a class teacher only their own section', async () => {
    const body = await run(
      [{ key: 'attnd.students.read', scope: 'assigned' }, { key: 'attnd.students.write', scope: 'assigned' }],
      { assignedSections: [{ className: '7', section: 'B' }] }
    );
    expect(body.data.registers).toEqual([expect.objectContaining({ section: 'B', mine: true, canMark: true })]);
  });

  it('does not offer marking to a login that can only read', async () => {
    const body = await run([{ key: 'attnd.students.read', scope: 'all' }]);
    expect(body.data.registers.every((register) => !register.canMark)).toBe(true);
  });
});
