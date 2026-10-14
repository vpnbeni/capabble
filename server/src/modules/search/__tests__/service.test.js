const { escapeRegex } = require('../../../utils/escapeRegex');
const {
  parseSearchParams, buildFilter, buildSelect, scoreDoc, getActiveProviders, runSearch
} = require('../service');
const { PROVIDERS } = require('../providers');
const { normalizeTenantFeatureToggles } = require('../../../constants/tenantFeatures');

const provider = (type) => PROVIDERS.find((entry) => entry.type === type);

const fakeModel = (docs) => {
  const calls = {};
  const chain = {
    select: () => chain,
    sort: () => chain,
    limit: (n) => { calls.limit = n; return chain; },
    maxTimeMS: () => chain,
    lean: async () => docs
  };
  return { calls, find: (filter) => { calls.filter = filter; return chain; } };
};

describe('escapeRegex', () => {
  it('escapes regex metacharacters', () => {
    expect(escapeRegex('a.b*(c)')).toBe('a\\.b\\*\\(c\\)');
    expect(new RegExp(escapeRegex('1+1')).test('1+1')).toBe(true);
  });
});

describe('parseSearchParams', () => {
  it('ignores queries shorter than two characters', () => {
    expect(parseSearchParams({ q: ' a ' }).q).toBe('');
  });

  it('clamps limit and trims long queries', () => {
    expect(parseSearchParams({ q: 'ab', limit: '999' }).limit).toBe(10);
    expect(parseSearchParams({ q: 'ab', limit: '0' }).limit).toBe(1);
    expect(parseSearchParams({ q: 'ab' }).limit).toBe(5);
    expect(parseSearchParams({ q: 'x'.repeat(100) }).q).toHaveLength(64);
  });

  it('parses a type filter', () => {
    expect([...parseSearchParams({ q: 'ab', types: 'student, staff' }).types]).toEqual(['student', 'staff']);
  });
});

describe('buildFilter', () => {
  it('nests the $or inside $and and escapes input', () => {
    const filter = buildFilter(provider('student'), 'ra.j');
    expect(filter.$or).toBeUndefined();
    expect(filter.$and).toHaveLength(2);
    const clauses = filter.$and[1].$or;
    expect(clauses).toContainEqual({ rollNumber: { $regex: '^RA\\.J' } });
    expect(clauses).toContainEqual({ name: { $regex: 'ra\\.j', $options: 'i' } });
  });
});

describe('buildSelect', () => {
  it('adds searched fields without parent/child path collisions', () => {
    const fields = buildSelect(provider('receipt')).split(' ');
    expect(fields).toContain('studentSnapshot');
    expect(fields).toContain('cheque.number');
    expect(fields).not.toContain('studentSnapshot.rollNumber');
    expect(buildSelect(provider('candidate')).split(' ')).toContain('fatherName');
  });
});

describe('scoreDoc', () => {
  it('ranks exact over prefix over substring', () => {
    const p = provider('student');
    expect(scoreDoc(p, { name: 'Ravi' }, 'ravi')).toBe(100);
    expect(scoreDoc(p, { name: 'Ravinder' }, 'ravi')).toBe(80);
    expect(scoreDoc(p, { name: 'Amit Ravi' }, 'ravi')).toBe(60);
    expect(scoreDoc(p, { name: 'Daravind' }, 'ravi')).toBe(40);
  });
});

describe('getActiveProviders', () => {
  const allModels = Object.fromEntries(PROVIDERS.map((p) => [p.modelKey, {}]));

  it('skips providers whose features are disabled or models are not registered', () => {
    const toggles = normalizeTenantFeatureToggles({ asets_dashboard: false, cpitl_fees: false });
    const { Candidate, ...models } = allModels;
    const types = getActiveProviders({ models, toggles, role: 'admin' }).map((p) => p.type);
    expect(types).not.toContain('asset');
    expect(types).not.toContain('receipt');
    expect(types).not.toContain('candidate');
    expect(types).toContain('student');
  });
});

describe('runSearch', () => {
  it('returns ranked groups and survives a failing provider', async () => {
    const Student = fakeModel([
      { _id: 's1', name: 'Daravind', class: '9', section: 'A' },
      { _id: 's2', name: 'Ravi', class: '10', section: 'B', rollNumber: '1001' }
    ]);
    const Teacher = { find: () => { throw new Error('boom'); } };
    const result = await runSearch({
      q: 'ravi',
      limit: 5,
      types: new Set(['student', 'staff']),
      models: { Student, Teacher },
      toggles: normalizeTenantFeatureToggles({}),
      role: 'admin'
    });
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].items.map((item) => item.id)).toEqual(['s2', 's1']);
    expect(result.groups[0].items[0].path).toBe('/stdnt/students/s2');
    expect(Student.calls.limit).toBe(20);
  });
});
