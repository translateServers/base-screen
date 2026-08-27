export const DESIGNER_STATIC_DEFAULT_PAGE_SIZE = 10;

export const DESIGNER_STATIC_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export interface DesignerStaticDataPagination {
  readonly page: number;
  readonly pageSize: number;
  readonly pages: number;
  readonly start: number;
  readonly end: number;
}

export function normalizeDesignerStaticPageSize(value: number): number {
  return DESIGNER_STATIC_PAGE_SIZE_OPTIONS.includes(
    value as (typeof DESIGNER_STATIC_PAGE_SIZE_OPTIONS)[number],
  )
    ? value
    : DESIGNER_STATIC_DEFAULT_PAGE_SIZE;
}

export function resolveDesignerStaticDataPagination(
  totalRows: number,
  page: number,
  pageSize: number,
): DesignerStaticDataPagination {
  const safePageSize = normalizeDesignerStaticPageSize(pageSize);
  const pages = Math.max(1, Math.ceil(totalRows / safePageSize));
  const safePage = Math.min(Math.max(0, Math.trunc(page)), pages - 1);
  const start = safePage * safePageSize;
  return {
    page: safePage,
    pageSize: safePageSize,
    pages,
    start,
    end: Math.min(start + safePageSize, totalRows),
  };
}
