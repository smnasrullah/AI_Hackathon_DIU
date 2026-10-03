import { ArrowLeftRight, RotateCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { useSwaps } from "../../../api/hooks/swaps";
import { SkeletonRows } from "../../../components/ui/Skeleton";
import { StaggerItem, StaggerList } from "../../../components/ui/Stagger";
import { EmptyState, ErrorState } from "../../../components/ui/StatePanel";
import { SwapCard } from "../swaps/SwapCard";

/** Every swap this agent gives to or gets from (the queue is scoped to the distributor's agents). */
export function AgentSwapsTab({ agentId }: { agentId: number }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const q = useSwaps({ page_size: 100 });

  if (q.isPending) return <SkeletonRows rows={3} cols={3} />;
  if (q.isError) return <ErrorState compact onRetry={() => void q.refetch()} retrying={q.isFetching} />;
  const mine = q.data.items.filter((s) => s.donor.agent_id === agentId || s.receiver.agent_id === agentId);
  if (mine.length === 0) {
    return (
      <EmptyState
        compact
        title={t("detail.swaps.emptyTitle")}
        body={t("detail.swaps.emptyBody")}
        action={{ label: t("detail.swaps.queue"), icon: ArrowLeftRight, onClick: () => navigate("/distributor/swaps") }}
      />
    );
  }
  return (
    <div className="space-y-3">
      <StaggerList className="grid gap-3 md:grid-cols-2">
        {mine.map((s) => (
          <StaggerItem key={s.id} className="space-y-1">
            <p className="text-xs font-semibold text-muted">{t(`swaps.status.${s.status}`)}</p>
            <SwapCard swap={s} />
          </StaggerItem>
        ))}
      </StaggerList>
      <button type="button" onClick={() => void q.refetch()} className="ap-press inline-flex min-h-11 items-center gap-2 text-small font-semibold text-muted hover:text-fg">
        <RotateCw aria-hidden className="size-4" />
        {t("detail.refresh")}
      </button>
    </div>
  );
}
