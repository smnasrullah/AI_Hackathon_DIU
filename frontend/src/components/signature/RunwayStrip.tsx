import { Flag } from "lucide-react";
import { motion } from "motion/react";
import { useId, useRef } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "../../lib/cn";
import { formatClock, formatPercent, localizeDigits } from "../../lib/format";
import { useLoopActive, useReducedMotionPref } from "../../lib/motionPrefs";
import { useLocale } from "../../lib/prefs";
import { DUR, SPRING, tween } from "../../styles/motion";
import { EventRibbons, type RunwayEvent } from "./EventRibbons";

export type { RunwayEvent, RunwayEventKind } from "./EventRibbons";

export interface RunwayPoint {
  hour: number;
  low: number;
  expected: number;
  high: number;
}

interface RunwayStripProps {
  /** Shown after the title, e.g. the float name. */
  subtitle?: string;
  /** Balance path, hours 0..72. */
  series: RunwayPoint[];
  capacity: number;
  /** "Before" line left behind while the what-if slider moves. */
  ghost?: RunwayPoint[] | null;
  stockout?: { hour: number; at: string; confidence: number } | null;
  events?: RunwayEvent[];
  hours?: number;
  className?: string;
}

const VW = 720;
const VH = 160;
const PAD = 10;
const TICKS = [0, 12, 24, 36, 48, 60, 72];

function scale(hours: number, capacity: number) {
  const x = (h: number) => (h / hours) * VW;
  const y = (v: number) => PAD + (1 - Math.min(1.05, Math.max(0, v / capacity))) * (VH - 2 * PAD);
  return { x, y };
}

function linePath(points: RunwayPoint[], pick: (p: RunwayPoint) => number, hours: number, capacity: number): string {
  const { x, y } = scale(hours, capacity);
  return points.map((p, i) => `${i ? "L" : "M"}${x(p.hour).toFixed(1)} ${y(pick(p)).toFixed(1)}`).join(" ");
}

function bandPath(points: RunwayPoint[], hours: number, capacity: number): string {
  if (!points.length) return "";
  const { x, y } = scale(hours, capacity);
  const top = points.map((p, i) => `${i ? "L" : "M"}${x(p.hour).toFixed(1)} ${y(p.high).toFixed(1)}`).join(" ");
  const bottom = [...points].reverse().map((p) => `L${x(p.hour).toFixed(1)} ${y(p.low).toFixed(1)}`).join(" ");
  return `${top} ${bottom} Z`;
}

/** 72h runway: fan chart draws in left to right, now cursor pulses, stockout flag drops in, events slide in. */
export function RunwayStrip({ subtitle, series, capacity, ghost, stockout, events = [], hours = 72, className }: RunwayStripProps) {
  const { t } = useTranslation();
  const { lang, digits } = useLocale();
  const reduced = useReducedMotionPref();
  const ref = useRef<HTMLDivElement>(null);
  const looping = useLoopActive(ref);
  const gid = useId().replace(/:/g, "");
  const { x, y } = scale(hours, capacity);
  const pctX = (h: number) => `${(Math.min(hours, Math.max(0, h)) / hours) * 100}%`;
  const nowY = series[0] ? (y(series[0].expected) / VH) * 100 : 50;
  const draw = reduced ? { duration: 0 } : tween(DUR.draw);
  const morph = reduced ? { duration: 0 } : tween(DUR.base);
  const flagText = stockout
    ? `${formatClock(new Date(stockout.at), lang, digits)} · ${formatPercent(stockout.confidence, digits)}`
    : "";
  const caption = t("runway.summary", {
    stockout: stockout
      ? t("runway.stockoutAt", {
          time: formatClock(new Date(stockout.at), lang, digits),
          confidence: formatPercent(stockout.confidence, digits),
        })
      : t("runway.noStockout"),
  });

  return (
    <figure ref={ref} className={cn("rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-soft", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">
          {t("runway.title")}
          {subtitle ? <span className="font-normal text-muted"> · {subtitle}</span> : null}
        </p>
        {ghost ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <span aria-hidden className="h-0 w-5 border-t-2 border-dashed border-muted" />
            {t("runway.before")}
          </span>
        ) : null}
      </div>

      <EventRibbons events={events} hours={hours} className="mt-3" />

      <div className="relative mt-2 h-40">
        <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          <defs>
            <clipPath id={`${gid}-reveal`}>
              <motion.rect
                x="0"
                y="-20"
                width={VW}
                height={VH + 40}
                initial={{ scaleX: reduced ? 1 : 0 }}
                animate={{ scaleX: 1 }}
                transition={draw}
                style={{ originX: 0 }}
              />
            </clipPath>
            <linearGradient id={`${gid}-band`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--pulse-blue)" stopOpacity="0.28" />
              <stop offset="1" stopColor="var(--pulse-blue)" stopOpacity="0.06" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1="0" x2={VW} y1={y(capacity * f)} y2={y(capacity * f)} stroke="var(--line)" vectorEffect="non-scaling-stroke" />
          ))}
          <line x1="0" x2={VW} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" vectorEffect="non-scaling-stroke" />
          {ghost?.length ? (
            <motion.path
              d={linePath(ghost, (p) => p.expected, hours, capacity)}
              fill="none"
              stroke="var(--muted)"
              strokeWidth="2"
              strokeDasharray="6 6"
              vectorEffect="non-scaling-stroke"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.8 }}
              transition={tween(DUR.base)}
            />
          ) : null}
          <g clipPath={`url(#${gid}-reveal)`}>
            <motion.path initial={false} animate={{ d: bandPath(series, hours, capacity) }} transition={morph} fill={`url(#${gid}-band)`} />
            <motion.path
              initial={false}
              animate={{ d: linePath(series, (p) => p.expected, hours, capacity) }}
              transition={morph}
              fill="none"
              stroke="var(--pulse-blue)"
              strokeWidth="2.5"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>
          <line x1={x(0)} x2={x(0)} y1="0" y2={VH} stroke="var(--fg)" strokeOpacity="0.5" vectorEffect="non-scaling-stroke" />
          {stockout ? (
            <line
              x1={x(stockout.hour)}
              x2={x(stockout.hour)}
              y1="0"
              y2={VH}
              stroke="var(--risk-act)"
              strokeDasharray="4 4"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>

        <span aria-hidden className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: 0, top: `${nowY}%` }}>
          <span className="relative block size-3 rounded-full bg-pulse ring-2 ring-surface">
            <span className="ap-loop ap-ping absolute inset-0 rounded-full bg-pulse" data-paused={looping ? "false" : "true"} />
          </span>
        </span>

        {stockout ? (
          <motion.div
            aria-hidden
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduced ? tween(DUR.fast) : { ...SPRING.bounce, delay: DUR.draw }}
            className={cn("absolute -top-1 flex", stockout.hour / hours > 0.7 ? "-translate-x-full" : "")}
            style={{ left: pctX(stockout.hour) }}
          >
            <span
              data-testid="stockout-flag"
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-act px-2 py-0.5 text-[11px] font-semibold text-white shadow-soft"
            >
              <Flag className="size-3" />
              <span className="num">{flagText}</span>
            </span>
          </motion.div>
        ) : null}
      </div>

      <div className="relative mt-1 h-5 text-[11px] text-muted" aria-hidden>
        {TICKS.filter((h) => h <= hours).map((h) => (
          <span
            key={h}
            className={cn("num absolute top-0", h === 0 ? "" : h === hours ? "-translate-x-full" : "-translate-x-1/2")}
            style={{ left: pctX(h) }}
          >
            {h === 0 ? t("runway.now") : localizeDigits(t("runway.hourTick", { hour: h }), digits)}
          </span>
        ))}
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  );
}
