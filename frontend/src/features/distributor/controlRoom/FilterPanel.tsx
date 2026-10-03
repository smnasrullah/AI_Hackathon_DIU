import { FilterX, Search } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import type { MapAgent } from "../../../api/types";
import { RISK_STYLE } from "../../../components/ui/risk";
import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import { cn } from "../../../lib/cn";
import { formatNumber, localizeDigits } from "../../../lib/format";
import { useLocale } from "../../../lib/prefs";
import { districtsOf, levelCounts } from "./controlRoomModel";
import { ALL_LEVELS, useControlRoomStore, type FloatFilter } from "./controlRoomStore";

const FIELD = "min-h-11 w-full rounded-[var(--radius-input)] border border-line bg-surface px-3 text-small outline-none focus-visible:border-pulse";

interface FilterPanelProps {
  /** Every scoped agent at the current hour (counts ignore the filters). */
  all: MapAgent[];
  shown: number;
}

/** Search, level chips with counts, district and float filters. */
export function FilterPanel({ all, shown }: FilterPanelProps) {
  const { t } = useTranslation();
  const { digits } = useLocale();
  const searchId = useId();
  const districtId = useId();
  const { levels, toggleLevel, query, setQuery, district, setDistrict, float, setFloat, resetFilters } = useControlRoomStore();
  const counts = levelCounts(all);
  const dirty = levels.length !== ALL_LEVELS.length || query !== "" || district !== null || float !== "all";

  return (
    <div className="space-y-3" data-testid="control-filters">
      <div className="relative">
        <label htmlFor={searchId} className="sr-only">
          {t("controlRoom.filters.search")}
        </label>
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("controlRoom.filters.search")}
          className={cn(FIELD, "pl-9")}
        />
      </div>

      <div role="group" aria-label={t("controlRoom.filters.levels")} className="flex flex-wrap gap-2">
        {ALL_LEVELS.map((level) => {
          const style = RISK_STYLE[level];
          const Icon = style.icon;
          const on = levels.includes(level);
          return (
            <button
              key={level}
              type="button"
              aria-pressed={on}
              onClick={() => toggleLevel(level)}
              data-testid={`filter-${level}`}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-small font-semibold ring-1 ring-inset transition-opacity",
                style.fg,
                style.bg,
                style.ring,
                !on && "opacity-45",
              )}
            >
              <Icon aria-hidden className="size-4" />
              {t(`risk.${level}`)}
              <span className="num text-xs">{formatNumber(counts[level], digits)}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col items-start gap-2">
        <label htmlFor={districtId} className="sr-only">
          {t("controlRoom.filters.district")}
        </label>
        <select id={districtId} value={district ?? ""} onChange={(e) => setDistrict(e.target.value || null)} className={FIELD}>
          <option value="">{t("controlRoom.filters.allDistricts")}</option>
          {districtsOf(all).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <SegmentedControl<FloatFilter>
          size="sm"
          label={t("controlRoom.filters.float")}
          value={float}
          onChange={setFloat}
          options={[
            { value: "all", label: t("controlRoom.filters.allFloats") },
            { value: "cash", label: t("float.cash") },
            { value: "emoney", label: t("float.emoney") },
          ]}
        />
      </div>

      <div className="flex min-h-8 items-center justify-between gap-2 text-xs text-muted">
        <span aria-live="polite" data-testid="filter-count">
          {localizeDigits(t("controlRoom.filters.count", { shown, total: all.length }), digits)}
        </span>
        {dirty ? (
          <button type="button" onClick={resetFilters} className="ap-press inline-flex min-h-8 items-center gap-1 rounded-full px-2 font-semibold text-pulse-fg hover:underline">
            <FilterX aria-hidden className="size-3.5" />
            {t("controlRoom.filters.reset")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
