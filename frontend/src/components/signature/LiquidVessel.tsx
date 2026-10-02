import { motion } from "motion/react";
import { useId, useRef } from "react";

import type { FloatType, RiskLevel } from "../../api/types";
import { cn } from "../../lib/cn";
import { useLoopActive, useReducedMotionPref } from "../../lib/motionPrefs";
import { SPRING } from "../../styles/motion";
import { RISK_STYLE } from "../ui/risk";

// Geometry in viewBox units: a tall jar for hero art (VesselGauge is the data card).
const W = 160;
const TOP = 12;
const BOTTOM = 212;
const INNER = BOTTOM - TOP;

/** Wave period 40: scrolling by 200 (ap-scroll) is five periods, so the loop is seamless. */
function wavePath(amp: number, phase: number): string {
  let d = `M${-phase} 0`;
  for (let x = -phase; x < W + 240; x += 40) d += ` q10 ${-amp} 20 0 t20 0`;
  return `${d} V${INNER + 24} H${-phase} Z`;
}
const WAVE_FRONT = wavePath(4, 0);
const WAVE_BACK = wavePath(3, 20);

const FLOAT_COLOR: Record<FloatType, string> = { cash: "var(--float-cash)", emoney: "var(--float-emoney)" };

interface LiquidVesselProps {
  /** 0..1 fill. */
  fill: number;
  floatType?: FloatType;
  /** Outline glow by risk. */
  level?: RiskLevel;
  className?: string;
}

/** Decorative tall vessel: two-layer wave, float texture, risk glow. Pair it with a text summary. */
export function LiquidVessel({ fill, floatType = "cash", level = "green", className }: LiquidVesselProps) {
  const reduced = useReducedMotionPref();
  const ref = useRef<SVGSVGElement>(null);
  const looping = useLoopActive(ref);
  const uid = useId().replace(/:/g, "");
  const pct = Math.min(1, Math.max(0, fill));
  const levelY = TOP + (1 - pct) * INNER;
  const color = FLOAT_COLOR[floatType];
  const stroke = RISK_STYLE[level].stroke;

  return (
    <svg ref={ref} aria-hidden viewBox={`0 0 ${W} 224`} className={cn("block h-auto w-full", className)}>
      <defs>
        <clipPath id={`${uid}-jar`}>
          <rect x="8" y={TOP} width={W - 16} height={INNER} rx="40" />
        </clipPath>
        <pattern
          id={`${uid}-tex`}
          width="9"
          height="9"
          patternUnits="userSpaceOnUse"
          patternTransform={floatType === "cash" ? "rotate(45)" : undefined}
        >
          {floatType === "cash" ? (
            <rect width="3" height="9" fill="white" opacity="0.2" />
          ) : (
            <circle cx="4.5" cy="4.5" r="1.4" fill="white" opacity="0.35" />
          )}
        </pattern>
        <linearGradient id={`${uid}-sheen`} x1="0" x2="1">
          <stop offset="0" stopColor="white" stopOpacity="0.22" />
          <stop offset="0.35" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="8" y={TOP} width={W - 16} height={INNER} rx="40" fill="var(--surface-2)" />
      <g clipPath={`url(#${uid}-jar)`}>
        <motion.g initial={false} animate={{ y: levelY }} transition={reduced ? { duration: 0 } : SPRING.soft}>
          <g
            className="ap-loop ap-scroll-x"
            data-paused={looping ? "false" : "true"}
            style={{ animationDuration: "9s", animationDirection: "reverse" }}
          >
            <path d={WAVE_BACK} fill={color} opacity="0.45" />
          </g>
          <g className="ap-loop ap-scroll-x" data-paused={looping ? "false" : "true"} style={{ animationDuration: "6s" }}>
            <path d={WAVE_FRONT} fill={color} opacity="0.92" />
            <path d={WAVE_FRONT} fill={`url(#${uid}-tex)`} />
          </g>
        </motion.g>
        <rect x="8" y={TOP} width={W - 16} height={INNER} fill={`url(#${uid}-sheen)`} />
      </g>
      {[0.25, 0.5, 0.75].map((m) => (
        <line
          key={m}
          x1="16"
          x2="30"
          y1={TOP + m * INNER}
          y2={TOP + m * INNER}
          stroke="var(--fg)"
          strokeOpacity="0.3"
          strokeWidth="1.5"
        />
      ))}
      <rect
        x="8"
        y={TOP}
        width={W - 16}
        height={INNER}
        rx="40"
        fill="none"
        stroke={stroke}
        strokeOpacity="0.85"
        strokeWidth="3"
        style={{ filter: `drop-shadow(0 0 10px ${stroke})` }}
      />
    </svg>
  );
}
