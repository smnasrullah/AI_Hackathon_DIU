import { Clock, RotateCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useFreshness } from "../../api/hooks/system";
import { Skeleton } from "../../components/ui/Skeleton";
import { cn } from "../../lib/cn";
import { formatRelative, localizeDigits } from "../../lib/format";
import { useLocale } from "../../lib/prefs";
import { useNow } from "../../lib/useNow";

const CHIP = "inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-xs";

/** "Updated 2 min ago · model v3" from GET /system/freshness. */
export function FreshnessChip({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { lang, digits } = useLocale();
  const now = useNow();
  const q = useFreshness();

  if (q.isPending) return <Skeleton className={cn("h-8 w-48 rounded-full", className)} />;
  if (q.isError) {
    return (
      <button type="button" onClick={() => void q.refetch()} className={cn(CHIP, "text-muted hover:text-fg", className)}>
        <RotateCw aria-hidden className="size-3.5" />
        {t("freshness.error")} · {t("common.retry")}
      </button>
    );
  }
  const model = q.data.model_version ? localizeDigits(q.data.model_version, digits) : t("freshness.unknown");
  const text = q.data.last_forecast_at
    ? t("freshness.label", { ago: formatRelative(new Date(q.data.last_forecast_at), now, lang, digits), model })
    : t("freshness.noForecast", { model });
  return (
    <span className={cn(CHIP, "text-muted", className)} title={`${t("freshness.title")}: ${text}`} data-testid="freshness-chip">
      <Clock aria-hidden className="size-3.5 shrink-0" />
      {/* One line, as tall as its skeleton: wrapping on a phone pushed the page down. */}
      <span className="min-w-0 truncate">{text}</span>
    </span>
  );
}
