import { motion } from "motion/react";
import type { ReactNode } from "react";

import { cn } from "../../lib/cn";
import { useReducedMotionPref } from "../../lib/motionPrefs";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { springOr, tween, DUR } from "../../styles/motion";

interface CopilotSheetProps {
  label: string;
  /** Pinned above the conversation (e.g. the human-approval notice). */
  header?: ReactNode;
  /** The scrolling conversation. */
  children: ReactNode;
  /** Pinned below (the composer). */
  footer: ReactNode;
  className?: string;
}

/** Copilot surface: a bottom sheet on phones, a right-hand drawer from 1024px. Rises or slides in once. */
export function CopilotSheet({ label, header, children, footer, className }: CopilotSheetProps) {
  const reduced = useReducedMotionPref();
  const desktop = useMediaQuery("(min-width: 1024px)");
  const from = reduced ? { opacity: 0 } : desktop ? { opacity: 0, x: 32 } : { opacity: 0, y: 48 };

  return (
    <motion.section
      aria-label={label}
      data-testid="copilot-sheet"
      data-variant={desktop ? "drawer" : "sheet"}
      initial={from}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={reduced ? tween(DUR.fast) : springOr(reduced)}
      className={cn(
        "flex min-h-[70dvh] flex-col border border-line bg-surface shadow-lift",
        "rounded-t-[28px] rounded-b-[var(--radius-card)]",
        "lg:sticky lg:top-20 lg:h-[calc(100dvh-7rem)] lg:min-h-0 lg:rounded-[var(--radius-card)]",
        className,
      )}
    >
      {!desktop ? <span aria-hidden className="mx-auto mt-2.5 block h-1.5 w-12 rounded-full bg-line-strong" /> : null}
      {header ? <div className="border-b border-line px-4 py-3">{header}</div> : null}
      <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
      <div className="border-t border-line bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 lg:rounded-b-[var(--radius-card)]">
        {footer}
      </div>
    </motion.section>
  );
}
