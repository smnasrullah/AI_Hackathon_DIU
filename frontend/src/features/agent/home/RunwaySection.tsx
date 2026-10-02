import { RotateCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useRunway } from "../../../api/hooks/agents";
import type { FloatType } from "../../../api/types";
import { RunwayStrip, type RunwayEvent } from "../../../components/signature/RunwayStrip";
import { SkeletonRunway } from "../../../components/ui/Skeleton";
import { EmptyState, ErrorState } from "../../../components/ui/StatePanel";
import { stockoutFlag, toRunwayPoints } from "../runwayModel";

interface RunwaySectionProps {
  agentId: number;
  floatType: FloatType;
  events: RunwayEvent[];
}

/** 72h runway for one float with the stockout flag ("3:40 PM · 82%") from the backend projection. */
export function RunwaySection({ agentId, floatType, events }: RunwaySectionProps) {
  const { t } = useTranslation();
  const q = useRunway(agentId, floatType);

  if (q.isPending) return <SkeletonRunway />;
  if (q.isError) return <ErrorState compact onRetry={() => void q.refetch()} retrying={q.isFetching} />;
  if (q.data.series.length === 0) {
    return (
      <EmptyState
        compact
        title={t("forecast.empty.title")}
        body={t("forecast.empty.body")}
        action={{ label: t("forecast.empty.action"), icon: RotateCw, onClick: () => void q.refetch() }}
      />
    );
  }
  return (
    <RunwayStrip
      subtitle={t(`float.${floatType}`)}
      series={toRunwayPoints(q.data)}
      capacity={Math.max(q.data.capacity, q.data.balance)}
      stockout={stockoutFlag(q.data)}
      events={events}
    />
  );
}
