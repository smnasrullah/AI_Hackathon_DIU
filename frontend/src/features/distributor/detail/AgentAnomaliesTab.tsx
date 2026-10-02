import { ChevronRight, ScanSearch } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import { useAnomalies } from "../../../api/hooks/anomalies";
import { SkeletonRows } from "../../../components/ui/Skeleton";
import { EmptyState, ErrorState } from "../../../components/ui/StatePanel";
import { TimeText } from "../../../components/ui/TimeText";
import { AnomalyStatusBadge } from "../anomalies/AnomalyStatusBadge";

/** Isolation Forest flags for this agent; each opens the investigation. */
export function AgentAnomaliesTab({ agentId }: { agentId: number }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const q = useAnomalies({ page_size: 100 });

  if (q.isPending) return <SkeletonRows rows={3} cols={3} />;
  if (q.isError) return <ErrorState compact onRetry={() => void q.refetch()} retrying={q.isFetching} />;
  const mine = q.data.items.filter((a) => a.agent.agent_id === agentId);
  if (mine.length === 0) {
    return (
      <EmptyState
        compact
        illustration="quiet-pulse"
        title={t("detail.anomalies.emptyTitle")}
        body={t("detail.anomalies.emptyBody")}
        action={{ label: t("detail.anomalies.all"), icon: ScanSearch, onClick: () => navigate("/distributor/anomalies") }}
      />
    );
  }
  return (
    <ul className="space-y-2">
      {mine.map((a) => (
        <li key={a.id}>
          <Link
            to={`/distributor/anomalies/${a.id}`}
            className="flex min-h-11 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-small hover:bg-surface-2"
          >
            <AnomalyStatusBadge status={a.status} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{t(`anomalies.feature.${a.reasons[0]?.feature ?? "cash_out_growth"}`)}</span>
              <TimeText at={a.generated_at} mode="datetime" className="text-xs text-muted" />
            </span>
            <ChevronRight aria-hidden className="size-4 text-muted" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
