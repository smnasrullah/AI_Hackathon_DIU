import type { LucideIcon } from "lucide-react";
import { motion, useMotionValue, useSpring } from "motion/react";
import { useId, useRef, type PointerEvent, type ReactNode } from "react";

import type { RiskLevel } from "../../api/types";
import { cn } from "../../lib/cn";
import { formatDuration, formatMoney, formatNumber, formatPercent } from "../../lib/format";
import { useOnScreen, useReducedMotionPref } from "../../lib/motionPrefs";
import { useLocale } from "../../lib/prefs";
import { useCountUp } from "../../lib/useCountUp";
import { DUR, REDUCED, revealVariants, SPRING, TILT_MAX_DEG, tween } from "../../styles/motion";
import { RISK_STYLE } from "../ui/risk";

type ValueFormat = "number" | "money" | "percent" | "hours";

interface BentoTileProps {
  title: string;
  value: number;
  format?: ValueFormat;
  icon?: LucideIcon;
  sparkline?: number[];
  tone?: RiskLevel;
  footer?: ReactNode;
  className?: string;
}

function sparkPath(values: number[]): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  return values
    .map((v, i) => `${i ? "L" : "M"}${((i / (values.length - 1)) * 100).toFixed(1)} ${(28 - ((v - min) / span) * 24).toFixed(1)}`)
    .join(" ");
}

function finePointer(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

/** KPI tile: count-up value, sparkline drawing in, 3D tilt on hover (max 6deg, desktop). Inside a StaggerGroup it staggers in. */
export function BentoTile({ title, value, format = "number", icon: Icon, sparkline, tone, footer, className }: BentoTileProps) {
  const { lang, digits } = useLocale();
  const reduced = useReducedMotionPref();
  const ref = useRef<HTMLDivElement>(null);
  const seen = useOnScreen(ref, true);
  const shown = useCountUp(seen ? value : 0);
  const rx = useSpring(useMotionValue(0), SPRING.soft);
  const ry = useSpring(useMotionValue(0), SPRING.soft);
  const gid = useId().replace(/:/g, "");
  const accent = tone ? RISK_STYLE[tone].stroke : "var(--pulse-blue)";

  const text =
    format === "money"
      ? formatMoney(shown, digits, { compact: value >= 1e5, lang })
      : format === "percent"
        ? formatPercent(shown, digits)
        : format === "hours"
          ? formatDuration(shown, lang, digits)
          : formatNumber(shown, digits);
  const finalText =
    format === "money"
      ? formatMoney(value, digits, { compact: value >= 1e5, lang })
      : format === "percent"
        ? formatPercent(value, digits)
        : format === "hours"
          ? formatDuration(value, lang, digits)
          : formatNumber(value, digits);

  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (reduced || e.pointerType !== "mouse" || !finePointer()) return;
    const box = e.currentTarget.getBoundingClientRect();
    ry.set(((e.clientX - box.left) / box.width - 0.5) * 2 * TILT_MAX_DEG);
    rx.set(-((e.clientY - box.top) / box.height - 0.5) * 2 * TILT_MAX_DEG);
  }

  function onLeave() {
    rx.set(0);
    ry.set(0);
  }

  return (
    <motion.div
      ref={ref}
      variants={revealVariants(reduced)}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 800 }}
      className={cn("relative overflow-hidden ap-card p-5 shadow-soft", className)}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-small font-semibold text-muted">{title}</p>
        {Icon ? (
          <span className="grid size-9 place-items-center rounded-full" style={{ background: `color-mix(in srgb, ${accent} 14%, transparent)`, color: accent }}>
            <Icon aria-hidden className="size-4" />
          </span>
        ) : null}
      </div>
      <p className="num mt-2 font-display text-h1 font-bold">
        <span className="sr-only">{finalText}</span>
        <span aria-hidden>{text}</span>
      </p>
      {sparkline && sparkline.length > 1 ? (
        <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="mt-3 h-10 w-full" aria-hidden>
          <defs>
            <linearGradient id={`${gid}-fill`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={accent} stopOpacity="0.25" />
              <stop offset="1" stopColor={accent} stopOpacity="0" />
            </linearGradient>
          </defs>
          <motion.path
            d={`${sparkPath(sparkline)} L100 32 L0 32 Z`}
            fill={`url(#${gid}-fill)`}
            initial={{ opacity: 0 }}
            animate={{ opacity: seen ? 1 : 0 }}
            transition={reduced ? REDUCED : tween(DUR.reveal, DUR.slow)}
          />
          <motion.path
            d={sparkPath(sparkline)}
            fill="none"
            stroke={accent}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            initial={{ pathLength: reduced ? 1 : 0 }}
            animate={{ pathLength: seen ? 1 : 0 }}
            transition={reduced ? { duration: 0 } : tween(DUR.draw)}
          />
        </svg>
      ) : null}
      {footer ? <div className="mt-3">{footer}</div> : null}
    </motion.div>
  );
}
