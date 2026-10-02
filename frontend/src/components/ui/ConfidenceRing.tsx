import { motion } from "motion/react";
import { useTranslation } from "react-i18next";

import { cn } from "../../lib/cn";
import { formatPercent } from "../../lib/format";
import { useReducedMotionPref } from "../../lib/motionPrefs";
import { useLocale } from "../../lib/prefs";
import { DUR, tween } from "../../styles/motion";

interface ConfidenceRingProps {
  /** 0..1 */
  value: number;
  size?: number;
  stroke?: string;
  className?: string;
}

export function ConfidenceRing({ value, size = 56, stroke = "var(--pulse-blue)", className }: ConfidenceRingProps) {
  const { t } = useTranslation();
  const { digits } = useLocale();
  const reduced = useReducedMotionPref();
  const v = Math.min(1, Math.max(0, value));
  const label = formatPercent(v, digits);
  return (
    <div
      role="img"
      aria-label={t("confidence.label", { value: label })}
      className={cn("relative inline-grid place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="24" cy="24" r="20" fill="none" stroke="var(--line)" strokeWidth="4" />
        <motion.circle
          cx="24"
          cy="24"
          r="20"
          fill="none"
          stroke={stroke}
          strokeWidth="4"
          strokeLinecap="round"
          initial={{ pathLength: reduced ? v : 0 }}
          animate={{ pathLength: v }}
          transition={reduced ? { duration: 0 } : tween(DUR.reveal)}
        />
      </svg>
      <span aria-hidden className="num text-xs font-semibold">
        {label}
      </span>
    </div>
  );
}
