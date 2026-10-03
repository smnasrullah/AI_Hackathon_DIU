import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { motion } from "motion/react";
import { Fragment, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "../../lib/cn";
import { fadeOnly, listStagger } from "../../styles/motion";
import { SkeletonRows } from "./Skeleton";
import { EmptyState, ErrorState } from "./StatePanel";

/** Only the first rows stagger in; a long page would otherwise take seconds to appear. */
const STAGGER_ROWS = 12;

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Makes the column sortable. */
  sortValue?: (row: T) => number | string;
  align?: "left" | "right";
  className?: string;
}

export interface SortState {
  key: string;
  dir: "asc" | "desc";
}

interface DataTableProps<T> {
  caption: string;
  columns: Column<T>[];
  rows: T[] | undefined;
  getRowId: (row: T) => string | number;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  empty: { title: string; body?: string; action: { label: string; onClick: () => void } };
  /** Controlled sort (URL-synced pages); omit for local sorting. */
  sort?: SortState | null;
  onSortChange?: (sort: SortState) => void;
  onRowClick?: (row: T) => void;
  /** Row expand: the open row's id and what to show under it. */
  expandedId?: string | number | null;
  renderExpanded?: (row: T) => ReactNode;
  maxHeight?: number;
}

/** Arrow keys move between clickable rows; Enter / Space opens the focused one. */
function onRowKey(e: KeyboardEvent<HTMLTableRowElement>, open: () => void): void {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    open();
    return;
  }
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  e.preventDefault();
  const rows = Array.from(e.currentTarget.closest("tbody")?.querySelectorAll<HTMLElement>("tr[data-row]") ?? []);
  const next = rows[rows.indexOf(e.currentTarget) + (e.key === "ArrowDown" ? 1 : -1)];
  next?.focus();
}

/** Sticky header, row hover glow, sortable columns; skeleton / empty / error states built in. */
export function DataTable<T>({
  caption,
  columns,
  rows,
  getRowId,
  loading = false,
  error = false,
  onRetry,
  empty,
  sort: sortProp,
  onSortChange,
  onRowClick,
  expandedId = null,
  renderExpanded,
  maxHeight = 480,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const detailId = useId();
  const [localSort, setLocalSort] = useState<SortState | null>(null);
  const sort = sortProp === undefined ? localSort : sortProp;

  const sorted = useMemo(() => {
    if (!rows || !sort || sortProp !== undefined) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const value = col.sortValue;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb))) * factor;
    });
  }, [rows, sort, sortProp, columns]);

  function toggle(key: string) {
    const next: SortState = { key, dir: sort?.key === key && sort.dir === "asc" ? "desc" : "asc" };
    setLocalSort(next);
    onSortChange?.(next);
  }

  if (error) return <ErrorState onRetry={onRetry ?? (() => undefined)} compact />;
  if (!loading && sorted && sorted.length === 0) return <EmptyState title={empty.title} body={empty.body} action={empty.action} compact />;

  return (
    <div className="overflow-auto ap-card" style={{ maxHeight }}>
      <table className="w-full border-separate border-spacing-0 text-small">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 z-10">
          <tr>
            {columns.map((col) => {
              const active = sort?.key === col.key;
              const ariaSort = active ? (sort.dir === "asc" ? "ascending" : "descending") : "none";
              const SortIcon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={col.sortValue ? ariaSort : undefined}
                  className={cn(
                    "border-b border-line bg-surface-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted",
                    col.align === "right" ? "text-right" : "text-left",
                  )}
                >
                  {col.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggle(col.key)}
                      aria-label={t("table.sortBy", { column: col.header })}
                      className={cn("-my-1 inline-flex min-h-8 items-center gap-1 uppercase hover:text-fg", active && "text-fg")}
                    >
                      {col.header}
                      <SortIcon aria-hidden className="size-3.5" />
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <motion.tbody key={loading || !sorted ? "loading" : "rows"} variants={listStagger} initial="hidden" animate="show">
          {loading || !sorted ? (
            <tr>
              <td colSpan={columns.length} className="px-4">
                <SkeletonRows rows={5} cols={columns.length} />
              </td>
            </tr>
          ) : (
            sorted.map((row, index) => {
              const id = getRowId(row);
              const open = renderExpanded !== undefined && expandedId === id;
              return (
                <Fragment key={id}>
                  <motion.tr
                    data-row
                    variants={index < STAGGER_ROWS ? fadeOnly : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    // aria-expanded is not allowed on a plain table row; the open detail row is linked instead.
                    data-expanded={renderExpanded ? open : undefined}
                    aria-controls={open ? `${detailId}-${id}` : undefined}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={onRowClick ? (e) => onRowKey(e, () => onRowClick(row)) : undefined}
                    className={cn(
                      "outline-none transition-[background-color,box-shadow] duration-200 hover:bg-surface-2 hover:shadow-[inset_3px_0_0_var(--pulse-blue)] focus-visible:bg-surface-2 focus-visible:shadow-[inset_3px_0_0_var(--pulse-blue)]",
                      onRowClick && "cursor-pointer",
                      open && "bg-surface-2",
                    )}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn("border-b border-line px-4 py-3", col.align === "right" && "text-right", col.className)}
                      >
                        {col.cell(row)}
                      </td>
                    ))}
                  </motion.tr>
                  {open ? (
                    <tr id={`${detailId}-${id}`}>
                      <td colSpan={columns.length} className="border-b border-line bg-surface-2/60 px-4 py-4">
                        {renderExpanded(row)}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })
          )}
        </motion.tbody>
      </table>
    </div>
  );
}
