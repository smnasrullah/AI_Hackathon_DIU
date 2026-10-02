import { Check, ShieldCheck } from "lucide-react";
import { motion, useAnimationControls } from "motion/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "../../lib/cn";
import { useReducedMotionPref } from "../../lib/motionPrefs";
import { DUR, MS, tween } from "../../styles/motion";

type HoldState = "idle" | "holding" | "early" | "done";

interface HoldToApproveProps {
  onApprove: () => void;
  label?: string;
  /** Hold time in ms (default 1000). */
  holdMs?: number;
  disabled?: boolean;
  className?: string;
}

const SHAKE = { x: [0, -7, 7, -5, 5, -2, 0] };

/**
 * Press-and-hold to approve: a ring fills over `holdMs`; letting go early shakes and approves nothing.
 * Works with pointer and keyboard (hold Space or Enter). Shows deliberate human oversight.
 */
export function HoldToApprove({ onApprove, label, holdMs = MS.hold, disabled = false, className }: HoldToApproveProps) {
  const { t } = useTranslation();
  const reduced = useReducedMotionPref();
  const [state, setState] = useState<HoldState>("idle");
  const timer = useRef<number | null>(null);
  const shake = useAnimationControls();
  const hintId = useId();

  useEffect(() => {
    const pending = timer;
    return () => {
      if (pending.current !== null) window.clearTimeout(pending.current);
    };
  }, []);

  function clear() {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }

  function start() {
    if (disabled || state === "done" || timer.current !== null) return;
    setState("holding");
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setState("done");
      onApprove();
    }, holdMs);
  }

  function release() {
    if (timer.current === null) return;
    clear();
    setState("early");
    if (!reduced) void shake.start({ ...SHAKE, transition: tween(DUR.slow) });
  }

  function onPointerDown(e: PointerEvent<HTMLButtonElement>) {
    if (e.button > 0) return;
    e.preventDefault();
    start();
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if ((e.key === " " || e.key === "Enter") && !e.repeat) {
      e.preventDefault();
      start();
    }
  }

  function onKeyUp(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === " " || e.key === "Enter") release();
  }

  const done = state === "done";
  const ring = done ? 1 : state === "holding" ? 1 : 0;
  const ringTransition =
    state === "holding" ? { duration: holdMs / 1000, ease: "linear" as const } : tween(reduced ? 0 : DUR.base);
  const message = state === "early" ? t("hold.early") : done ? t("hold.done") : "";

  return (
    <div className={cn("inline-flex flex-col items-start gap-1.5", className)}>
      <motion.button
        type="button"
        animate={shake}
        disabled={disabled}
        aria-describedby={hintId}
        aria-pressed={done}
        data-state={state}
        onPointerDown={onPointerDown}
        onPointerUp={release}
        onPointerLeave={release}
        onPointerCancel={release}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={release}
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
          "relative inline-flex min-h-12 touch-none select-none items-center gap-3 rounded-full py-1.5 pl-1.5 pr-5 font-semibold transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-55",
          done ? "bg-safe text-white" : "bg-fg text-bg",
        )}
      >
        <span className="relative grid size-9 place-items-center rounded-full bg-bg/15">
          <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
            <motion.circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke={done ? "currentColor" : "var(--upay-yellow)"}
              strokeWidth="3"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: ring }}
              transition={ringTransition}
            />
          </svg>
          {done ? <Check aria-hidden className="size-4" /> : <ShieldCheck aria-hidden className="size-4" />}
        </span>
        {done ? t("hold.done") : (label ?? t("hold.label"))}
      </motion.button>
      <p id={hintId} className="text-xs text-muted">
        {t("hold.hint")}
      </p>
      <p aria-live="polite" className={cn("min-h-4 text-xs font-semibold", state === "early" ? "text-act-fg" : "text-safe-fg")}>
        {message}
      </p>
    </div>
  );
}
