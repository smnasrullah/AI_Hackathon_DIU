import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "../../lib/cn";

interface StatChipProps {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  /** Change since last period; `good` says whether the direction is good news. */
  delta?: { text: string; direction: "up" | "down"; good: boolean };
  className?: string;
}

export function StatChip({ label, value, icon: Icon, delta, className }: StatChipProps) {
  const { t } = useTranslation();
  const DeltaIcon = delta?.direction === "up" ? ArrowUpRight : ArrowDownRight;
  return (
    <div className={cn("inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1.5 pl-2.5 pr-3", className)}>
      {Icon ? <Icon aria-hidden className="size-4 text-muted" /> : null}
      <span className="text-small text-muted">{label}</span>
      <span className="num text-small font-semibold">{value}</span>
      {delta ? (
        <span className={cn("inline-flex items-center text-xs font-semibold", delta.good ? "text-safe-fg" : "text-act-fg")}>
          <DeltaIcon aria-hidden className="size-3.5" />
          <span className="sr-only">{t(delta.direction === "up" ? "stat.up" : "stat.down", { value: delta.text })}</span>
          <span aria-hidden className="num">{delta.text}</span>
        </span>
      ) : null}
    </div>
  );
}
