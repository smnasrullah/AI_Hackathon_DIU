import { Flag } from "lucide-react";
import { motion } from "motion/react";
import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";

import type { FloatType } from "../../../api/types";
import { EventRibbons, type RunwayEvent } from "../../../components/signature/EventRibbons";
import type { RunwayPoint } from "../../../components/signature/RunwayStrip";
import { cn } from "../../../lib/cn";
import { formatClock, formatDateTime, formatMoney, formatPercent, localizeDigits } from "../../../lib/format";
import { useLoopActive, useReducedMotionPref } from "../../../lib/motionPrefs";
import { useLocale } from "../../../lib/prefs";
import { DUR, SPRING, tween } from "../../../styles/motion";
import type { StockoutFlag } from "../runwayModel";

const VW = 720;
const VH = 280;
const PAD = 12;
const TICKS = [0, 12, 24, 36, 48, 60, 72];
const GRID = [0.25, 0.5, 0.75, 1];
const HOUR_MS = 3_600_000;
const FLOAT_STROKE: Record<FloatType, string> = { cash: "var(--float-cash)", emoney: "var(--float-emoney)" };

interface FanChartProps {
  floatType: FloatType;
  series: RunwayPoint[];
  capacity: number;
  asOf: string;
  stockout: StockoutFlag | null;
  events: RunwayEvent[];
  hours?: number;
}

/** Big low/expected/high balance fan; drag or arrow keys read any hour. */
export function FanChart({ floatType, series, capacity, asOf, stockout, events, hours = 72 }: FanChartProps) {
  const { t } = useTranslation();
  const { lang, digits } = useLocale();
  const reduced = useReducedMotionPref();
  const gid = useId().replace(/:/g, "");
  const plotRef = useRef<HTMLDivElement>(null);
  const looping = useLoopActive(plotRef);
  const [sel, setSel] = useState(0);

  const top = Math.max(capacity, ...series.map((p) => p.high), 1) * 1.05;
  const x = (h: number) => (h / hours) * VW;
  const y = (v: number) => PAD + (1 - Math.max(0, v) / top) * (VH - 2 * PAD);
  const pct = (h: number) => `${(Math.min(hours, Math.max(0, h)) / hours) * 100}%`;
  const line = (pick: (p: RunwayPoint) => number) => series.map((p, i) => `${i ? "L" : "M"}${x(p.hour).toFixed(1)} ${y(pick(p)).toFixed(1)}`).join(" ");
  const band = series.length
    ? `${line((p) => p.high)} ${[...series].reverse().map((p) => `L${x(p.hour).toFixed(1)} ${y(p.low).toFixed(1)}`).join(" ")} Z`
    : "";
  const stroke = FLOAT_STROKE[floatType];
  const morph = reduced ? { duration: 0 } : tween(DUR.slow);

  const point = series.find((p) => p.hour === sel) ?? series[0];
  const money = (v: number) => formatMoney(v, digits, { lang });
  const at = new Date(new Date(asOf).getTime() + sel * HOUR_MS);
  const readout = point ? t("forecast.readout", { time: formatDateTime(at, lang, digits), expected: money(point.expected) }) : "";
  const range = point ? t("forecast.range", { low: money(point.low), high: money(point.high) }) : "";
  const label = t("forecast.chartLabel", { float: t(`float.${floatType}`) });

  function scrub(e: PointerEvent<HTMLDivElement>): void {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    setSel(Math.round(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) * hours));
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>): void {
    const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, PageUp: 12, PageDown: -12 };
    if (e.key === "Home") setSel(0);
    else if (e.key === "End") setSel(hours);
    else if (step[e.key] !== undefined) setSel((s) => Math.min(hours, Math.max(0, s + (step[e.key] ?? 0))));
    else return;
    e.preventDefault();
  }

  return (
    <figure className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-soft">
      <div aria-live="polite" className="min-h-11">
        <p className="num font-semibold">{readout}</p>
        <p className="num text-xs text-muted">{range}</p>
      </div>

      <EventRibbons events={events} hours={hours} className="mt-3" />

      <div
        ref={plotRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={hours}
        aria-valuenow={sel}
        aria-valuetext={`${readout}. ${range}`}
        onPointerDown={scrub}
        onPointerMove={scrub}
        onKeyDown={onKey}
        className="relative mt-2 h-64 cursor-crosshair touch-pan-y rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-pulse md:h-80"
      >
        <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          <defs>
            <clipPath id={`${gid}-reveal`}>
              <motion.rect x="0" y="-20" width={VW} height={VH + 40} initial={{ scaleX: reduced ? 1 : 0 }} animate={{ scaleX: 1 }} transition={reduced ? { duration: 0 } : tween(DUR.draw)} style={{ originX: 0 }} />
            </clipPath>
            <linearGradient id={`${gid}-band`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={stroke} stopOpacity="0.32" />
              <stop offset="1" stopColor={stroke} stopOpacity="0.06" />
            </linearGradient>
          </defs>
          {GRID.map((f) => (
            <line key={f} x1="0" x2={VW} y1={y(top * f)} y2={y(top * f)} stroke="var(--line)" vectorEffect="non-scaling-stroke" />
          ))}
          <line x1="0" x2={VW} y1={y(capacity)} y2={y(capacity)} stroke="var(--line-strong)" strokeDasharray="2 6" vectorEffect="non-scaling-stroke" />
          <line x1="0" x2={VW} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" vectorEffect="non-scaling-stroke" />
          <g clipPath={`url(#${gid}-reveal)`}>
            <motion.path initial={false} animate={{ d: band }} transition={morph} fill={`url(#${gid}-band)`} />
            {[(p: RunwayPoint) => p.low, (p: RunwayPoint) => p.high].map((pick, i) => (
              <motion.path key={i} initial={false} animate={{ d: line(pick) }} transition={morph} fill="none" stroke={stroke} strokeOpacity="0.45" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            ))}
            <motion.path initial={false} animate={{ d: line((p) => p.expected) }} transition={morph} fill="none" stroke={stroke} strokeWidth="3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </g>
          {stockout ? (
            <line x1={x(stockout.hour)} x2={x(stockout.hour)} y1="0" y2={VH} stroke="var(--risk-act)" strokeDasharray="4 4" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          ) : null}
          <line x1={x(sel)} x2={x(sel)} y1="0" y2={VH} stroke="var(--fg)" strokeOpacity="0.35" vectorEffect="non-scaling-stroke" />
        </svg>

        {GRID.map((f) => (
          <span key={f} aria-hidden className="num pointer-events-none absolute right-1 -translate-y-full text-[10px] text-muted" style={{ top: `${(y(top * f) / VH) * 100}%` }}>
            {formatMoney(top * f, digits, { lang, compact: true })}
          </span>
        ))}

        <span aria-hidden className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2" style={{ left: 0, top: `${(y(series[0]?.expected ?? 0) / VH) * 100}%` }}>
          <span className="relative block size-3 rounded-full bg-pulse ring-2 ring-surface">
            <span className="ap-loop ap-ping absolute inset-0 rounded-full bg-pulse" data-paused={looping ? "false" : "true"} />
          </span>
        </span>
        {point ? (
          <span
            aria-hidden
            className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface shadow-soft"
            style={{ left: pct(sel), top: `${(y(point.expected) / VH) * 100}%`, background: stroke }}
          />
        ) : null}

        {stockout ? (
          <motion.div
            aria-hidden
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduced ? tween(DUR.fast) : { ...SPRING.bounce, delay: DUR.draw }}
            className={cn("pointer-events-none absolute -top-1 flex", stockout.hour / hours > 0.7 ? "-translate-x-full" : "")}
            style={{ left: pct(stockout.hour) }}
          >
            <span data-testid="stockout-flag" className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-act-solid px-2 py-0.5 text-[11px] font-semibold text-white shadow-soft">
              <Flag className="size-3" />
              <span className="num">
                {formatClock(new Date(stockout.at), lang, digits)} · {formatPercent(stockout.confidence, digits)}
              </span>
            </span>
          </motion.div>
        ) : null}
      </div>

      <div className="relative mt-1 h-5 text-[11px] text-muted" aria-hidden>
        {TICKS.filter((h) => h <= hours).map((h) => (
          <span key={h} className={cn("num absolute top-0", h === 0 ? "" : h === hours ? "-translate-x-full" : "-translate-x-1/2")} style={{ left: pct(h) }}>
            {h === 0 ? t("runway.now") : localizeDigits(t("runway.hourTick", { hour: h }), digits)}
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">{t("forecast.scrubHint")}</p>
      <figcaption className="sr-only">
        {label}.{" "}
        {stockout
          ? t("runway.stockoutAt", { time: formatClock(new Date(stockout.at), lang, digits), confidence: formatPercent(stockout.confidence, digits) })
          : t("runway.noStockout")}
      </figcaption>
    </figure>
  );
}
