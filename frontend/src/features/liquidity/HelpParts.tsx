import { AlertTriangle, ChevronsDown } from "lucide-react";
import { useTranslation } from "react-i18next";

import { LiquidButton } from "../../components/ui/LiquidButton";

// Small pieces shared by the agent and distributor help screens (one chunk, not two).

/** "Urgent" with an icon and text, so colour is never the only signal. */
export function UrgentBadge({ testId = "help-urgent" }: { testId?: string }) {
  const { t } = useTranslation();
  return (
    <span data-testid={testId} className="inline-flex items-center gap-1.5 rounded-full border border-act-solid bg-surface px-2.5 py-0.5 text-xs font-bold text-act-fg">
      <AlertTriangle aria-hidden className="size-3.5" />
      {t("liquidity.urgent")}
    </span>
  );
}

/** Next page of a help list; hidden when everything is loaded. */
export function LoadMore({ hasMore, loading, onMore }: { hasMore: boolean; loading: boolean; onMore: () => void }) {
  const { t } = useTranslation();
  if (!hasMore) return null;
  return (
    <div className="flex justify-center">
      <LiquidButton variant="secondary" icon={ChevronsDown} data-testid="help-load-more" loading={loading} disabled={loading} onClick={onMore}>
        {t("liquidity.loadMore")}
      </LiquidButton>
    </div>
  );
}
