import { MotionConfig, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import { IS_LOW_END, ReducedOverride } from "../../lib/motionPrefs";

/** Applies the reduced-motion choice to motion components and CSS loops (.ap-loop) below it. */
export function MotionPrefs({ reduced = null, children }: { reduced?: boolean | null; children: ReactNode }) {
  const os = useReducedMotion() ?? false;
  const effective = reduced ?? os;
  return (
    <ReducedOverride.Provider value={reduced}>
      <MotionConfig reducedMotion={effective ? "always" : "never"}>
        <div
          className="contents"
          data-reduced-motion={effective ? "true" : "false"}
          data-low-end={IS_LOW_END ? "true" : "false"}
        >
          {children}
        </div>
      </MotionConfig>
    </ReducedOverride.Provider>
  );
}
