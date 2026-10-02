import { motion } from "motion/react";

import { cn } from "../../lib/cn";
import { useReducedMotionPref } from "../../lib/motionPrefs";
import { DUR, tween } from "../../styles/motion";

/** SVG path over a 100 x 32 box (min at the bottom, max at the top). */
function sparkPath(values: number[]): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  return values
    .map((v, i) => `${i ? "L" : "M"}${((i / (values.length - 1)) * 100).toFixed(1)} ${(28 - ((v - min) / span) * 24).toFixed(1)}`)
    .join(" ");
}

interface SparklineProps {
  values: number[];
  /** Text alternative (the line itself is decoration). */
  label: string;
  stroke?: string;
  className?: string;
}

/** Small trend line that draws in once (static under reduced motion). */
export function Sparkline({ values, label, stroke = "var(--pulse-blue)", className }: SparklineProps) {
  const reduced = useReducedMotionPref();
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label={label} className={cn("h-10 w-full", className)}>
      <motion.path
        d={sparkPath(values)}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        initial={{ pathLength: reduced ? 1 : 0 }}
        animate={{ pathLength: 1 }}
        transition={reduced ? { duration: 0 } : tween(DUR.draw)}
      />
    </svg>
  );
}
