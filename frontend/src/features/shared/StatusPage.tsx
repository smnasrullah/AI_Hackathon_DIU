import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { useRef } from "react";
import { Link } from "react-router-dom";

import { Aurora } from "../../components/backdrop/Backdrop";
import { Illustration, type IllustrationKind } from "../../components/ui/Illustrations";
import { LiquidButton } from "../../components/ui/LiquidButton";
import { cn } from "../../lib/cn";
import { useLoopActive, useReducedMotionPref } from "../../lib/motionPrefs";
import { usePageTitle } from "../../lib/usePageTitle";
import { listStagger, REDUCED, revealVariants, SPRING, STAGGER } from "../../styles/motion";

/** A link (`to`) for navigation, or a button (`onClick`) for retry / back. */
export type StatusAction = {
  label: string;
  icon?: LucideIcon;
  variant?: "primary" | "secondary";
} & ({ to: string; onClick?: never } | { onClick: () => void; to?: never });

const LINK_STYLE: Record<"primary" | "secondary", string> = {
  primary: "bg-brand text-on-brand shadow-soft hover:brightness-105",
  secondary: "border border-line-strong bg-surface text-fg hover:bg-surface-2",
};

function ActionLink({ action }: { action: StatusAction & { to: string } }) {
  const Icon = action.icon;
  return (
    <Link
      to={action.to}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-input)] px-5 font-semibold transition-[filter,background-color] duration-200",
        LINK_STYLE[action.variant ?? "primary"],
      )}
    >
      {Icon ? <Icon aria-hidden className="size-4 shrink-0" /> : null}
      {action.label}
    </Link>
  );
}

interface StatusPageProps {
  code: "403" | "404" | "500";
  illustration: IllustrationKind;
  title: string;
  body: string;
  pageTitle: string;
  actions: StatusAction[];
}

/** Animated 403/404/500: the code drops in digit by digit, then a clear next step. */
export function StatusPage({ code, illustration, title, body, pageTitle, actions }: StatusPageProps) {
  const reduced = useReducedMotionPref();
  const ref = useRef<HTMLElement>(null);
  const active = useLoopActive(ref);
  usePageTitle(pageTitle);
  const item = revealVariants(reduced);

  return (
    <motion.section
      ref={ref}
      variants={listStagger}
      initial="hidden"
      animate="show"
      data-paused={active ? "false" : "true"}
      className="relative isolate mx-auto mt-6 max-w-xl overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface px-6 py-10 text-center"
    >
      <Aurora className="-z-10" />
      <p aria-hidden className="flex justify-center gap-1 font-mono text-display-xl font-medium text-muted">
        {Array.from(code).map((d, i) => (
          <motion.span
            key={i}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduced ? REDUCED : { ...SPRING.bounce, delay: i * STAGGER }}
          >
            {d}
          </motion.span>
        ))}
      </p>
      <motion.div variants={item} className="mx-auto mt-2 h-28 w-36">
        <Illustration kind={illustration} />
      </motion.div>
      <motion.h1 variants={item} className="mt-4 font-display text-h1 font-bold">
        {title}
      </motion.h1>
      <motion.p variants={item} className="mx-auto mt-2 max-w-md text-muted">
        {body}
      </motion.p>
      <motion.div variants={item} className="mt-6 flex flex-wrap justify-center gap-2">
        {actions.map((a) =>
          a.to !== undefined ? (
            <ActionLink key={a.label} action={a} />
          ) : (
            <LiquidButton key={a.label} variant={a.variant ?? "primary"} icon={a.icon} onClick={a.onClick}>
              {a.label}
            </LiquidButton>
          ),
        )}
      </motion.div>
    </motion.section>
  );
}
