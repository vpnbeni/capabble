/**
 * Bulk expense endpoints (void expenses, remove fuel logs, pay/remove electricity bills),
 * exercised against small in-memory fakes of the tenant models.
 */
const mongoose = require('mongoose');
const { bulkVoidExpenses } = require('../../../controllers/cpitl/expenseController');
const { bulkRemoveLogs } = require('../../../controllers/cpitl/fuelController');
const { bulkPayBills, bulkRemoveBills } = require('../../../controllers/cpitl/facilityController');

const oid = () => new mongoose.Types.ObjectId().toString();

/** A query result usable both as `await Model.findById(id)` and `.select().lean()`. */
const query = (value) => {
  const q = {
    select: () => q,
    lean: () => Promise.resolve(value ? { ...value } : null),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject)
  };
  return q;
};

const makeDoc = (data, store) => {
  const doc = { ...data };
  Object.defineProperty(doc, 'set', { value: (patch) => Object.assign(doc, patch) });
  Object.defineProperty(doc, 'save', {
    value: async () => {
      store.set(String(doc._id), doc);
      return doc;
    }
  });
  return doc;
};

const fakeModel = (rows = []) => {
  const store = new Map();
  rows.forEach((r) => store.set(String(r._id), makeDoc(r, store)));
  const matches = (doc, filter) => Object.entries(filter).every(([key, cond]) => {
    if (key === '_id') return String(doc._id) === String(cond);
    if (key === 'sourceRef.id') return String(doc.sourceRef?.id) === String(cond);
    if (cond && typeof cond === 'object' && '$ne' in cond) return doc[key] !== cond.$ne;
    return doc[key] === cond;
  });
  return {
    store,
    findById: (id) => query(store.get(String(id)) || null),
    findOne: (filter) => query([...store.values()].find((d) => matches(d, filter)) || null),
    findOneAndUpdate: async (filter, update) => {
      const doc = [...store.values()].find((d) => matches(d, filter));
      if (!doc) return null;
      Object.assign(doc, update.$set || update);
      return doc;
    },
    updateMany: async (filter, update) => {
      [...store.values()].filter((d) => matches(d, filter)).forEach((d) => Object.assign(d, update.$set));
      return {};
    },
    create: async (data) => {
      const doc = makeDoc({ _id: oid(), ...data }, store);
      store.set(String(doc._id), doc);
      return doc;
    }
  };
};

/** Calls an asyncHandler-wrapped handler and resolves with { status, body } or the error. */
const call = (handler, req) => new Promise((resolve) => {
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      resolve({ status: this.statusCode, body });
      return this;
    }
  };
  handler({ user: { _id: 'u1', name: 'Tester' }, academicSession: '2026-2027', ...req }, res, (error) => resolve({ error }));
});

describe('CPITL bulkVoidExpenses', () => {
  it('voids editable expenses and skips void, managed and missing ones with reasons', async () => {
    const [a, b, c, d] = [oid(), oid(), oid(), oid()];
    const CapitalExpense = fakeModel([
      { _id: a, title: 'Chalk', status: 'valid', kind: 'operating' },
      { _id: b, title: 'Old', status: 'void', kind: 'operating' },
      { _id: c, title: 'Fuel — Bus 1', status: 'valid', kind: 'fuel', sourceRef: { model: 'FuelLog', id: oid() } }
    ]);
    const out = await call(bulkVoidExpenses, { models: { CapitalExpense }, body: { ids: [a, b, c, d], reason: 'Duplicate' } });
    expect(out.status).toBe(200);
    expect(out.body.data.succeeded).toBe(1);
    expect(out.body.data.done).toEqual([{ id: a, label: 'Chalk' }]);
    expect(out.body.data.failed).toEqual([
      { id: b, label: 'Old', error: 'This expense is void.' },
      { id: c, label: 'Fuel — Bus 1', error: 'This expense is managed from the fuel page.' },
      { id: d, label: undefined, error: 'Expense not found.' }
    ]);
    expect(CapitalExpense.store.get(a)).toMatchObject({ status: 'void', voidReason: 'Duplicate' });
  });

  it('requires a reason and valid ids before touching anything', async () => {
    const CapitalExpense = fakeModel([]);
    expect((await call(bulkVoidExpenses, { models: { CapitalExpense }, body: { ids: [oid()], reason: ' ' } })).error.message).toMatch(/reason/);
    expect((await call(bulkVoidExpenses, { models: { CapitalExpense }, body: { ids: [], reason: 'x' } })).error.message).toMatch(/at least one id/);
  });

  it('answers 422 when every record was skipped', async () => {
    const CapitalExpense = fakeModel([]);
    const out = await call(bulkVoidExpenses, { models: { CapitalExpense }, body: { ids: [oid()], reason: 'x' } });
    expect(out.status).toBe(422);
    expect(out.body.success).toBe(false);
  });
});

describe('CPITL bulkRemoveLogs', () => {
  it('removes active logs, voids their ledger rows and skips removed ones', async () => {
    const [a, b] = [oid(), oid()];
    const FuelLog = fakeModel([
      { _id: a, isActive: true, date: new Date('2026-07-10T06:00:00Z'), vehicleSnapshot: { busNo: '4', registrationNumber: 'HR26AB1234' } },
      { _id: b, isActive: false, date: new Date('2026-07-11T06:00:00Z'), vehicleSnapshot: { registrationNumber: 'HR26CD5678' } }
    ]);
    const CapitalExpense = fakeModel([{ _id: oid(), status: 'valid', sourceRef: { model: 'FuelLog', id: a } }]);
    const out = await call(bulkRemoveLogs, { models: { FuelLog, CapitalExpense }, body: { ids: [a, b], reason: 'Wrong vehicle' } });
    expect(out.body.data.succeeded).toBe(1);
    expect(out.body.data.done[0].label).toBe('Bus 4 · HR26AB1234 · 10 Jul 2026');
    expect(out.body.data.failed).toEqual([{ id: b, label: 'HR26CD5678 · 11 Jul 2026', error: 'This fuel entry is already removed.' }]);
    expect(FuelLog.store.get(a).isActive).toBe(false);
    expect([...CapitalExpense.store.values()][0]).toMatchObject({ status: 'void', voidReason: 'Wrong vehicle' });
  });
});

describe('CPITL bulk electricity bills', () => {
  const setup = () => {
    const [unpaid, paid, removed] = [oid(), oid(), oid()];
    const snap = { name: 'Main Block' };
    const ElectricityBill = fakeModel([
      { _id: unpaid, isActive: true, status: 'unpaid', billMonth: '2026-08', amount: 5000, connectionSnapshot: snap, reference: '' },
      { _id: paid, isActive: true, status: 'paid', billMonth: '2026-07', amount: 4000, connectionSnapshot: snap },
      { _id: removed, isActive: false, status: 'unpaid', billMonth: '2026-06', amount: 3000, connectionSnapshot: snap }
    ]);
    const CapitalExpense = fakeModel([]);
    return { ids: { unpaid, paid, removed }, ElectricityBill, CapitalExpense };
  };

  it('pays unpaid bills into the ledger and skips paid or removed ones', async () => {
    const { ids, ElectricityBill, CapitalExpense } = setup();
    const out = await call(bulkPayBills, {
      models: { ElectricityBill, CapitalExpense },
      body: { ids: [ids.unpaid, ids.paid, ids.removed], date: '2026-09-01', mode: 'upi', reference: 'UTR1' }
    });
    expect(out.body.data.succeeded).toBe(1);
    expect(out.body.data.failed.map((f) => f.error)).toEqual(['This bill is already paid.', 'This bill was removed.']);
    expect(ElectricityBill.store.get(ids.unpaid)).toMatchObject({ status: 'paid', mode: 'upi', reference: 'UTR1' });
    const ledger = [...CapitalExpense.store.values()];
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ kind: 'electricity', amount: 5000, mode: 'upi', title: 'Electricity — Main Block (2026-08)' });
  });

  it('validates date and mode once before paying anything', async () => {
    const { ids, ElectricityBill, CapitalExpense } = setup();
    const models = { ElectricityBill, CapitalExpense };
    expect((await call(bulkPayBills, { models, body: { ids: [ids.unpaid], mode: 'upi' } })).error.message).toMatch(/date/);
    expect((await call(bulkPayBills, { models, body: { ids: [ids.unpaid], date: '2026-09-01', mode: 'barter' } })).error.message).toMatch(/mode/);
    expect(ElectricityBill.store.get(ids.unpaid).status).toBe('unpaid');
  });

  it('removes bills and voids their ledger rows', async () => {
    const { ids, ElectricityBill } = setup();
    const CapitalExpense = fakeModel([{ _id: oid(), status: 'valid', sourceRef: { model: 'ElectricityBill', id: ids.paid } }]);
    const out = await call(bulkRemoveBills, { models: { ElectricityBill, CapitalExpense }, body: { ids: [ids.paid, ids.removed], reason: 'Duplicate' } });
    expect(out.body.data.succeeded).toBe(1);
    expect(out.body.data.failed).toEqual([{ id: ids.removed, label: 'Main Block · 2026-06', error: 'This bill is already removed.' }]);
    expect(ElectricityBill.store.get(ids.paid).isActive).toBe(false);
    expect([...CapitalExpense.store.values()][0]).toMatchObject({ status: 'void', voidReason: 'Duplicate' });
  });
});
