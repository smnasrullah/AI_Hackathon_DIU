import { animate } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { EASE, MS } from "../styles/motion";
import { useReducedMotionPref } from "./motionPrefs";

/** Counts from 0 on first render and from the previous value on change (600ms). */
export function useCountUp(target: number, enabled = true): number {
  const reduced = useReducedMotionPref();
  const live = enabled && !reduced;
  const [shown, setShown] = useState(live ? 0 : target);
  const from = useRef(live ? 0 : target);

  useEffect(() => {
    if (!live) {
      from.current = target;
      return;
    }
    const controls = animate(from.current, target, {
      duration: MS.countUp / 1000,
      ease: EASE,
      onUpdate: (v) => {
        from.current = v;
        setShown(v);
      },
    });
    return () => controls.stop();
  }, [target, live]);

  return live ? shown : target;
}
