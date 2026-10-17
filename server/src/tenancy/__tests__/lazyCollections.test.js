const mongoose = require('mongoose');
const { disableAutoCreate, ensureIndexes, applyLazyCollections } = require('../lazyCollections');

const fakeModel = () => ({ modelName: 'Fake', db: { name: 't' }, createIndexes: jest.fn(async () => undefined) });

describe('lazy school collections', () => {
  it('turns off automatic collection and index creation on the connection only', () => {
    const parent = mongoose.createConnection();
    const child = parent.useDb('school_test', { useCache: false });
    disableAutoCreate(child);
    expect(child.config).toMatchObject({ autoCreate: false, autoIndex: false });
    expect(parent.config.autoCreate).not.toBe(false);
    expect(parent.options?.autoCreate).toBeUndefined();
  });

  it('builds indexes once, then again after the recheck window', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-17T10:00:00Z') });
    const Model = fakeModel();
    await ensureIndexes(Model);
    await ensureIndexes(Model);
    expect(Model.createIndexes).toHaveBeenCalledTimes(1);
    jest.setSystemTime(new Date('2026-10-17T10:11:00Z'));
    await ensureIndexes(Model);
    expect(Model.createIndexes).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('retries on the next write when building indexes fails', async () => {
    const Model = fakeModel();
    Model.createIndexes.mockRejectedValueOnce(new Error('boom'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await ensureIndexes(Model);
    await ensureIndexes(Model);
    expect(Model.createIndexes).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('adds the first-write hooks to a schema once', () => {
    const schema = new mongoose.Schema({ name: String });
    applyLazyCollections(schema);
    applyLazyCollections(schema);
    const pres = schema.s.hooks._pres;
    expect(pres.get('save')).toHaveLength(1);
    expect(pres.get('bulkWrite')).toHaveLength(1);
    expect(pres.get('insertMany')).toHaveLength(1);
  });
});
