import { motion } from "motion/react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

import type { FairnessGroup, FairnessReport } from "../../api/types";
import { formatNumber, formatPercent, localizeDigits } from "../../lib/format";
import { useOnScreen, useReducedMotionPref } from "../../lib/motionPrefs";
import { useLocale } from "../../lib/prefs";
import { DUR, STAGGER, tween } from "../../styles/motion";

interface BarRowProps {
  label: string;
  sub: string;
  share: number;
  value: string;
  overall: number;
  index: number;
  seen: boolean;
}

function BarRow({ label, sub, share, value, overall, index, seen }: BarRowProps) {
  const reduced = useReducedMotionPref();
  return (
    <li className="grid grid-cols-[7rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-xs">
      <span className="min-w-0">
        <span className="line-clamp-2 break-words font-semibold" title={label}>{label}</span>
        <span className="num block text-muted">{sub}</span>
      </span>
      <span className="relative h-3 rounded-full bg-surface-2">
        <motion.span
          className="absolute inset-y-0 left-0 origin-left rounded-full bg-pulse"
          style={{ width: `${Math.min(share, 1) * 100}%` }}
          initial={{ scaleX: reduced ? 1 : 0 }}
          animate={{ scaleX: seen || reduced ? 1 : 0 }}
          transition={reduced ? { duration: 0 } : tween(DUR.reveal, index * STAGGER)}
        />
        <span aria-hidden className="absolute -inset-y-1 w-0.5 rounded-full bg-fg" style={{ left: `${Math.min(overall, 1) * 100}%` }} />
      </span>
      <span className="num text-right font-semibold">{value}</span>
    </li>
  );
}

/** Held-out forecast error and stockout recall per group; the dark tick marks the overall value. */
export function FairnessChart({ report }: { report: FairnessReport }) {
  const { t } = useTranslation();
  const { digits } = useLocale();
  const ref = useRef<HTMLDivElement>(null);
  const seen = useOnScreen(ref, true);
  const groups = report.groups;
  const targets = report.overall.forecast.map((f) => f.target);
  const nmaeOf = (g: FairnessGroup, target: string) => g.forecast.find((f) => f.target === target)?.nmae ?? 0;
  const top = Math.max(...groups.flatMap((g) => targets.map((tg) => nmaeOf(g, tg))), ...targets.map((tg) => nmaeOf(report.overall, tg)), 0.0001) * 1.15;
  const groupLabel = (group: string): string => {
    if (report.group_by === "urban_rural" && (group === "urban" || group === "peri_urban" || group === "rural")) return t(`detail.area.${group}`);
    if (report.group_by === "tier") return t("detail.tier", { tier: group });
    return group;
  };
  const targetLabel = (target: string): string => (target === "cash_out" || target === "cash_in" ? t(`rai.target.${target}`) : target);
  const agents = (g: FairnessGroup) => localizeDigits(t("rai.agents", { n: g.n_agents }), digits);

  return (
    <div ref={ref} className="grid gap-4 lg:grid-cols-2" data-testid="fairness-chart" data-group-by={report.group_by}>
      <figure className="ap-card p-4">
        <figcaption>
          <p className="font-semibold">{t("rai.error.title")}</p>
          <p className="text-xs text-muted">{t("rai.error.lead")}</p>
        </figcaption>
        {targets.map((target) => (
          <div key={target} className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{targetLabel(target)}</p>
            <ul className="mt-2 space-y-2">
              {groups.map((g, i) => (
                <BarRow
                  key={g.group}
                  label={groupLabel(g.group)}
                  sub={agents(g)}
                  share={nmaeOf(g, target) / top}
                  overall={nmaeOf(report.overall, target) / top}
                  value={formatNumber(nmaeOf(g, target), digits, { fraction: 3 })}
                  index={i}
                  seen={seen}
                />
              ))}
            </ul>
          </div>
        ))}
      </figure>

      <figure className="ap-card p-4">
        <figcaption>
          <p className="font-semibold">{t("rai.recall.title")}</p>
          <p className="text-xs text-muted">{t("rai.recall.lead")}</p>
        </figcaption>
        <ul className="mt-4 space-y-2">
          {groups.map((g, i) => (
            <BarRow
              key={g.group}
              label={groupLabel(g.group)}
              sub={localizeDigits(t("rai.caught", { caught: g.stockout.caught, events: g.stockout.events }), digits)}
              share={g.stockout.recall ?? 0}
              overall={report.overall.stockout.recall ?? 0}
              value={g.stockout.recall === null ? "–" : formatPercent(g.stockout.recall, digits)}
              index={i}
              seen={seen}
            />
          ))}
        </ul>
        <p className="mt-4 flex items-center gap-2 text-xs text-muted">
          <span aria-hidden className="h-3 w-0.5 rounded-full bg-fg" />
          {t("rai.overallTick")}
        </p>
      </figure>
    </div>
  );
}
