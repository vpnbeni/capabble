const { xssClean, clean } = require('../xssClean');

describe('xssClean', () => {
  it('escapes < in nested strings, arrays and keys', () => {
    expect(clean({
      name: '<script>alert(1)</script>',
      tags: ['a<b', 'ok'],
      nested: { '<k>': 'x > y' },
      count: 3,
      active: true,
      empty: null
    })).toEqual({
      name: '&lt;script>alert(1)&lt;/script>',
      tags: ['a&lt;b', 'ok'],
      nested: { '&lt;k>': 'x > y' },
      count: 3,
      active: true,
      empty: null
    });
  });

  it('escapes and trims a plain string body', () => {
    expect(clean('  <b>hi</b> ')).toBe('&lt;b>hi&lt;/b>');
  });

  it('cleans body, query and params on the request', () => {
    const req = { body: { a: '<i>' }, query: { q: '<x' }, params: { id: '<1' } };
    const next = jest.fn();
    xssClean()(req, {}, next);
    expect(req).toEqual({ body: { a: '&lt;i>' }, query: { q: '&lt;x' }, params: { id: '&lt;1' } });
    expect(next).toHaveBeenCalled();
  });
});
