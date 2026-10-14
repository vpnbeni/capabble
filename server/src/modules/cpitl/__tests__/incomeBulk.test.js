jest.mock('../../../utils/pdfGenerator', () => ({ generatePDF: jest.fn(async () => Buffer.from('%PDF')) }));
jest.mock('../feeService', () => {
  const actual = jest.requireActual('../feeService');
  return {
    ...actual,
    cancelPayment: jest.fn(),
    recomputeAccountTotals: jest.fn(async () => ({})),
    recordRevision: jest.fn(async () => null),
  };
});

const mongoose = require('mongoose');
const feeService = require('../feeService');
const collection = require('../../../controllers/cpitl/collectionController');
const fee = require('../../../controllers/cpitl/feeController');

const oid = () => new mongoose.Types.ObjectId().toString();

/** Calls an asyncHandler-wrapped controller and resolves with { status, body } or the error. */
const call = (handler, req) => new Promise((resolve) => {
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { resolve({ status: this.statusCode, body }); return this; },
  };
  handler({ user: { _id: 'u1', name: 'Admin' }, ...req }, res, (error) => resolve({ error }));
});

const modelOf = (docs) => ({
  findById: jest.fn(async (id) => docs.find((d) => String(d._id) === String(id)) || null),
  countDocuments: jest.fn(async () => 0),
});

describe('bulkCancelPayments', () => {
  beforeEach(() => feeService.cancelPayment.mockReset());

  it('requires a reason', async () => {
    const { error } = await call(collection.bulkCancelPayments, { models: { FeePayment: modelOf([]) }, body: { ids: [oid()], reason: '  ' } });
    expect(error.statusCode).toBe(400);
    expect(feeService.cancelPayment).not.toHaveBeenCalled();
  });

  it('cancels each receipt via cancelPayment and skips failures with the receipt number', async () => {
    const a = { _id: oid(), receiptNo: 'R/1' };
    const b = { _id: oid(), receiptNo: 'R/2' };
    const missing = oid();
    feeService.cancelPayment.mockImplementation(async (models, payment) => {
      if (payment.receiptNo === 'R/2') throw feeService.httpError('Receipt is already cancelled.');
    });
    const { status, body } = await call(collection.bulkCancelPayments, {
      models: { FeePayment: modelOf([a, b]) },
      body: { ids: [a._id, b._id, missing], reason: 'Duplicate entry' },
    });
    expect(status).toBe(200);
    expect(feeService.cancelPayment).toHaveBeenCalledTimes(2);
    expect(feeService.cancelPayment.mock.calls[0][2]).toBe('Duplicate entry');
    expect(body.data.succeeded).toBe(1);
    expect(body.data.failed).toEqual([
      { id: b._id, label: 'R/2', error: 'Receipt is already cancelled.' },
      { id: missing, label: undefined, error: 'Receipt not found.' },
    ]);
  });
});

describe('bulkWaiveDemands', () => {
  beforeEach(() => feeService.recomputeAccountTotals.mockClear());

  const demand = (over) => ({ _id: oid(), label: 'Q1', paid: 0, status: 'due', accountId: 'acc1', save: jest.fn(async () => null), ...over });

  it('waives unpaid installments, skips paid ones and recomputes each account once', async () => {
    const d1 = demand({ label: 'Apr' });
    const d2 = demand({ label: 'Jul' });
    const paid = demand({ label: 'Oct', paid: 100, status: 'partial' });
    const other = demand({ label: 'Jan', accountId: 'acc2' });
    const { status, body } = await call(collection.bulkWaiveDemands, {
      models: { FeeDemand: modelOf([d1, d2, paid, other]) },
      body: { ids: [d1._id, d2._id, paid._id, other._id], waive: true },
    });
    expect(status).toBe(200);
    expect([d1.status, d2.status, other.status]).toEqual(['waived', 'waived', 'waived']);
    expect(paid.status).toBe('partial');
    expect(paid.save).not.toHaveBeenCalled();
    expect(body.data.failed).toEqual([{ id: paid._id, label: 'Oct', error: 'Installments with payments cannot be waived.' }]);
    expect(feeService.recomputeAccountTotals.mock.calls.map((c) => c[1]).sort()).toEqual(['acc1', 'acc2']);
  });

  it('restores only waived installments and answers 422 when nothing changed', async () => {
    const due = demand({ label: 'Apr' });
    const { status, body } = await call(collection.bulkWaiveDemands, {
      models: { FeeDemand: modelOf([due]) },
      body: { ids: [due._id], waive: false },
    });
    expect(status).toBe(422);
    expect(body.data.failed[0].error).toBe('Installment is not waived.');
    expect(feeService.recomputeAccountTotals).not.toHaveBeenCalled();
  });
});

describe('bulk archive / restore structures', () => {
  const structure = (over) => ({
    _id: oid(), name: 'Primary', status: 'active', components: [],
    save: jest.fn(async () => null), toObject() { return { components: [] }; }, ...over,
  });

  it('archives active structures and skips already archived ones', async () => {
    const s1 = structure({ name: 'Primary' });
    const s2 = structure({ name: 'Senior', status: 'archived' });
    const { body } = await call(fee.bulkArchiveStructures, {
      models: { FeeStructure: modelOf([s1, s2]), StudentFeeAccount: modelOf([]) },
      body: { ids: [s1._id, s2._id] },
    });
    expect(s1.status).toBe('archived');
    expect(body.data.done).toEqual([{ id: s1._id, label: 'Primary' }]);
    expect(body.data.failed).toEqual([{ id: s2._id, label: 'Senior', error: 'Structure is already archived.' }]);
  });

  it('restores to active when students are assigned, otherwise draft', async () => {
    const s1 = structure({ status: 'archived' });
    const s2 = structure({ status: 'archived' });
    const accounts = modelOf([]);
    accounts.countDocuments.mockImplementation(async ({ structureId }) => (structureId === s1._id ? 3 : 0));
    const { body } = await call(fee.bulkRestoreStructures, {
      models: { FeeStructure: modelOf([s1, s2]), StudentFeeAccount: accounts },
      body: { ids: [s1._id, s2._id] },
    });
    expect(body.data.succeeded).toBe(2);
    expect([s1.status, s2.status]).toEqual(['active', 'draft']);
  });

  it('rejects an empty id list', async () => {
    const { error } = await call(fee.bulkArchiveStructures, { models: { FeeStructure: modelOf([]) }, body: { ids: [] } });
    expect(error.statusCode).toBe(400);
  });
});
