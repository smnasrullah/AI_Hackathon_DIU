import { useContext, type ReactNode } from "react";

import { cn } from "../../lib/cn";
import { KitViewContext } from "./kitData";

/** One component's showcase. In "both" view the body renders once per theme, side by side. */
export function KitSection({ id, title, note, children, wide = false }: { id: string; title: string; note?: string; children: ReactNode; wide?: boolean }) {
  const view = useContext(KitViewContext);
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3">
        <h2 id={`${id}-title`} className="font-display text-h2 font-bold">
          {title}
        </h2>
        {note ? <p className="text-small text-muted">{note}</p> : null}
      </div>
      {view === "both" ? (
        <div className={cn("grid gap-4", wide ? "grid-cols-1" : "lg:grid-cols-2")}>
          <ThemePane theme="light">{children}</ThemePane>
          <ThemePane theme="dark">{children}</ThemePane>
        </div>
      ) : (
        <div className="rounded-[var(--radius-card)] border border-dashed border-line p-4 md:p-5">{children}</div>
      )}
    </section>
  );
}

function ThemePane({ theme, children }: { theme: "light" | "dark"; children: ReactNode }) {
  return (
    <div data-theme={theme} className="min-w-0 rounded-[var(--radius-card)] border border-line bg-bg p-4 text-fg md:p-5">
      <p className="mb-3 ap-eyebrow">{theme}</p>
      {children}
    </div>
  );
}

/** A labelled state inside a section ("Loading", "Empty", ...). */
export function KitState({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">{label}</p>
      {children}
    </div>
  );
}
