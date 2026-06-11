import { useMemo, useState, useEffect } from "react";

export const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export interface UsePaginationResult<T> {
  /** Items for the current page only */
  pageItems: T[];
  page: number;
  pageSize: PageSize;
  pageCount: number;
  totalItems: number;
  /** 1-based index of the first item shown on the current page */
  firstItem: number;
  /** 1-based index of the last item shown on the current page */
  lastItem: number;
  setPage: (page: number) => void;
  setPageSize: (size: PageSize) => void;
  nextPage: () => void;
  prevPage: () => void;
}

/**
 * Client-seitige Pagination für Listen/Tabellen.
 * Hält den Datensatz performant: gerendert wird immer nur eine Seite.
 * Klemmt die Seite automatisch in gültige Grenzen, wenn sich die
 * Datenmenge oder die Seitengröße ändert.
 */
export function usePagination<T>(
  items: T[],
  initialPageSize: PageSize = 10
): UsePaginationResult<T> {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState<PageSize>(initialPageSize);

  const totalItems = items.length;
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));

  // Seite gültig halten, wenn Daten schrumpfen oder Seitengröße wechselt
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const setPageSize = (size: PageSize) => {
    setPageSizeState(size);
    setPage(1);
  };

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  const firstItem = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, totalItems);

  return {
    pageItems,
    page,
    pageSize,
    pageCount,
    totalItems,
    firstItem,
    lastItem,
    setPage,
    setPageSize,
    nextPage: () => setPage(Math.min(page + 1, pageCount)),
    prevPage: () => setPage(Math.max(page - 1, 1)),
  };
}
