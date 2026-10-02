import { CircleCheck, CircleDot, CircleSlash, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { AnomalyStatus } from "../../../api/types";
import { cn } from "../../../lib/cn";

const STYLE: Record<AnomalyStatus, { icon: LucideIcon; className: string }> = {
  open: { icon: CircleDot, className: "bg-watch/15 text-watch-fg ring-watch/40" },
  confirmed: { icon: CircleCheck, className: "bg-act/12 text-act-fg ring-act/40" },
  dismissed: { icon: CircleSlash, className: "bg-surface-2 text-muted ring-line" },
};

/** Review state as icon + word. */
export function AnomalyStatusBadge({ status }: { status: AnomalyStatus }) {
  const { t } = useTranslation();
  const { icon: Icon, className } = STYLE[status];
  return (
    <span data-status={status} className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset", className)}>
      <Icon aria-hidden className="size-3.5" />
      {t(`anomalies.status.${status}`)}
    </span>
  );
}
