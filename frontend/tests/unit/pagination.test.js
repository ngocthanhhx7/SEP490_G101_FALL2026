import { paginationPages } from '../../src/utils/pagination.js';

describe('FE-PAGES-01 paginationPages', () => {
  test('UTCID01 boundary: returns the sole page when there is one page', () => {
    const result = paginationPages(1, 1);

    expect(result).toEqual([1]);
  });

  test('UTCID02 boundary: returns every page without an ellipsis when there are five pages', () => {
    const result = paginationPages(3, 5);

    expect(result).toEqual([1, 2, 3, 4, 5]);
  });

  test('UTCID03 normal: shows the first three pages and a trailing gap at the first page of a longer list', () => {
    const result = paginationPages(1, 6);

    expect(result).toEqual([1, 2, 3, 'gap', 6]);
  });

  test('UTCID04 boundary: keeps the leading layout at page three', () => {
    const result = paginationPages(3, 10);

    expect(result).toEqual([1, 2, 3, 'gap', 10]);
  });

  test('UTCID05 boundary: switches to the middle layout immediately after page three', () => {
    const result = paginationPages(4, 10);

    expect(result).toEqual([1, 'gap-before', 4, 'gap-after', 10]);
  });

  test('UTCID06 boundary: keeps both gaps through the page before the trailing layout', () => {
    const result = paginationPages(7, 10);

    expect(result).toEqual([1, 'gap-before', 7, 'gap-after', 10]);
  });

  test('UTCID07 boundary: switches to the trailing layout at pages minus two', () => {
    const result = paginationPages(8, 10);

    expect(result).toEqual([1, 'gap', 8, 9, 10]);
  });

  test('UTCID08 normal: keeps the last three pages and a leading gap on the final page', () => {
    const result = paginationPages(10, 10);

    expect(result).toEqual([1, 'gap', 8, 9, 10]);
  });
});
