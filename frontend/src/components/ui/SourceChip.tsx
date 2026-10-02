import { Cpu, Scale, Sparkles, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "../../lib/cn";

export type Source = "model" | "rule" | "ai";

const STYLE: Record<Source, { icon: LucideIcon; className: string }> = {
  model: { icon: Cpu, className: "bg-pulse/12 text-pulse-fg" },
  rule: { icon: Scale, className: "bg-surface-2 text-muted" },
  ai: { icon: Sparkles, className: "bg-brand/20 text-fg" },
};

/** Where a figure or sentence comes from (PRODUCT_CHECKLIST §4): model number, rule/assumption, AI wording. */
export function SourceChip({ source, className }: { source: Source; className?: string }) {
  const { t } = useTranslation();
  const { icon: Icon, className: tone } = STYLE[source];
  return (
    <span
      data-testid="source-chip"
      data-source={source}
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", tone, className)}
    >
      <Icon aria-hidden className="size-3.5" />
      {t(`source.${source}`)}
    </span>
  );
}
