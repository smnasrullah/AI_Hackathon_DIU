import type { LucideIcon } from "lucide-react";
import { AnimatePresence, motion, useMotionValue, useSpring, type HTMLMotionProps } from "motion/react";
import { forwardRef, useState, type PointerEvent, type ReactNode } from "react";

import { cn } from "../../lib/cn";
import { useReducedMotionPref } from "../../lib/motionPrefs";
import { DUR, MAGNET_MAX_PX, PRESS_SCALE, SPRING, tween } from "../../styles/motion";
import { PulseLine } from "../signature/PulseLine";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT: Record<Variant, string> = {
  primary: "bg-primary text-on-primary shadow-soft hover:bg-primary-hover",
  secondary: "border border-line-strong bg-surface text-fg shadow-xs hover:bg-surface-2",
  ghost: "text-fg hover:bg-surface-2",
  danger: "bg-act-solid text-white shadow-soft hover:brightness-105",
};

const SIZE = {
  sm: "min-h-9 px-3 text-small gap-1.5",
  md: "min-h-11 px-5 text-body gap-2",
  lg: "min-h-13 px-6 text-body gap-2.5",
} as const;

export interface LiquidButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  children: ReactNode;
  variant?: Variant;
  size?: keyof typeof SIZE;
  icon?: LucideIcon;
  loading?: boolean;
}

interface Ripple {
  id: number;
  x: number;
  y: number;
  d: number;
}

function finePointer(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

/** Press scales to .97, a liquid ripple spreads from the click point; primary has a magnetic hover on desktop. */
export const LiquidButton = forwardRef<HTMLButtonElement, LiquidButtonProps>(function LiquidButton(
  { children, variant = "primary", size = "md", icon: Icon, loading = false, className, disabled, onPointerDown, onPointerMove, onPointerLeave, type = "button", ...rest },
  ref,
) {
  const reduced = useReducedMotionPref();
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const mx = useSpring(useMotionValue(0), SPRING.snappy);
  const my = useSpring(useMotionValue(0), SPRING.snappy);
  const magnetic = variant === "primary" && !reduced;

  function handleDown(e: PointerEvent<HTMLButtonElement>) {
    onPointerDown?.(e);
    if (reduced || disabled || loading) return;
    const box = e.currentTarget.getBoundingClientRect();
    setRipples((r) => [...r, { id: e.timeStamp, x: e.clientX - box.left, y: e.clientY - box.top, d: Math.max(box.width, box.height) * 2.2 }]);
  }

  function handleMove(e: PointerEvent<HTMLButtonElement>) {
    onPointerMove?.(e);
    if (!magnetic || e.pointerType !== "mouse" || !finePointer()) return;
    const box = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - box.left - box.width / 2) / (box.width / 2);
    const dy = (e.clientY - box.top - box.height / 2) / (box.height / 2);
    mx.set(dx * MAGNET_MAX_PX);
    my.set(dy * MAGNET_MAX_PX);
  }

  function handleLeave(e: PointerEvent<HTMLButtonElement>) {
    onPointerLeave?.(e);
    mx.set(0);
    my.set(0);
  }

  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      whileTap={disabled || loading ? undefined : { scale: PRESS_SCALE }}
      transition={tween(DUR.fast)}
      style={{ x: mx, y: my }}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      className={cn(
        "relative isolate inline-flex select-none items-center justify-center overflow-hidden rounded-[var(--radius-input)] font-semibold transition-[filter,background-color] duration-200 disabled:cursor-not-allowed disabled:opacity-55",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      <AnimatePresence>
        {ripples.map((r) => (
          <motion.span
            key={r.id}
            aria-hidden
            className="pointer-events-none absolute -z-10 rounded-full bg-current"
            style={{ left: r.x - r.d / 2, top: r.y - r.d / 2, width: r.d, height: r.d }}
            initial={{ scale: 0, opacity: 0.22 }}
            animate={{ scale: 1, opacity: 0 }}
            transition={tween(DUR.reveal)}
            onAnimationComplete={() => setRipples((all) => all.filter((x) => x.id !== r.id))}
          />
        ))}
      </AnimatePresence>
      {loading ? (
        <span className="w-8" aria-hidden>
          <PulseLine mode="line" className="h-5" />
        </span>
      ) : Icon ? (
        <Icon aria-hidden className="size-4 shrink-0" />
      ) : null}
      <span>{children}</span>
    </motion.button>
  );
});
