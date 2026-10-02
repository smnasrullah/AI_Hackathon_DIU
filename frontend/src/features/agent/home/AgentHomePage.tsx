import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useAgentSummary } from "../../../api/hooks/agents";
import type { AgentSummary } from "../../../api/types";
import { CountdownCard } from "../../../components/signature/CountdownCard";
import { SkeletonCard, SkeletonGauge, SkeletonRunway } from "../../../components/ui/Skeleton";
import { ErrorState } from "../../../components/ui/StatePanel";
import { NoAgentState, NoPredictionState } from "../AgentPageStates";
import { FLOATS, headlineFloat, stockoutFlag } from "../runwayModel";
import { useMyAgentId, useRunwayEvents } from "../useAgentData";
import { FloatGauge } from "./FloatGauge";
import { NextActionCard } from "./NextActionCard";
import { RunwaySection } from "./RunwaySection";
import { WhyPanel } from "./WhyPanel";

/** Agent home (390px first): countdown, two vessels, runway, why, then the one primary action. */
export function AgentHomePage() {
  const { t } = useTranslation();
  const id = useMyAgentId();
  const summary = useAgentSummary(id);

  return (
    <div className="space-y-4">
      <h1 className="sr-only">{t("page.agentHome")}</h1>
      {id === null ? (
        <NoAgentState />
      ) : summary.isPending ? (
        <HomeSkeleton />
      ) : summary.isError ? (
        <ErrorState onRetry={() => void summary.refetch()} retrying={summary.isFetching} />
      ) : summary.data.floats.length === 0 ? (
        <NoPredictionState onRetry={() => void summary.refetch()} />
      ) : (
        <HomeBody agentId={id} summary={summary.data} />
      )}
    </div>
  );
}

function HomeBody({ agentId, summary }: { agentId: number; summary: AgentSummary }) {
  const { t } = useTranslation();
  const events = useRunwayEvents(summary);
  const lead = headlineFloat(summary.floats) ?? summary.floats[0];
  if (!lead) return null;
  const flag = stockoutFlag(lead);
  const floats = FLOATS.flatMap((ft) => summary.floats.filter((f) => f.float_type === ft));

  return (
    <>
      <p className="truncate text-small text-muted">
        {summary.agent.name} · <span className="num">{summary.agent.code}</span>
      </p>
      <CountdownCard floatType={lead.float_type} hoursToStockout={flag?.hour ?? null} confidence={lead.confidence} level={lead.level} />
      <Link
        to="/agent/stockout"
        className="-mt-1 flex min-h-11 items-center justify-end gap-1 text-small font-semibold text-pulse-fg hover:underline"
      >
        {t("agent.stockoutLink")}
        <ChevronRight aria-hidden className="size-4" />
      </Link>

      <section aria-label={t("agent.floats")} className="grid grid-cols-2 gap-3">
        {floats.map((f) => (
          <FloatGauge key={f.float_type} agentId={agentId} float={f} />
        ))}
      </section>

      <RunwaySection agentId={agentId} floatType={lead.float_type} events={events} />
      <WhyPanel agentId={agentId} initialFloat={lead.float_type} />
      <NextActionCard agentId={agentId} />
    </>
  );
}

function HomeSkeleton() {
  return (
    <>
      <SkeletonCard />
      <div className="grid grid-cols-2 gap-3">
        <SkeletonGauge />
        <SkeletonGauge />
      </div>
      <SkeletonRunway />
    </>
  );
}
