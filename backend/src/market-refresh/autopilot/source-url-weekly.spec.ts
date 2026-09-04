import { buildIncrementalPageUrl, sameCategoryUrl } from './source-url';

const BASE = 'https://www.sahibinden.com/';

describe('weekly source URL semantics', () => {
  test('is newest-first and redirect comparison preserves category filters', () => {
    const url = buildIncrementalPageUrl(BASE, '/audi-a3?a5_max=2020', 2);
    const parsed = new URL(url);
    expect(parsed.searchParams.get('sorting')).toBe('date_desc');
    expect(parsed.searchParams.get('pagingOffset')).toBe('50');
    expect(sameCategoryUrl(BASE, '/audi-a3?a5_max=2020', url)).toBe(true);
    expect(
      sameCategoryUrl(BASE, '/audi-a3?a5_max=2020', '/audi-a3?a5_max=2021'),
    ).toBe(false);
    expect(sameCategoryUrl(BASE, '/audi-a3', '/audi-a4')).toBe(false);
  });
});
