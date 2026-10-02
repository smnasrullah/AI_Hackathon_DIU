import type { LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";

import type { FloatType, RiskLevel } from "../../api/types";
import { cn } from "../../lib/cn";
import { formatDuration } from "../../lib/format";
import { useReducedMotionPref } from "../../lib/motionPrefs";
import { useLocale } from "../../lib/prefs";
import { DUR, tween } from "../../styles/motion";
import { ConfidenceRing } from "../ui/ConfidenceRing";
import { LiquidButton } from "../ui/LiquidButton";
import { RISK_STYLE } from "../ui/risk";
import { RiskPill } from "../ui/RiskPill";

/** Each character flips in from above when it changes. */
function FlipText({ text }: { text: string }) {
  const reduced = useReducedMotionPref();
  return (
    <span aria-hidden className="inline-flex">
      {[...text].map((ch, i) => (
        <span key={i} className="relative inline-block overflow-hidden" style={{ minWidth: ch === " " ? "0.3em" : undefined }}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={ch}
              className="inline-block"
              initial={reduced ? { opacity: 0 } : { y: "-100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={reduced ? { opacity: 0 } : { y: "100%", opacity: 0 }}
              transition={tween(reduced ? DUR.fast : DUR.slow)}
            >
              {ch}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}

interface CountdownCardProps {
  floatType: FloatType;
  /** null = no stockout within the horizon. */
  hoursToStockout: number | null;
  /** 0..1 */
  confidence: number;
  level: RiskLevel;
  action?: { label: string; onClick: () => void; icon?: LucideIcon };
  className?: string;
}

/** "Cash runs dry in 5h 20m": flip-digit ticker, confidence ring, one primary action; border glows by risk. */
export function CountdownCard({ floatType, hoursToStockout, confidence, level, action, className }: CountdownCardProps) {
  const { t } = useTranslation();
  const { lang, digits } = useLocale();
  const float = t(`float.${floatType}`);
  const stroke = RISK_STYLE[level].stroke;
  const duration = hoursToStockout === null ? null : formatDuration(hoursToStockout, lang, digits);
  const tail = t("countdown.tail");
  const sentence = duration === null ? t("countdown.safe", { float }) : `${t("countdown.lead", { float })} ${duration}${tail ? ` ${tail}` : ""}`;

  return (
    <section
      data-level={level}
      className={cn("relative rounded-[var(--radius-card)] border bg-surface p-5 transition-shadow duration-300", className)}
      style={{
        borderColor: `color-mix(in srgb, ${stroke} 55%, transparent)`,
        boxShadow: `0 0 0 1px color-mix(in srgb, ${stroke} 25%, transparent), 0 0 36px -6px color-mix(in srgb, ${stroke} 45%, transparent)`,
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <RiskPill level={level} size="sm" />
          <p aria-live="polite" className="sr-only">
            {sentence}
          </p>
          {duration === null ? (
            <p aria-hidden className="mt-3 font-display text-h1 font-bold">
              {sentence}
            </p>
          ) : (
            <>
              <p aria-hidden className="mt-3 text-small text-muted">
                {t("countdown.lead", { float })}
              </p>
              <p aria-hidden className="num mt-1 font-display text-display font-bold leading-none tracking-tight">
                <FlipText text={duration} />
                {tail ? <span className="ml-2 text-h2 font-semibold text-muted">{tail}</span> : null}
              </p>
            </>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1">
          <ConfidenceRing value={confidence} stroke={stroke} />
          <span className="text-xs text-muted">{t("countdown.confidence")}</span>
        </div>
      </div>
      {action ? (
        <LiquidButton className="mt-5 w-full" size="lg" icon={action.icon} onClick={action.onClick}>
          {action.label}
        </LiquidButton>
      ) : null}
    </section>
  );
}
