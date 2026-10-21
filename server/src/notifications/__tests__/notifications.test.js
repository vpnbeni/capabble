const { PermissionSet } = require('../../rbac/permissions');
const { routeAccessGate } = require('../../rbac/middleware');
const { AUDIENCE } = require('../../rbac/session');
const { build, insertRows } = require('../send');
const templates = require('../templates');
const ctrl = require('../../controllers/notificationController');

// Minimal stand-in for a Mongoose query: chainable and awaitable.
const query = (result) => {
  const q = {};
  ['select', 'sort', 'skip', 'limit', 'lean'].forEach((name) => { q[name] = () => q; });
  q.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return q;
};

const createRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const staff = { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', kind: 'staff', name: 'Asha Rao', roles: ['class_teacher'] };
const parent = { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', kind: 'parent', name: 'Vikram Shah', linkedStudents: [{ rollNumber: 'A101' }, { rollNumber: 'A102' }] };
const student = { _id: 'cccccccccccccccccccccccc', kind: 'student', name: 'Riya Shah', linkedStudents: [{ rollNumber: 'A101' }] };
const context = { schoolName: 'Green Valley School' };

describe('notification copy and audience', () => {
  it('welcomes staff with their roles and families with what they can open', () => {
    const data = { roles: ['class_teacher'], sections: ['attendance', 'fees'], studentsByRoll: { A101: 'Riya Shah' } };
    const forStaff = build(templates['user.welcome'], 'user.welcome', data, staff, context);
    expect(forStaff.title).toBe('Welcome to Green Valley School, Asha');
    expect(forStaff.body).toMatch(/Class teacher/);
    expect(forStaff.link).toBe('/dashboard');

    const forParent = build(templates['user.welcome'], 'user.welcome', data, parent, context);
    expect(forParent.body).toBe("You can now see Riya's attendance and fees and receipts here.");
    expect(forParent.link).toBe('/portal');
    expect(forParent.dedupeKey).toBe(`user.welcome:${parent._id}`);
  });

  it('says which roles were added and removed', () => {
    const row = build(templates['user.roles_changed'], 'user.roles_changed', { added: ['exam_coordinator'], removed: ['class_teacher'], by: 'Principal' }, staff, context);
    expect(row.body).toMatch(/You now have Exam coordinator\. You no longer have Class teacher\. Changed by Principal\./);
    expect(build(templates['user.roles_changed'], 'user.roles_changed', { added: [], removed: [] }, staff, context)).toBeNull();
  });

  it('keeps staff-only and family-only notices with their audience', () => {
    expect(build(templates['payroll.salary_paid'], 'payroll.salary_paid', { month: '2026-10', monthLabel: 'October 2026', net: 1000 }, parent, context)).toBeNull();
    expect(build(templates['attendance.absent'], 'attendance.absent', { studentId: 's1', date: '2026-10-21' }, staff, context)).toBeNull();
  });

  it('only sends families what their portal can open', () => {
    const data = { paymentId: 'p1', receiptNo: 'R-12', amount: 4500, studentsByRoll: { A101: 'Riya Shah' } };
    // Student logins have no Fees section.
    expect(build(templates['fees.payment_recorded'], 'fees.payment_recorded', data, student, context)).toBeNull();
    const row = build(templates['fees.payment_recorded'], 'fees.payment_recorded', data, parent, context);
    expect(row.title).toBe('Fee received: ₹4,500');
    expect(row.body).toMatch(/for Riya/);
    expect(row.link).toBe('/portal/fees');
  });

  it("names only the parent's own children", () => {
    const row = build(templates['attendance.absent'], 'attendance.absent', { studentId: 's1', date: '2026-10-21', studentsByRoll: { A102: 'Kabir Shah', Z9: 'Someone Else' } }, parent, context);
    expect(row.title).toBe('Kabir marked absent');
    expect(row.tone).toBe('danger');
  });
});

describe('notification storage', () => {
  it('ignores rows that were already stored', async () => {
    const duplicate = Object.assign(new Error('dup'), { writeErrors: [{ code: 11000 }], insertedDocs: [{}] });
    const Notification = { insertMany: jest.fn().mockRejectedValue(duplicate) };
    await expect(insertRows(Notification, [{}, {}])).resolves.toBe(1);
  });

  it('still reports other write failures', async () => {
    const Notification = { insertMany: jest.fn().mockRejectedValue(new Error('down')) };
    await expect(insertRows(Notification, [{}])).rejects.toThrow('down');
  });
});

describe('notification inbox', () => {
  it('only ever reads the signed-in person\'s notifications', async () => {
    const find = jest.fn(() => query([]));
    const countDocuments = jest.fn(async () => 0);
    const req = { user: { _id: parent._id }, query: { unread: '1', module: 'cpitl' }, models: { Notification: { find, countDocuments } } };
    const res = createRes();
    await ctrl.listNotifications(req, res, jest.fn());
    expect(find).toHaveBeenCalledWith({ recipient: parent._id, readAt: null, module: 'cpitl' });
    expect(countDocuments).toHaveBeenCalledWith({ recipient: parent._id, readAt: null });
  });

  it("can't mark someone else's notification read", async () => {
    const updateOne = jest.fn(async () => ({ matchedCount: 0 }));
    const exists = jest.fn(async () => null);
    const req = { user: { _id: parent._id }, params: { id: 'dddddddddddddddddddddddd' }, models: { Notification: { updateOne, exists } } };
    const res = createRes();
    ctrl.markRead(req, res, jest.fn());
    await new Promise((resolve) => { setImmediate(resolve); });
    expect(updateOne.mock.calls[0][0]).toMatchObject({ recipient: parent._id, _id: 'dddddddddddddddddddddddd' });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('opens /notifications to any staff member and keeps family logins on /portal', () => {
    const gate = (audience, kind) => {
      const next = jest.fn();
      const res = createRes();
      routeAccessGate({ method: 'GET', path: '/notifications/unread-count', user: { _id: 'u1', kind }, auth: { audience }, rbac: new PermissionSet([]) }, res, next);
      return next.mock.calls.length === 1;
    };
    expect(gate(AUDIENCE.STAFF, 'staff')).toBe(true);
    expect(gate(AUDIENCE.PORTAL, 'parent')).toBe(false);
  });
});
