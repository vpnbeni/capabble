/* Controller-level checks for bulk salary revision and selected payslips, on in-memory models. */
jest.mock('../../../utils/pdfGenerator', () => ({ generatePDF: jest.fn(async (_tpl, data) => Buffer.from(JSON.stringify(data))) }));

const pdfGenerator = require('../../../utils/pdfGenerator');
const payroll = require('../../../controllers/cpitl/payrollController');

const T1 = '64b000000000000000000001';
const T2 = '64b000000000000000000002';
const T3 = '64b000000000000000000003';

const query = (rows) => {
  const q = { select: () => q, sort: () => q, lean: async () => rows };
  return q;
};

const makeModels = () => {
  const teachers = [
    { _id: T1, name: 'Asha', employeeId: 'E1' },
    { _id: T2, name: 'Bala', employeeId: 'E2' },
    { _id: T3, name: 'Chitra', employeeId: '' },
  ];
  const catalog = [
    { _id: 'c1', code: 'BASIC', name: 'Basic', type: 'earning', calc: 'fixed' },
    { _id: 'c2', code: 'HRA', name: 'HRA', type: 'earning', calc: 'percent_of_basic' },
    { _id: 'c3', code: 'LOAN', name: 'Loan', type: 'deduction', calc: 'fixed' },
  ];
  const line = (code, value) => {
    const c = catalog.find((x) => x.code === code);
    return { componentId: c._id, code, name: c.name, type: c.type, calc: c.calc, value };
  };
  const structures = [{
    staffKey: 'emp:E1',
    components: [line('BASIC', 20000), line('HRA', 40), line('LOAN', 500)],
    options: { pf: true, pfWageCap: true, esi: 'auto', tdsMonthly: 0 },
    gross: 28000,
    revisions: [{ toGross: 28000 }],
  }];
  const saved = [];
  const StaffSalaryStructure = {
    find: (q) => query(structures.filter((s) => q.staffKey.$in.includes(s.staffKey))),
    findOne: async ({ staffKey }) => {
      const s = structures.find((x) => x.staffKey === staffKey);
      if (!s) return null;
      const doc = {
        ...s,
        revisions: [...s.revisions],
        set(patch) { Object.assign(this, patch); },
        async save() { saved.push(this); },
      };
      return doc;
    },
  };
  const models = {
    Teacher: { find: (q) => query(teachers.filter((t) => q._id.$in.includes(t._id))) },
    StaffSalaryStructure,
    SalaryComponent: { find: () => query(catalog) },
    CapitalSettings: { findOne: async () => ({ payroll: {} }) },
  };
  return { models, saved };
};

// asyncHandler does not return its promise, so wait for the response (or next(error)).
const call = (handler, req) => new Promise((resolve) => {
  const res = {
    statusCode: 200,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; resolve({ res: this }); return this; },
    setHeader(k, v) { this.headers[k] = v; },
    send(body) { this.body = body; resolve({ res: this }); return this; },
  };
  handler(req, res, (error) => resolve({ res, error }));
});

describe('bulkReviseSalaries', () => {
  const body = { teacherIds: [T1, T2], mode: 'percent', value: 10, effectiveFrom: '2026-11-01' };

  it('previews before/after without saving, and skips staff with no salary', async () => {
    const { models, saved } = makeModels();
    const { res, error } = await call(payroll.bulkReviseSalaries, { models, body: { ...body, preview: true } });
    expect(error).toBeUndefined();
    expect(res.statusCode).toBe(200);
    const data = res.body.data;
    expect(data.preview).toBe(true);
    expect(data.succeeded).toBe(1);
    expect(data.failed).toEqual([{ id: T2, label: 'Bala', error: 'No salary set.' }]);
    expect(data.rows[0]).toMatchObject({ teacherId: T1, name: 'Asha', beforeGross: 28000, afterGross: 30800 });
    expect(data.rows[0].afterNet).toBeGreaterThan(data.rows[0].beforeNet);
    expect(data.rows[1]).toMatchObject({ teacherId: T2, error: 'No salary set.' });
    expect(saved).toHaveLength(0);
  });

  it('saves a revision through the normal save path, keeping deductions and history', async () => {
    const { models, saved } = makeModels();
    const { res } = await call(payroll.bulkReviseSalaries, { models, body, user: { name: 'Admin' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.preview).toBe(false);
    expect(saved).toHaveLength(1);
    const doc = saved[0];
    expect(doc.gross).toBe(30800);
    expect(doc.components.find((c) => c.code === 'BASIC').value).toBe(22000);
    expect(doc.components.find((c) => c.code === 'HRA').value).toBe(40);
    expect(doc.components.find((c) => c.code === 'LOAN').value).toBe(500);
    expect(doc.effectiveFrom.toISOString().slice(0, 10)).toBe('2026-11-01');
    expect(doc.revisions[doc.revisions.length - 1]).toMatchObject({ fromGross: 28000, toGross: 30800, note: 'Revised +10%' });
  });

  it('answers 422 when every record is skipped', async () => {
    const { models } = makeModels();
    const { res } = await call(payroll.bulkReviseSalaries, { models, body: { ...body, teacherIds: [T2, T3] } });
    expect(res.statusCode).toBe(422);
    expect(res.body.data.failed).toHaveLength(2);
  });

  it.each([
    [{ value: 0 }, 'other than zero'],
    [{ value: 101 }, 'between'],
    [{ value: -51 }, 'between'],
    [{ mode: 'amount', value: 1000001 }, '10,00,000'],
    [{ value: 'abc' }, 'other than zero'],
    [{ effectiveFrom: '2026-02-30' }, 'date'],
    [{ effectiveFrom: '' }, 'date'],
    [{ mode: 'bonus' }, 'percent'],
    [{ teacherIds: [] }, 'teacherIds'],
  ])('rejects %j', async (patch, message) => {
    const { models, saved } = makeModels();
    const { error } = await call(payroll.bulkReviseSalaries, { models, body: { ...body, ...patch } });
    expect(error?.statusCode).toBe(400);
    expect(error.message).toContain(message);
    expect(saved).toHaveLength(0);
  });
});

describe('payslipsPdf', () => {
  const slip = (teacherId, staffKey, name) => ({
    teacherId,
    staffKey,
    earnings: [{ name: 'Basic', amount: 1000 }],
    deductions: [],
    gross: 1000,
    totalDeductions: 0,
    net: 1000,
    toObject: () => ({ snapshot: { name } }),
  });
  const runModels = () => ({
    PayrollRun: {
      findOne: async () => ({
        month: '2026-10',
        status: 'draft',
        daysInMonth: 31,
        payslips: [slip(T1, 'emp:E1', 'Asha'), slip(T2, 'emp:E2', 'Bala'), slip(T3, `t:${T3}`, 'Chitra')],
      }),
    },
  });
  const names = () => pdfGenerator.generatePDF.mock.calls.at(-1)[1].slips.map((s) => s.name);

  it('GET still prints every payslip, or one by staffKey', async () => {
    await call(payroll.payslipsPdf, { method: 'GET', models: runModels(), params: { month: '2026-10' }, query: {} });
    expect(names()).toEqual(['Asha', 'Bala', 'Chitra']);
    await call(payroll.payslipsPdf, { method: 'GET', models: runModels(), params: { month: '2026-10' }, query: { staffKey: 'emp:E2' } });
    expect(names()).toEqual(['Bala']);
  });

  it('POST prints only the selected staff', async () => {
    const { res } = await call(payroll.payslipsPdf, { method: 'POST', models: runModels(), params: { month: '2026-10' }, query: {}, body: { teacherIds: [T3, T1] } });
    expect(res.statusCode).toBe(200);
    expect(names()).toEqual(['Asha', 'Chitra']);
  });

  it('POST needs teacherIds', async () => {
    const { error } = await call(payroll.payslipsPdf, { method: 'POST', models: runModels(), params: { month: '2026-10' }, query: {}, body: {} });
    expect(error?.statusCode).toBe(400);
  });
});
