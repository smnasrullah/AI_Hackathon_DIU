import { RotateCw, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "../../lib/cn";
import { useLoopActive, useReducedMotionPref } from "../../lib/motionPrefs";
import { revealVariants } from "../../styles/motion";
import { Aurora } from "../backdrop/Backdrop";
import { Illustration, type IllustrationKind } from "./Illustrations";
import { LiquidButton } from "./LiquidButton";

interface PanelProps {
  illustration: IllustrationKind;
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void; icon?: LucideIcon; busy?: boolean };
  role?: "alert";
  compact?: boolean;
  className?: string;
}

/** Aurora is for hero and empty states only; errors stay plain. */
function Panel({ illustration, title, body, action, role, compact, className }: PanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const active = useLoopActive(ref);
  const reduced = useReducedMotionPref();
  return (
    <motion.div
      ref={ref}
      role={role}
      variants={revealVariants(reduced)}
      initial="hidden"
      animate="show"
      data-paused={active ? "false" : "true"}
      className={cn(
        "relative isolate overflow-hidden ap-card text-center",
        compact ? "px-4 py-6" : "px-6 py-10",
        className,
      )}
    >
      {role === "alert" ? null : <Aurora className="-z-10" />}
      <div className={cn("mx-auto", compact ? "h-20 w-28" : "h-28 w-36")}>
        <Illustration kind={illustration} />
      </div>
      <p className="mt-3 font-display text-h2 font-bold">{title}</p>
      {body ? <p className="mx-auto mt-1 max-w-sm text-small text-muted">{body}</p> : null}
      {action ? (
        <LiquidButton variant="secondary" className="mt-5" onClick={action.onClick} loading={action.busy} icon={action.icon}>
          {action.label}
        </LiquidButton>
      ) : null}
    </motion.div>
  );
}

interface EmptyStateProps {
  title?: string;
  body?: string;
  illustration?: Exclude<IllustrationKind, "cracked-vessel">;
  /** Every empty state offers a next step. */
  action: { label: string; onClick: () => void; icon?: LucideIcon };
  compact?: boolean;
  className?: string;
}

export function EmptyState({ title, body, illustration = "empty-runway", action, compact, className }: EmptyStateProps) {
  const { t } = useTranslation();
  return (
    <Panel illustration={illustration} title={title ?? t("state.emptyTitle")} body={body} action={action} compact={compact} className={className} />
  );
}

interface ErrorStateProps {
  title?: string;
  body?: string;
  onRetry: () => void;
  retrying?: boolean;
  compact?: boolean;
  className?: string;
}

export function ErrorState({ title, body, onRetry, retrying = false, compact, className }: ErrorStateProps) {
  const { t } = useTranslation();
  return (
    <Panel
      role="alert"
      illustration="cracked-vessel"
      title={title ?? t("state.errorTitle")}
      body={body ?? t("state.errorBody")}
      action={{ label: t(retrying ? "common.retrying" : "common.retry"), onClick: onRetry, icon: RotateCw, busy: retrying }}
      compact={compact}
      className={className}
    />
  );
}
