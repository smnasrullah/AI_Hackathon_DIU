import { motion } from "motion/react";
import { useTranslation } from "react-i18next";

import type { PeerFeature } from "../../../api/types";
import { cn } from "../../../lib/cn";
import { formatNumber, formatPercent } from "../../../lib/format";
import { useReducedMotionPref } from "../../../lib/motionPrefs";
import { useLocale } from "../../../lib/prefs";
import { DUR, STAGGER, tween } from "../../../styles/motion";
import { peerScale } from "./peerChartModel";

/** Box-style peer comparison: whiskers p10-p90, box p25-p75, median tick, the agent as a dot. */
export function PeerChart({ features, peerCount, peerGroup }: { features: PeerFeature[]; peerCount: number; peerGroup: string }) {
  const { t } = useTranslation();
  const { digits } = useLocale();
  const reduced = useReducedMotionPref();
  const num = (v: number) => formatNumber(v, digits, { fraction: 2 });

  return (
    <figure className="rounded-[var(--radius-card)] border border-line bg-surface p-4" data-testid="peer-chart">
      <figcaption className="text-small font-semibold">{t("anomalies.peers.title", { count: peerCount, group: peerGroup })}</figcaption>
      <ul className="mt-3 space-y-4">
        {features.map((f, i) => {
          const s = peerScale(f);
          const name = t(`anomalies.feature.${f.name}`);
          const summary = t("anomalies.peers.row", {
            feature: name,
            value: num(f.value),
            low: num(f.p25),
            high: num(f.p75),
            percentile: formatPercent(f.percentile, digits),
          });
          const delay = reduced ? 0 : i * STAGGER;
          return (
            <li key={f.name} data-feature={f.name} data-outside={s.outside}>
              <div className="flex items-baseline justify-between gap-2 text-small">
                <span className="font-semibold">{name}</span>
                <span className={cn("num text-xs", s.outside ? "text-act-fg" : "text-muted")}>{formatPercent(f.percentile, digits)}</span>
              </div>
              <p className="sr-only">{summary}</p>
              <div aria-hidden className="relative mt-2 h-8">
                <span className="absolute inset-x-0 top-1/2 h-px bg-line" />
                <span className="absolute top-1/2 h-px bg-line-strong" style={{ left: `${s.p10}%`, width: `${s.p90 - s.p10}%` }} />
                <motion.span
                  className="absolute top-1.5 h-5 origin-left rounded-md border border-pulse/50 bg-pulse/15"
                  style={{ left: `${s.p25}%`, width: `${Math.max(s.p75 - s.p25, 0.8)}%` }}
                  initial={{ scaleX: reduced ? 1 : 0 }}
                  animate={{ scaleX: 1 }}
                  transition={reduced ? { duration: 0 } : tween(DUR.slow, delay)}
                />
                <span className="absolute top-1 h-6 w-0.5 bg-pulse" style={{ left: `${s.p50}%` }} />
                <motion.span
                  className={cn("absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface", s.outside ? "bg-act" : "bg-fg")}
                  style={{ left: `${s.value}%` }}
                  initial={{ opacity: reduced ? 1 : 0 }}
                  animate={{ opacity: 1 }}
                  transition={reduced ? { duration: 0 } : tween(DUR.base, delay + DUR.slow)}
                />
              </div>
              <div aria-hidden className="num flex justify-between text-xs text-muted">
                <span>{num(f.p10)}</span>
                <span>{t("anomalies.peers.agent", { value: num(f.value) })}</span>
                <span>{num(f.p90)}</span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm border border-pulse/50 bg-pulse/15" />
          {t("anomalies.peers.legendBox")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-act" />
          {t("anomalies.peers.legendDot")}
        </span>
      </p>
    </figure>
  );
}
