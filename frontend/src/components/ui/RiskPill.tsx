import { useTranslation } from "react-i18next";

import type { RiskLevel } from "../../api/types";
import { cn } from "../../lib/cn";
import { RISK_STYLE } from "./risk";

interface RiskPillProps {
  level: RiskLevel;
  size?: "sm" | "md";
  className?: string;
}

/** Risk as colour + icon + word. The icon pulses only for "Act now". */
export function RiskPill({ level, size = "md", className }: RiskPillProps) {
  const { t } = useTranslation();
  const style = RISK_STYLE[level];
  const Icon = style.icon;
  return (
    <span
      data-level={level}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ring-inset",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-small",
        style.fg,
        style.bg,
        style.ring,
        className,
      )}
    >
      <Icon
        aria-hidden
        data-testid="risk-icon"
        className={cn(size === "sm" ? "size-3.5" : "size-4", level === "red" && "ap-loop ap-risk-pulse")}
      />
      {t(`risk.${level}`)}
    </span>
  );
}
