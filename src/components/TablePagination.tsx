import { PAGE_SIZE_OPTIONS, type PageSize } from "../hooks/usePagination";

interface TablePaginationProps {
  page: number;
  pageCount: number;
  pageSize: PageSize;
  totalItems: number;
  firstItem: number;
  lastItem: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
  /** Bezeichnung der Einträge, z. B. "Mitarbeiter" oder "Kunden" */
  itemLabel?: string;
}

/**
 * Wiederverwendbare Tabellen-Pagination:
 * Seitengröße (10/25/50) + Seitennavigation + Statusanzeige.
 */
export default function TablePagination({
  page,
  pageCount,
  pageSize,
  totalItems,
  firstItem,
  lastItem,
  onPageChange,
  onPageSizeChange,
  itemLabel = "Einträge",
}: TablePaginationProps) {
  // Bei einer einzigen Seite UND Standardgröße keine UI nötig
  if (totalItems === 0) return null;

  return (
    <div className="table-pagination">
      <div className="table-pagination__size">
        <label htmlFor="page-size">Pro Seite</label>
        <select
          id="page-size"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value) as PageSize)}
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>

      <div className="table-pagination__status">
        {firstItem}–{lastItem} von {totalItems} {itemLabel}
      </div>

      <div className="table-pagination__nav">
        <button
          type="button"
          className="table-pagination__btn"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Vorherige Seite"
        >
          ‹
        </button>
        <span className="table-pagination__page">
          Seite {page} / {pageCount}
        </span>
        <button
          type="button"
          className="table-pagination__btn"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          aria-label="Nächste Seite"
        >
          ›
        </button>
      </div>
    </div>
  );
}
