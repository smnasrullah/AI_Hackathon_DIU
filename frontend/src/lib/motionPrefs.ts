import { useReducedMotion } from "motion/react";
import { createContext, useContext, useEffect, useState, type RefObject } from "react";

/** null = follow the OS; true/false = forced (the /dev/kit toggle). */
export const ReducedOverride = createContext<boolean | null>(null);

/** Low-end devices (<= 4 cores) skip aurora, particles and blur. */
export const IS_LOW_END =
  typeof navigator !== "undefined" && typeof navigator.hardwareConcurrency === "number"
    ? navigator.hardwareConcurrency <= 4
    : false;

/** True when motion should be calm: OS preference or the forced override. */
export function useReducedMotionPref(): boolean {
  const forced = useContext(ReducedOverride);
  const os = useReducedMotion() ?? false;
  return forced ?? os;
}

export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible;
}

/** In-viewport flag. Without IntersectionObserver (tests, old browsers) it reports true. */
export function useOnScreen(ref: RefObject<Element | null>, once = false): boolean {
  const [onScreen, setOnScreen] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => {
      const hit = entry?.isIntersecting ?? false;
      if (once && !hit) return;
      setOnScreen(hit);
      if (hit && once) io.disconnect();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, once]);
  return onScreen;
}

/** Loops run only when motion is allowed, the tab is visible and the element is on screen. */
export function useLoopActive(ref: RefObject<Element | null>): boolean {
  const reduced = useReducedMotionPref();
  const visible = usePageVisible();
  const onScreen = useOnScreen(ref);
  return !reduced && visible && onScreen;
}
