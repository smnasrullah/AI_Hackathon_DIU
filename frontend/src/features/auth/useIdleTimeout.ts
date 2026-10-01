import { useEffect, useRef, useState } from "react";

import { broadcast, subscribe } from "./sessionChannel";

export const IDLE_MS = 15 * 60_000;
export const WARNING_MS = 60_000;
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
const BROADCAST_EVERY_MS = 30_000;
const TICK_MS = 1000;

export interface IdleState {
  warning: boolean;
  secondsLeft: number;
  stay: () => void;
}

interface View {
  warning: boolean;
  secondsLeft: number;
}

/**
 * After `idleMs` without input (in any tab) shows a warning; after `warningMs` more calls
 * `onTimeout`. Input while the warning is open does not dismiss it: the user must choose.
 */
export function useIdleTimeout(
  enabled: boolean,
  onTimeout: () => void,
  idleMs = IDLE_MS,
  warningMs = WARNING_MS,
): IdleState {
  const hidden: View = { warning: false, secondsLeft: Math.ceil(warningMs / 1000) };
  const [view, setView] = useState<View>(hidden);
  const lastActive = useRef(0);
  const lastBroadcast = useRef(0);
  const warningSince = useRef<number | null>(null);
  const timeoutRef = useRef(onTimeout);

  useEffect(() => {
    timeoutRef.current = onTimeout;
  });

  useEffect(() => {
    if (!enabled) return undefined;
    lastActive.current = Date.now();
    warningSince.current = null;
    const markActive = () => {
      lastActive.current = Date.now();
      if (lastActive.current - lastBroadcast.current > BROADCAST_EVERY_MS) {
        lastBroadcast.current = lastActive.current;
        broadcast({ type: "activity" });
      }
    };
    const unsubscribe = subscribe((msg) => {
      if (msg.type === "activity") lastActive.current = Date.now();
    });
    const show = (next: View) =>
      setView((prev) =>
        prev.warning === next.warning && prev.secondsLeft === next.secondsLeft ? prev : next,
      );
    const tick = window.setInterval(() => {
      const t = Date.now();
      if (warningSince.current === null && t - lastActive.current >= idleMs) {
        warningSince.current = t;
      }
      const since = warningSince.current;
      if (since === null) {
        show({ warning: false, secondsLeft: Math.ceil(warningMs / 1000) });
      } else if (t - since >= warningMs) {
        warningSince.current = null;
        show({ warning: false, secondsLeft: Math.ceil(warningMs / 1000) });
        timeoutRef.current();
      } else {
        show({ warning: true, secondsLeft: Math.ceil((warningMs - (t - since)) / 1000) });
      }
    }, TICK_MS);
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, markActive, { passive: true }));
    return () => {
      unsubscribe();
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, markActive));
      window.clearInterval(tick);
      warningSince.current = null;
    };
  }, [enabled, idleMs, warningMs]);

  return {
    warning: enabled && view.warning,
    secondsLeft: view.secondsLeft,
    stay: () => {
      lastActive.current = Date.now();
      warningSince.current = null;
      setView(hidden);
    },
  };
}
