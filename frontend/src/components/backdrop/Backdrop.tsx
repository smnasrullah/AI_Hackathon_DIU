import { useRef } from "react";

import { cn } from "../../lib/cn";
import { IS_LOW_END, useLoopActive } from "../../lib/motionPrefs";

/** Aurora mesh (hero + empty states only): three blurred blobs drifting 40-60s. */
export function Aurora({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const active = useLoopActive(ref);
  return (
    <div ref={ref} aria-hidden className={cn("ap-aurora", className)} data-paused={active ? "false" : "true"}>
      {IS_LOW_END ? null : (
        <>
          <span className="ap-loop" />
          <span className="ap-loop" />
          <span className="ap-loop" />
        </>
      )}
    </div>
  );
}

/**
 * Fixed, behind-everything page background: static gradient mesh + faint wave lines that drift
 * over minutes (stopped for reduced motion / low-end). Parent must be `relative isolate`.
 */
export function PageBackdrop() {
  return (
    <div aria-hidden data-testid="page-backdrop" className="ap-backdrop">
      <div className="ap-backdrop-waves ap-backdrop-waves--top" />
      <div className="ap-backdrop-waves" />
    </div>
  );
}

/** 3-4% grain from a pre-rendered tile. */
export function Grain({ className }: { className?: string }) {
  return <div aria-hidden className={cn("ap-grain", className)} />;
}
