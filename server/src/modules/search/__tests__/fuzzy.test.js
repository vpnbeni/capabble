const {
  editDistance, fuzzyTokens, buildGramPattern, fuzzyDistance, tokenize
} = require('../fuzzy');
const { runSearch } = require('../service');
const { normalizeTenantFeatureToggles } = require('../../../constants/tenantFeatures');

describe('editDistance', () => {
  it('counts insertions, deletions, substitutions and transpositions', () => {
    expect(editDistance('annuj', 'anuj')).toBe(1);
    expect(editDistance('anju', 'anuj')).toBe(1); // adjacent swap
    expect(editDistance('sharma', 'shrama')).toBe(1);
    expect(editDistance('priya', 'preya')).toBe(1);
    expect(editDistance('kumar', 'kumar')).toBe(0);
  });

  it('bails out past the max', () => {
    expect(editDistance('abcdefgh', 'zzzzzzzz', 2)).toBe(3);
  });
});

describe('fuzzyTokens / buildGramPattern', () => {
  it('skips queries with no word long enough to fuzz', () => {
    expect(fuzzyTokens('ab cd')).toBeNull();
    expect(fuzzyTokens('annuj')).toEqual(['annuj']);
  });

  it('builds 3-grams for long words and 2-grams for short ones', () => {
    expect(buildGramPattern(['annuj'])).toBe('ann|nnu|nuj');
    expect(buildGramPattern(['anju'])).toBe('an|nj|ju');
  });
});

describe('fuzzyDistance', () => {
  it('matches each query word against the closest name word', () => {
    expect(fuzzyDistance(['annuj'], tokenize('Anuj'))).toBe(1);
    expect(fuzzyDistance(['rahul', 'shrama'], tokenize('Rahul Sharma'))).toBe(1);
    expect(fuzzyDistance(['annuj'], tokenize('Arjun'))).toBeNull();
  });

  it('requires short words to prefix-match exactly', () => {
    expect(fuzzyDistance(['ra', 'shrama'], tokenize('Rahul Sharma'))).toBe(1);
    expect(fuzzyDistance(['xy', 'shrama'], tokenize('Rahul Sharma'))).toBeNull();
  });
});

describe('runSearch typo fallback', () => {
  const model = (exactDocs, fuzzyDocs) => {
    let call = 0;
    const chain = (docs) => {
      const c = {
        select: () => c, sort: () => c, limit: () => c, maxTimeMS: () => c, lean: async () => docs
      };
      return c;
    };
    return {
      find: () => {
        call += 1;
        return chain(call === 1 ? exactDocs : fuzzyDocs);
      }
    };
  };

  it('returns closest matches flagged fuzzy when nothing matches exactly', async () => {
    const Student = model([], [
      { _id: 'a', name: 'Anuj' },
      { _id: 'b', name: 'Arjun' }
    ]);
    const result = await runSearch({
      q: 'annuj',
      limit: 5,
      types: new Set(['student']),
      models: { Student },
      toggles: normalizeTenantFeatureToggles({}),
      role: 'admin'
    });
    expect(result.fuzzy).toBe(true);
    expect(result.groups[0].items.map((item) => item.id)).toEqual(['a']);
    expect(result.groups[0].items[0].score).toBeLessThan(40);
  });

  it('does not run the fallback when exact matches exist', async () => {
    const Student = model([{ _id: 'a', name: 'Anuj' }], [{ _id: 'z', name: 'Anuj' }]);
    const result = await runSearch({
      q: 'anuj',
      limit: 5,
      types: new Set(['student']),
      models: { Student },
      toggles: normalizeTenantFeatureToggles({}),
      role: 'admin'
    });
    expect(result.fuzzy).toBe(false);
    expect(result.groups[0].items[0].id).toBe('a');
  });
});
