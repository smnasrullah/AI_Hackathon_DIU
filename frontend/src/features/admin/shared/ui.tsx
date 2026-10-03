// Small building blocks shared by the admin pages: header, panel, badge, labelled select.
import { CircleAlert, CircleCheck, CircleDashed, CircleDot, type LucideIcon } from "lucide-react";
import { useId, type ReactNode } from "react";

import { cn } from "../../../lib/cn";
import { FIELD } from "./fields";

export function AdminHeader({ title, lead, actions }: { title: string; lead: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="max-w-3xl">
        <h1 className="font-display text-h1 font-bold">{title}</h1>
        <p className="mt-1 text-small text-muted">{lead}</p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

interface PanelProps {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
  className?: string;
  testId?: string;
}

export function Panel({ title, children, aside, className, testId }: PanelProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} data-testid={testId} className={cn("rounded-[var(--radius-card)] border border-line bg-surface p-5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="font-display text-h2 font-bold">
          {title}
        </h2>
        {aside}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export type Tone = "good" | "warn" | "bad" | "neutral";

const TONE: Record<Tone, { icon: LucideIcon; className: string }> = {
  good: { icon: CircleCheck, className: "bg-safe/12 text-safe-fg ring-safe/35" },
  warn: { icon: CircleDot, className: "bg-watch/15 text-watch-fg ring-watch/40" },
  bad: { icon: CircleAlert, className: "bg-act/12 text-act-fg ring-act/40" },
  neutral: { icon: CircleDashed, className: "bg-surface-2 text-muted ring-line" },
};

/** Status as colour + icon + word (never colour alone). */
export function Badge({ tone, children, testId }: { tone: Tone; children: ReactNode; testId?: string }) {
  const { icon: Icon, className } = TONE[tone];
  return (
    <span
      data-tone={tone}
      data-testid={testId}
      className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset", className)}
    >
      <Icon aria-hidden className="size-3.5" />
      {children}
    </span>
  );
}

interface SelectProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}

/** Native select with a visible label: keyboard and screen-reader friendly by default. */
export function FilterSelect<T extends string>({ label, value, options, onChange, className }: SelectProps<T>) {
  const id = useId();
  return (
    <div className={cn("min-w-36", className)}>
      <label htmlFor={id} className="text-xs font-semibold text-muted">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          const hit = options.find((o) => o.value === e.target.value);
          if (hit) onChange(hit.value);
        }}
        className={cn(FIELD, "mt-0.5 min-h-10 text-small")}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Label / value rows for compact facts. */
export function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-1 text-small sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-3 border-b border-line py-1.5">
          <dt className="text-muted">{k}</dt>
          <dd className="num text-right font-semibold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
