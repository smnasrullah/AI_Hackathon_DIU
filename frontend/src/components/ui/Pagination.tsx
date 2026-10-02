import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import { localizeDigits } from "../../lib/format";
import { useLocale } from "../../lib/prefs";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

const BTN =
  "grid size-11 place-items-center rounded-full border border-line bg-surface hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-45";

/** "21–40 of 132" with previous / next. */
export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const { t } = useTranslation();
  const { digits } = useLocale();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label={t("table.pagination")} className="flex items-center justify-end gap-2">
      <p className="num text-small text-muted" aria-live="polite">
        {localizeDigits(t("table.range", { from, to, total }), digits)}
      </p>
      <button type="button" className={BTN} disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label={t("table.prev")}>
        <ChevronLeft aria-hidden className="size-4" />
      </button>
      <button type="button" className={BTN} disabled={page >= pages} onClick={() => onPageChange(page + 1)} aria-label={t("table.next")}>
        <ChevronRight aria-hidden className="size-4" />
      </button>
    </nav>
  );
}
