import { CircleAlert, CircleCheck, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Card used by sign-up, forgot and reset password: eyebrow, title, lead, then the form. */
export function AuthCard({ eyebrow, title, subtitle, children, testId }: { eyebrow: string; title: string; subtitle?: string; children: ReactNode; testId?: string }) {
  return (
    <div className="mx-auto w-full max-w-md py-4 lg:py-10" data-testid={testId}>
      <div className="ap-card p-6 shadow-lift md:p-8">
        <p className="ap-eyebrow">{eyebrow}</p>
        <h1 className="mt-2 font-display text-h1 font-bold">{title}</h1>
        {subtitle ? <p className="mt-1 text-body text-muted">{subtitle}</p> : null}
        {children}
      </div>
    </div>
  );
}

/** Server error under a form (generic wording; never says which field was wrong). */
export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-input)] border border-act/40 bg-act/8 px-3 py-2 text-small">
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-act-fg" aria-hidden />
      <span>{message}</span>
    </p>
  );
}

/** Outcome panel that replaces the form once it is done (pending approval, link sent, reset). */
export function OutcomePanel({ icon: Icon = CircleCheck, title, body, children, testId }: { icon?: LucideIcon; title: string; body: string; children?: ReactNode; testId?: string }) {
  return (
    <div role="status" className="mt-6 rounded-[var(--radius-input)] border border-line bg-surface-2 p-4" data-testid={testId}>
      <p className="flex items-center gap-2 font-semibold">
        <Icon aria-hidden className="size-5 shrink-0 text-pulse-fg" />
        {title}
      </p>
      <p className="mt-2 text-small text-muted">{body}</p>
      {children}
    </div>
  );
}
