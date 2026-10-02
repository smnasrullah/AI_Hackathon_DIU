import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { FloatType, RiskLevel } from "../../api/types";
import { cn } from "../../lib/cn";
import { formatMoney, formatPercent } from "../../lib/format";
import { useLoopActive, useReducedMotionPref } from "../../lib/motionPrefs";
import { useLocale } from "../../lib/prefs";
import { DUR, SPRING, STAGGER, tween } from "../../styles/motion";
import { MoneyText } from "../ui/MoneyText";
import { RiskPill } from "../ui/RiskPill";

// Vessel geometry in viewBox units.
const W = 120;
const TOP = 14;
const BOTTOM = 170;
const INNER = BOTTOM - TOP;
/** Wave period 40 units: scrolling the loop by 200 (ap-scroll) is exactly 5 periods, so it is seamless. */
function wavePath(amp: number, phase: number): string {
  let d = `M${-phase} 0`;
  for (let x = -phase; x < W + 220; x += 40) d += ` q10 ${-amp} 20 0 t20 0`;
  return `${d} V${INNER + 20} H${-phase} Z`;
}
const WAVE_FRONT = wavePath(3.5, 0);
const WAVE_BACK = wavePath(2.5, 20);

const FLOAT_COLOR: Record<FloatType, string> = { cash: "var(--float-cash)", emoney: "var(--float-emoney)" };

interface VesselGaugeProps {
  floatType: FloatType;
  balance: number;
  capacity: number;
  /** Translucent tide marks, in BDT. */
  lowMark?: number;
  highMark?: number;
  level?: RiskLevel;
  /** Expected balance per coming hour; enables tap-to-expand. */
  hourly?: number[];
  className?: string;
}

/** Liquid level with a two-layer wave; texture per float (cash stripes, e-money dots). */
export function VesselGauge({ floatType, balance, capacity, lowMark, highMark, level, hourly, className }: VesselGaugeProps) {
  const { t } = useTranslation();
  const { lang, digits } = useLocale();
  const reduced = useReducedMotionPref();
  const svgRef = useRef<SVGSVGElement>(null);
  const looping = useLoopActive(svgRef);
  const uid = useId().replace(/:/g, "");
  const [open, setOpen] = useState(false);

  // Bubbles when the level rises: compare with the previous render (no effect needed).
  const [prevBalance, setPrevBalance] = useState(balance);
  const [burst, setBurst] = useState(0);
  if (balance !== prevBalance) {
    setPrevBalance(balance);
    if (balance > prevBalance) setBurst((b) => b + 1);
  }

  const pct = capacity > 0 ? Math.min(1, Math.max(0, balance / capacity)) : 0;
  const levelY = TOP + (1 - pct) * INNER;
  const markY = (v: number) => TOP + (1 - Math.min(1, Math.max(0, v / capacity))) * INNER;
  const color = FLOAT_COLOR[floatType];
  const floatName = t(`float.${floatType}`);
  const summary = t("gauge.summary", {
    float: floatName,
    balance: formatMoney(balance, digits, { lang }),
    capacity: formatMoney(capacity, digits, { lang }),
    percent: formatPercent(pct, digits),
  });
  const hours = hourly ?? [];
  const peak = Math.max(capacity, ...hours);

  return (
    <div className={cn("rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-soft", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{floatName}</p>
        {level ? <RiskPill level={level} size="sm" /> : null}
      </div>

      <button
        type="button"
        onClick={() => hours.length && setOpen((o) => !o)}
        aria-expanded={hours.length ? open : undefined}
        aria-label={hours.length ? t(open ? "gauge.collapse" : "gauge.expand") : summary}
        disabled={!hours.length}
        className="mt-3 block w-full disabled:cursor-default"
      >
        <svg
          ref={svgRef}
          role="meter"
          aria-valuemin={0}
          aria-valuemax={capacity}
          aria-valuenow={balance}
          aria-valuetext={summary}
          aria-label={summary}
          viewBox={`0 0 ${W} 180`}
          className="mx-auto block h-44 w-auto"
        >
          <defs>
            <clipPath id={`${uid}-jar`}>
              <rect x="6" y={TOP} width={W - 12} height={INNER} rx="26" />
            </clipPath>
            <pattern id={`${uid}-tex`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform={floatType === "cash" ? "rotate(45)" : undefined}>
              {floatType === "cash" ? (
                <rect width="3" height="8" fill="white" opacity="0.22" />
              ) : (
                <circle cx="4" cy="4" r="1.3" fill="white" opacity="0.35" />
              )}
            </pattern>
          </defs>
          <rect x="6" y={TOP} width={W - 12} height={INNER} rx="26" fill="var(--surface-2)" />
          <g clipPath={`url(#${uid}-jar)`}>
            <motion.g initial={false} animate={{ y: levelY }} transition={reduced ? { duration: 0 } : SPRING.soft}>
              <g className="ap-loop ap-scroll-x" data-paused={looping ? "false" : "true"} style={{ animationDuration: "9s", animationDirection: "reverse" }}>
                <path d={WAVE_BACK} fill={color} opacity="0.45" />
              </g>
              <g className="ap-loop ap-scroll-x" data-paused={looping ? "false" : "true"} style={{ animationDuration: "6s" }}>
                <path d={WAVE_FRONT} fill={color} opacity="0.9" />
                <path d={WAVE_FRONT} fill={`url(#${uid}-tex)`} />
              </g>
            </motion.g>
            <AnimatePresence>
              {!reduced && burst > 0
                ? [0, 1, 2, 3, 4].map((i) => (
                    <motion.circle
                      key={`${burst}-${i}`}
                      cx={24 + i * 18}
                      r={2 + (i % 3)}
                      fill="white"
                      initial={{ cy: BOTTOM - 6, opacity: 0 }}
                      animate={{ cy: levelY + 8, opacity: [0, 0.7, 0] }}
                      transition={tween(DUR.reveal * 1.4, i * STAGGER * 2)}
                    />
                  ))
                : null}
            </AnimatePresence>
          </g>
          {[lowMark, highMark].map((mark, i) =>
            mark === undefined ? null : (
              <g key={i} opacity="0.55">
                <line x1="10" x2={W - 10} y1={markY(mark)} y2={markY(mark)} stroke="var(--fg)" strokeDasharray="3 4" strokeWidth="1" />
                <text x={W - 12} y={markY(mark) - 3} textAnchor="end" fontSize="8" fill="var(--fg)">
                  {t(i === 0 ? "gauge.lowTide" : "gauge.highTide")}
                </text>
              </g>
            ),
          )}
          <rect x="6" y={TOP} width={W - 12} height={INNER} rx="26" fill="none" stroke="var(--line-strong)" strokeWidth="2" />
        </svg>
      </button>

      <div className="mt-3 flex items-end justify-between gap-2">
        <div>
          <MoneyText value={balance} animate className="font-display text-h2 font-bold" />
          <p className="num text-xs text-muted">
            {formatPercent(pct, digits)} · {formatMoney(capacity, digits, { lang, compact: true })}
          </p>
        </div>
        {hours.length ? (
          <ChevronDown aria-hidden className={cn("size-5 text-muted transition-transform duration-200", open && "rotate-180")} />
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="hourly"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={tween(DUR.base)}
            className="mt-3 border-t border-line pt-3"
          >
            <p className="text-xs text-muted">{t("gauge.hourly", { count: hours.length })}</p>
            <div className="mt-2 flex h-16 items-end gap-0.5" aria-hidden>
              {hours.map((v, i) => (
                <motion.span
                  key={i}
                  className="flex-1 origin-bottom rounded-t-sm"
                  style={{ height: `${Math.max(4, (v / peak) * 100)}%`, background: color, opacity: 0.75 }}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={tween(DUR.slow, i * (STAGGER / 2))}
                />
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
