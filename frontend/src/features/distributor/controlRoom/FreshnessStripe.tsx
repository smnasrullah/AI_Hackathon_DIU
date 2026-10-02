import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { MAP_POLL_MS } from "../../../api/hooks/map";
import { FreshnessChip } from "../../../app/shell/FreshnessChip";
import { cn } from "../../../lib/cn";
import { formatRelative, localizeDigits } from "../../../lib/format";
import { useLocale } from "../../../lib/prefs";
import { useNow } from "../../../lib/useNow";

interface FreshnessStripeProps {
  /** When the map payload last arrived (ms epoch, 0 = never). */
  updatedAt: number;
  fetching: boolean;
  onRefresh: () => void;
}

/** Bottom stripe: forecast freshness chip, when the map was last checked, manual refresh. */
export function FreshnessStripe({ updatedAt, fetching, onRefresh }: FreshnessStripeProps) {
  const { t } = useTranslation();
  const { lang, digits } = useLocale();
  const now = useNow(15_000);
  const checked = updatedAt ? formatRelative(new Date(updatedAt), now, lang, digits) : "—";

  return (
    <footer className="glass flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl px-3 py-2 text-xs text-muted" data-testid="freshness-stripe">
      <FreshnessChip />
      <span aria-live="polite">
        {t("controlRoom.stripe.checked", { ago: checked })} ·{" "}
        {localizeDigits(t("controlRoom.stripe.poll", { seconds: MAP_POLL_MS / 1000 }), digits)}
      </span>
      <button
        type="button"
        onClick={onRefresh}
        disabled={fetching}
        className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-semibold text-fg hover:bg-surface-2 disabled:opacity-60"
      >
        <RefreshCw aria-hidden className={cn("size-3.5", fetching && "animate-spin")} />
        {t("controlRoom.stripe.refresh")}
      </button>
    </footer>
  );
}
