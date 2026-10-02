import { useId, useRef } from "react";
import { useTranslation } from "react-i18next";

import type { RiskLevel } from "../../api/types";
import { cn } from "../../lib/cn";
import { useLoopActive } from "../../lib/motionPrefs";
import { RISK_STYLE } from "../ui/risk";

/** One ECG beat across 200 units; drawn twice so the loop can scroll by exactly one beat. */
const BEAT = "M0 20 H70 L78 20 L84 8 L92 34 L100 4 L106 26 L112 20 H200";
const SPEED_S: Record<RiskLevel, number> = { green: 3.2, amber: 1.8, red: 0.9 };

interface PulseLineProps {
  level?: RiskLevel;
  /** "loader": announces loading; "progress": thin route-progress bar. */
  mode?: "line" | "loader" | "progress";
  label?: string;
  className?: string;
}

/** Brand ECG line: calm and slow when safe, faster amber/red as risk rises. Also the loader. */
export function PulseLine({ level = "green", mode = "line", label, className }: PulseLineProps) {
  const { t } = useTranslation();
  const ref = useRef<SVGSVGElement>(null);
  const active = useLoopActive(ref);
  const fadeId = useId();
  const color = mode === "line" ? RISK_STYLE[level].stroke : "var(--pulse-blue)";
  const svg = (
    <svg
      ref={ref}
      viewBox="0 0 200 40"
      preserveAspectRatio="none"
      aria-hidden
      className={cn("block w-full", mode === "progress" ? "h-1" : "h-8", mode === "line" && className)}
    >
      <defs>
        <linearGradient id={fadeId}>
          <stop offset="0" stopColor={color} stopOpacity="0" />
          <stop offset="0.25" stopColor={color} />
          <stop offset="0.75" stopColor={color} />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <g
        className="ap-loop ap-scroll-x"
        data-paused={active ? "false" : "true"}
        style={{ animationDuration: `${SPEED_S[level]}s` }}
      >
        {[0, 200].map((x) => (
          <path
            key={x}
            d={BEAT}
            transform={`translate(${x} 0)`}
            fill="none"
            stroke={`url(#${fadeId})`}
            strokeWidth={mode === "progress" ? 6 : 2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
    </svg>
  );
  if (mode === "line") return svg;
  return (
    <div role="status" className={cn("w-full", className)}>
      {svg}
      <span className="sr-only">{label ?? t("common.loading")}</span>
    </div>
  );
}
