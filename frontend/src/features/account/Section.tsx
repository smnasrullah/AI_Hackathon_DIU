import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

/** Calm card section for account, help and about pages. */
export function Section({ title, children, className, id }: { title: string; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} aria-label={title} className={cn("ap-card p-5 md:p-6", className)}>
      <h2 className="mb-4 font-display text-h2 font-bold">{title}</h2>
      {children}
    </section>
  );
}
