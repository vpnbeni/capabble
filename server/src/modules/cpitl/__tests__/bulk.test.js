const mongoose = require('mongoose');
const { parseIds, runBulk, labelled, MAX_BULK } = require('../bulk');

const id = () => new mongoose.Types.ObjectId().toString();

describe('parseIds', () => {
  it('rejects an empty or missing list', () => {
    expect(() => parseIds()).toThrow(/at least one id/);
    expect(() => parseIds([])).toThrow(/at least one id/);
  });

  it('removes duplicates and blanks', () => {
    const a = id();
    expect(parseIds([a, a, ' ', a])).toEqual([a]);
  });

  it('rejects invalid ids and names them', () => {
    expect(() => parseIds([id(), 'not-an-id'])).toThrow(/not-an-id/);
  });

  it('caps the batch size', () => {
    const many = Array.from({ length: MAX_BULK + 1 }, id);
    expect(() => parseIds(many)).toThrow(/up to 200/);
  });

  it('uses the field name in the message', () => {
    expect(() => parseIds([], { field: 'teacherIds' })).toThrow(/teacherIds/);
  });
});

describe('runBulk', () => {
  it('processes in order and keeps going after a failure', async () => {
    const order = [];
    const [a, b, c] = [id(), id(), id()];
    const result = await runBulk([a, b, c], async (x) => {
      order.push(x);
      if (x === b) throw labelled(new Error('Already cancelled.'), 'R-2');
      return `label-${x}`;
    });
    expect(order).toEqual([a, b, c]);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toEqual([{ id: b, label: 'R-2', error: 'Already cancelled.' }]);
    expect(result.done.map((d) => d.id)).toEqual([a, c]);
  });

  it('never runs two records at the same time', async () => {
    let running = 0;
    let peak = 0;
    await runBulk([id(), id(), id()], async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running -= 1;
    });
    expect(peak).toBe(1);
  });
});
