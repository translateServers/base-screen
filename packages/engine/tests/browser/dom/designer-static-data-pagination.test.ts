import { describe, expect, it } from 'vitest';
import {
  DESIGNER_STATIC_DEFAULT_PAGE_SIZE,
  normalizeDesignerStaticPageSize,
  resolveDesignerStaticDataPagination,
} from '../../../src/browser/dom/designer-static-data-pagination.js';

describe('designer static data pagination', () => {
  it('uses a practical ten-row default and resolves the selected row window', () => {
    expect(DESIGNER_STATIC_DEFAULT_PAGE_SIZE).toBe(10);
    expect(resolveDesignerStaticDataPagination(25, 1, 10)).toEqual({
      page: 1,
      pageSize: 10,
      pages: 3,
      start: 10,
      end: 20,
    });
  });

  it('clamps pages after row removal and normalizes unsupported page sizes', () => {
    expect(resolveDesignerStaticDataPagination(11, 9, 20)).toEqual({
      page: 0,
      pageSize: 20,
      pages: 1,
      start: 0,
      end: 11,
    });
    expect(normalizeDesignerStaticPageSize(12)).toBe(DESIGNER_STATIC_DEFAULT_PAGE_SIZE);
  });
});
