// DESIGN.md §2 motion language. Every animation takes its timing from here; no ad-hoc values.
import type { Transition, Variants } from "motion/react";

export const EASE = [0.2, 0.8, 0.2, 1] as const;

/** Seconds, for motion. CSS mirrors these as --dur-* in tokens.css. */
export const DUR = { fast: 0.12, base: 0.2, slow: 0.32, reveal: 0.6, draw: 0.7 } as const;

/** Milliseconds, for timers and count-ups. */
export const MS = { fast: 120, base: 200, slow: 320, reveal: 600, draw: 700, countUp: 600, hold: 1000 } as const;

export const STAGGER = 0.04;
export const PRESS_SCALE = 0.97;
export const TILT_MAX_DEG = 6;
export const MAGNET_MAX_PX = 4;

export const SPRING = {
  soft: { type: "spring", stiffness: 120, damping: 18 },
  snappy: { type: "spring", stiffness: 300, damping: 28 },
  /** Stockout flag drop: snappy with a little bounce. */
  bounce: { type: "spring", stiffness: 300, damping: 14 },
} as const satisfies Record<string, Transition>;

export const tween = (duration: number = DUR.base, delay = 0): Transition => ({
  duration,
  delay,
  ease: EASE,
});

/** Reduced motion keeps short opacity fades only. */
export const REDUCED: Transition = { duration: DUR.fast, ease: EASE };

/** Page transition: fade + 12px rise, 220ms. */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  enter: { opacity: 1, y: 0, transition: tween(0.22) },
  exit: { opacity: 0, transition: tween(DUR.fast) },
};

export const fadeRise: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: tween(DUR.slow) },
};

export const fadeOnly: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: REDUCED },
};

export const listStagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: STAGGER } },
};

/** Pick the reduced variant set when motion is off. */
export function revealVariants(reduced: boolean): Variants {
  return reduced ? fadeOnly : fadeRise;
}

/** Transition for a value change: soft spring, or a plain fade-speed tween when reduced. */
export function springOr(reduced: boolean, spring: Transition = SPRING.soft): Transition {
  return reduced ? { duration: 0 } : spring;
}
