import { motion } from "motion/react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "../../../lib/cn";
import { formatDuration, formatMoney, formatNumber } from "../../../lib/format";
import { useOnScreen, useReducedMotionPref } from "../../../lib/motionPrefs";
import { useLocale } from "../../../lib/prefs";
import { DUR, STAGGER, tween } from "../../../styles/motion";
import type { CompareFormat, CompareRow } from "./impactModel";

function useFormat(): (v: number, f: CompareFormat) => string {
  const { lang, digits } = useLocale();
  return (v, f) => (f === "money" ? formatMoney(v, digits, { lang, compact: v >= 1e5 }) : f === "hours" ? formatDuration(v, lang, digits) : formatNumber(v, digits));
}

function Bar({ share, value, label, tone, delay, seen }: { share: number; value: string; label: string; tone: string; delay: number; seen: boolean }) {
  const reduced = useReducedMotionPref();
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2 text-xs">
      <span className="min-w-0 break-words text-muted">{label}</span>
      <span className="h-3 overflow-hidden rounded-full bg-surface-2">
        <motion.span
          className={cn("block h-full origin-left rounded-full", tone)}
          style={{ width: `${Math.max(share * 100, share > 0 ? 2 : 0)}%` }}
          initial={{ scaleX: reduced ? 1 : 0 }}
          animate={{ scaleX: seen || reduced ? 1 : 0 }}
          transition={reduced ? { duration: 0 } : tween(DUR.reveal, delay)}
        />
      </span>
      <span className="num min-w-16 text-right font-semibold">{value}</span>
    </div>
  );
}

/** AI plan vs the fixed-threshold baseline, cost by cost; bars grow in once on screen. */
export function CompareBars({ rows }: { rows: CompareRow[] }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const ref = useRef<HTMLUListElement>(null);
  const seen = useOnScreen(ref, true);

  return (
    <ul ref={ref} className="space-y-4" data-testid="compare-bars">
      {rows.map((r, i) => {
        const delay = i * STAGGER * 2;
        return (
          <li key={r.key} data-key={r.key}>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-small font-semibold">{t(`impact.metric.${r.key}`)}</p>
              <p className={cn("num text-xs font-semibold", r.saved > 0 ? "text-safe-fg" : r.saved < 0 ? "text-act-fg" : "text-muted")}>
                {r.saved === 0 ? t("impact.same") : t(r.saved > 0 ? "impact.less" : "impact.more", { value: fmt(Math.abs(r.saved), r.format) })}
              </p>
            </div>
            <div className="mt-1.5 space-y-1">
              <Bar share={r.modelShare} value={fmt(r.model, r.format)} label={t("impact.ai")} tone="bg-pulse" delay={delay} seen={seen} />
              <Bar share={r.baselineShare} value={fmt(r.baseline, r.format)} label={t("impact.baseline")} tone="bg-ink-600" delay={delay + STAGGER} seen={seen} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
