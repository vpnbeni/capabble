const ctrl = require('../../../controllers/libryController');

/**
 * Mongoose's connection.startSession() returns a promise. The circulation desk's transactions
 * must await it, or issuing and returning books fails with "session.withTransaction is not a function".
 */
const fakeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const sessionModels = () => {
  const session = {
    withTransaction: jest.fn(async (work) => work()),
    endSession: jest.fn(async () => undefined)
  };
  const db = { startSession: jest.fn(async () => session) };
  const chain = (value) => ({ session: () => Promise.resolve(value) });
  const Loan = {
    db,
    findOneAndUpdate: jest.fn(async () => ({ _id: 'loan1', copyId: 'copy1', status: 'returned' })),
    countDocuments: jest.fn(() => chain(0)),
    create: jest.fn(async ([doc]) => [{ _id: 'loan2', ...doc }])
  };
  const models = {
    LibraryCopy: {
      db,
      findByIdAndUpdate: jest.fn(async () => ({})),
      findOneAndUpdate: jest.fn(async () => ({ _id: 'copy1', status: 'issued' }))
    },
    LibraryLoan: Loan,
    LibraryMember: {
      findOne: jest.fn(() => chain({ _id: 'member1', memberType: 'student', status: 'active', isActive: true }))
    },
    LibraryPolicy: {
      findOne: jest.fn(() => chain({ memberType: 'student', isActive: true, maxActiveLoans: 2, loanDays: 7 }))
    }
  };
  return { models, session, db };
};

describe('LIBRY circulation transactions', () => {
  test('returning a loan awaits the session before using it', async () => {
    const { models, session } = sessionModels();
    const res = fakeRes();
    await ctrl.returnLoan({ models, params: { id: 'loan1' }, user: { name: 'Desk' } }, res);
    expect(session.withTransaction).toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
