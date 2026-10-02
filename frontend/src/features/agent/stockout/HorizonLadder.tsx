import { motion } from "motion/react";
import { useTranslation } from "react-i18next";

import type { HorizonRisk, RiskLevel } from "../../../api/types";
import { RiskPill } from "../../../components/ui/RiskPill";
import { formatNumber, formatPercent } from "../../../lib/format";
import { useReducedMotionPref } from "../../../lib/motionPrefs";
import { useLocale } from "../../../lib/prefs";
import { DUR, tween } from "../../../styles/motion";
import { cn } from "../../../lib/cn";

const BAR: Record<RiskLevel, string> = { green: "bg-safe", amber: "bg-watch", red: "bg-act" };

/** Risk at 6 / 24 / 72 h: colour + icon + word per window, with the stockout probability. */
export function HorizonLadder({ horizons }: { horizons: HorizonRisk[] }) {
  const { t } = useTranslation();
  const { digits } = useLocale();
  const reduced = useReducedMotionPref();
  const rows = [...horizons].sort((a, b) => a.horizon_h - b.horizon_h);

  return (
    <div>
      <p className="text-small font-semibold text-muted">{t("stockout.horizons")}</p>
      <ul className="mt-2 space-y-2">
        {rows.map((h, i) => {
          const chance = formatPercent(h.probability, digits);
          return (
            <li key={h.horizon_h} data-testid={`horizon-${h.horizon_h}`} data-level={h.level} className="rounded-xl bg-surface-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-small font-semibold">{t("stockout.horizon", { hours: formatNumber(h.horizon_h, digits) })}</span>
                <RiskPill level={h.level} size="sm" />
              </div>
              <div className="mt-2 flex items-center gap-3">
                <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
                  <motion.span
                    data-testid="horizon-bar"
                    className={cn("absolute inset-y-0 left-0 w-full origin-left rounded-full", BAR[h.level])}
                    initial={{ scaleX: reduced ? Math.max(0.02, h.probability) : 0 }}
                    animate={{ scaleX: Math.max(0.02, h.probability) }}
                    transition={reduced ? { duration: 0 } : tween(DUR.reveal, i * 0.08)}
                  />
                </span>
                <span className="num w-auto shrink-0 text-xs text-muted">{t("stockout.probability", { value: chance })}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
