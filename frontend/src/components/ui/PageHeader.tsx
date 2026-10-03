import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

interface PageHeaderProps {
  title: ReactNode;
  /** One short sentence: what this page is for. */
  description?: ReactNode;
  eyebrow?: ReactNode;
  /** Page-level actions, right-aligned on wide screens, wrapping under the title on phones. */
  actions?: ReactNode;
  /** Extra line under the description (source chips, as-of time). */
  children?: ReactNode;
  headingId?: string;
  className?: string;
}

/** The one page title block: eyebrow, h1, short description, actions. */
export function PageHeader({ title, description, eyebrow, actions, children, headingId, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div className="min-w-0 max-w-3xl">
        {eyebrow ? <p className="ap-eyebrow">{eyebrow}</p> : null}
        <h1 id={headingId} className={cn("font-display text-h1 font-bold text-fg", eyebrow ? "mt-1" : null)}>
          {title}
        </h1>
        {description ? <p className="mt-1.5 max-w-(--prose-max) text-body text-muted">{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
