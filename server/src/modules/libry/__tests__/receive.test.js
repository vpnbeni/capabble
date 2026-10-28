const ctrl = require('../../../controllers/libryController');

/**
 * Receiving books against a purchase order: copies that name their order line count against that
 * line (the app sends it), so a delivery of the second book doesn't fill the first book's line.
 */
const fakeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const setup = () => {
  const session = { withTransaction: jest.fn(async (work) => work()), endSession: jest.fn(async () => undefined) };
  const db = { startSession: jest.fn(async () => session) };
  const order = {
    _id: 'po1',
    number: 'LIB-1',
    supplierId: 'sup1',
    status: 'ordered',
    lines: [
      { _id: 'line1', title: 'Wings of Fire', quantity: 2, receivedQuantity: 0 },
      { _id: 'line2', title: 'Godan', quantity: 1, receivedQuantity: 0 },
    ],
    save: jest.fn(async () => undefined),
  };
  let n = 0;
  const models = {
    LibraryCopy: { db, create: jest.fn(async ([doc]) => [{ _id: `copy${(n += 1)}`, ...doc }]) },
    LibraryPurchaseOrder: { findOne: jest.fn(() => ({ session: async () => order })) },
    LibraryGoodsReceipt: { create: jest.fn(async ([doc]) => [doc]) },
    LibraryTitle: { exists: jest.fn(() => ({ session: async () => true })) },
  };
  return { models, order };
};

const titleId = '64b000000000000000000001';

describe('LIBRY receiving a purchase order', () => {
  test('copies naming a line count against that line', async () => {
    const { models, order } = setup();
    const res = fakeRes();
    await ctrl.receivePurchaseOrder({ models, params: { id: 'po1' }, user: { name: 'Librarian' }, body: { copies: [{ titleId, accessionNumber: 'A1', lineId: 'line2' }] } }, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(order.lines.map((line) => line.receivedQuantity)).toEqual([0, 1]);
    expect(order.status).toBe('partially_received');
  });

  test('more copies of a line than ordered are refused', async () => {
    const { models } = setup();
    const res = fakeRes();
    await ctrl.receivePurchaseOrder(
      { models, params: { id: 'po1' }, user: { name: 'Librarian' }, body: { copies: [{ titleId, accessionNumber: 'A1', lineId: 'line2' }, { titleId, accessionNumber: 'A2', lineId: 'line2' }] } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('copies without a line still fill the lines in order', async () => {
    const { models, order } = setup();
    const res = fakeRes();
    await ctrl.receivePurchaseOrder({ models, params: { id: 'po1' }, user: { name: 'Librarian' }, body: { copies: [{ titleId, accessionNumber: 'A1' }] } }, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(order.lines.map((line) => line.receivedQuantity)).toEqual([1, 0]);
  });
});
