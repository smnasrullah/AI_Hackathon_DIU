import { ChevronDown, Flag } from "lucide-react";
import { motion } from "motion/react";
import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";

import type { FloatType } from "../../../api/types";
import { LiquidButton } from "../../../components/ui/LiquidButton";
import { cn } from "../../../lib/cn";
import { formatClock, formatDateTime, formatMoney } from "../../../lib/format";
import { useReducedMotionPref } from "../../../lib/motionPrefs";
import { useLocale } from "../../../lib/prefs";
import { DUR, tween } from "../../../styles/motion";
import type { HourRow } from "./hourlyModel";

const FIRST = 24;

interface HourlyListProps {
  rows: HourRow[];
  floatType: FloatType;
}

/** Hour-by-hour demand (q10–q90 band with the median tick) and the balance left after each hour. */
export function HourlyList({ rows, floatType }: HourlyListProps) {
  const { t } = useTranslation();
  const { lang, digits } = useLocale();
  const reduced = useReducedMotionPref();
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, FIRST);
  const peak = Math.max(1, ...rows.map((r) => r.high));
  const money = (v: number) => formatMoney(v, digits, { lang, compact: true });
  const dayLabel = (r: HourRow) =>
    r.day === 0 ? t("forecast.today") : r.day === 1 ? t("forecast.tomorrow") : formatDateTime(new Date(r.ts), lang, digits).split(",")[0];

  return (
    <section aria-labelledby="hourly-heading" className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-soft">
      <h2 id="hourly-heading" className="font-display text-h2 font-bold">
        {t("forecast.hourly")}
      </h2>
      <div className="mt-3 grid grid-cols-[4.5rem_1fr_4.5rem] gap-x-3 text-xs font-semibold text-muted" aria-hidden>
        <span>{t("forecast.hour")}</span>
        <span>{t(`forecast.demand.${floatType}`)}</span>
        <span className="text-right">{t("forecast.balanceAfter")}</span>
      </div>
      <ol className="mt-1">
        {shown.map((r, i) => (
          <Fragment key={r.hour}>
            {i === 0 || shown[i - 1]?.day !== r.day ? (
              <li aria-hidden className="sticky top-0 z-10 bg-surface pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-muted">
                {dayLabel(r)}
              </li>
            ) : null}
            <li
              data-stockout={r.stockout || undefined}
              className={cn(
                "grid min-h-11 grid-cols-[4.5rem_1fr_4.5rem] items-center gap-x-3 border-t border-line text-small",
                r.stockout && "rounded-xl border-transparent bg-act/10",
              )}
            >
              <span className="num flex items-center gap-1 whitespace-nowrap">
                {r.stockout ? <Flag aria-hidden className="size-3.5 text-act-fg" /> : null}
                {formatClock(new Date(r.ts), lang, digits)}
              </span>
              <span className="flex items-center gap-2">
                <span className="relative h-2.5 flex-1 rounded-full bg-surface-2" aria-hidden>
                  <motion.span
                    className="absolute inset-y-0 origin-left rounded-full bg-pulse/25"
                    style={{ left: `${(r.low / peak) * 100}%`, width: `${Math.max(1, ((r.high - r.low) / peak) * 100)}%` }}
                    initial={{ scaleX: reduced ? 1 : 0 }}
                    animate={{ scaleX: 1 }}
                    transition={tween(DUR.slow, reduced ? 0 : Math.min(i, 12) * 0.02)}
                  />
                  <span className="absolute inset-y-[-2px] w-0.5 rounded-full bg-pulse" style={{ left: `${(r.expected / peak) * 100}%` }} />
                </span>
                <span className="num w-16 text-right text-xs">{money(r.expected)}</span>
              </span>
              <span className={cn("num text-right text-xs", r.stockout && "font-semibold text-act-fg")}>
                {r.balance === null ? "—" : money(r.balance)}
              </span>
              {r.stockout ? <span className="sr-only">{t("forecast.stockoutRow")}</span> : null}
            </li>
          </Fragment>
        ))}
      </ol>
      {rows.length > FIRST ? (
        <LiquidButton variant="ghost" className="mt-3 w-full" icon={ChevronDown} onClick={() => setAll((a) => !a)} aria-expanded={all}>
          {t(all ? "forecast.showLess" : "forecast.showAll")}
        </LiquidButton>
      ) : null}
    </section>
  );
}
