jest.mock('../../../tenancy/platformModels', () => ({ getPlatformModels: jest.fn() }));
jest.mock('../../../notifications/send', () => ({ send: jest.fn(), modelsFor: jest.fn() }));
jest.mock('../delivery', () => ({
  ...jest.requireActual('../delivery'),
  logRun: jest.fn(async () => 'run1'),
  runLogged: jest.fn(async () => ({ notified: 0 }))
}));

const { getPlatformModels } = require('../../../tenancy/platformModels');
const { modelsFor } = require('../../../notifications/send');
const { runLogged } = require('../delivery');
const { publishOnce } = require('../jobs');

// Minimal stand-in for a Mongoose query: chainable and awaitable.
const query = (result) => {
  const q = {};
  ['select', 'sort', 'lean'].forEach((name) => { q[name] = () => q; });
  q.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return q;
};

const schools = (list) => getPlatformModels.mockReturnValue({ Tenant: { find: () => query(list) } });

beforeEach(() => {
  modelsFor.mockReset();
  runLogged.mockClear();
});

describe('publishing scheduled events', () => {
  const now = new Date('2026-10-23T01:55:00Z');

  it('publishes events whose time has come, once each, in schools with the calendar on', async () => {
    schools([
      { _id: 't1', slug: 'red', dbName: 'db_red', featureToggles: {} },
      { _id: 't2', slug: 'off', dbName: 'db_off', featureToggles: { clndr_calendar: false } }
    ]);
    const find = jest.fn(() => query([{ _id: 'e1' }, { _id: 'e2' }]));
    // e2 was claimed by another server first.
    const findOneAndUpdate = jest.fn(({ _id }) => query(_id === 'e1' ? { _id: 'e1', revision: 1 } : null));
    modelsFor.mockReturnValue({ CalendarEvent: { find, findOneAndUpdate } });

    expect(await publishOnce(now)).toEqual({ red: 1 });
    expect(find).toHaveBeenCalledWith({ status: 'scheduled', publishAt: { $lte: now } });
    expect(modelsFor).toHaveBeenCalledTimes(1);
    expect(runLogged).toHaveBeenCalledTimes(1);
    expect(runLogged).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'e1', opts: { change: 'published' } }));
  });

  it('keeps going when one school fails', async () => {
    schools([
      { _id: 't1', slug: 'broken', dbName: 'db_broken', featureToggles: {} },
      { _id: 't2', slug: 'red', dbName: 'db_red', featureToggles: {} }
    ]);
    modelsFor.mockImplementation((tenant) => {
      if (tenant.slug === 'broken') throw new Error('no connection');
      return { CalendarEvent: { find: () => query([]), findOneAndUpdate: jest.fn() } };
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(await publishOnce(now)).toEqual({ red: 0 });
    console.error.mockRestore();
  });
});
