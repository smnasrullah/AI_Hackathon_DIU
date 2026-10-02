import { isAxiosError } from "axios";
import { Activity, ArrowLeftRight, ChartLine, LayoutDashboard, ScanSearch, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { useAgentSummary } from "../../../api/hooks/agents";
import type { FloatType } from "../../../api/types";
import { SkeletonCard, SkeletonGauge } from "../../../components/ui/Skeleton";
import { EmptyState, ErrorState } from "../../../components/ui/StatePanel";
import { Tabs } from "../../../components/ui/Tabs";
import { isFloatType } from "../../agent/runwayModel";
import { ActivityTab } from "./ActivityTab";
import { AgentAnomaliesTab } from "./AgentAnomaliesTab";
import { AgentHero } from "./AgentHero";
import { AgentSwapsTab } from "./AgentSwapsTab";
import { ForecastTab } from "./ForecastTab";
import { OverviewTab } from "./OverviewTab";

const TABS = ["overview", "forecast", "swaps", "anomalies", "activity"] as const;
type TabKey = (typeof TABS)[number];

function isTab(v: string | null): v is TabKey {
  return TABS.some((k) => k === v);
}

/** Agent detail (F1-F5, F7-F9): hero + tabs; the tab and float live in the URL. */
export function AgentDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id: raw } = useParams();
  const id = Number(raw);
  const valid = Number.isInteger(id) && id > 0;
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab");
  const tab: TabKey = isTab(tabParam) ? tabParam : "overview";
  const floatParam = params.get("float");
  const floatType: FloatType = isFloatType(floatParam) ? floatParam : "cash";
  const summary = useAgentSummary(valid ? id : null);

  function setParam(key: string, value: string, fallback: string): void {
    const next = new URLSearchParams(params);
    if (value === fallback) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  }

  const missing = !valid || (summary.isError && isAxiosError(summary.error) && [403, 404].includes(summary.error.response?.status ?? 0));
  if (missing) {
    return (
      <EmptyState
        title={t("detail.missing.title")}
        body={t("detail.missing.body")}
        action={{ label: t("detail.missing.action"), icon: Users, onClick: () => navigate("/distributor/agents") }}
      />
    );
  }
  if (summary.isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <SkeletonCard />
        <div className="grid grid-cols-2 gap-3 md:max-w-xl">
          <SkeletonGauge />
          <SkeletonGauge />
        </div>
      </div>
    );
  }
  if (summary.isError) return <ErrorState onRetry={() => void summary.refetch()} retrying={summary.isFetching} />;

  const data = summary.data;
  return (
    <div className="space-y-4" data-testid="agent-detail" data-tab={tab}>
      <AgentHero summary={data} />
      <Tabs
        label={t("detail.tabs.label")}
        value={tab}
        onValueChange={(v) => setParam("tab", v, "overview")}
        items={[
          { value: "overview", label: t("detail.tabs.overview"), icon: LayoutDashboard, content: <OverviewTab summary={data} /> },
          {
            value: "forecast",
            label: t("detail.tabs.forecast"),
            icon: ChartLine,
            content: <ForecastTab agentId={id} floatType={floatType} onFloatChange={(f) => setParam("float", f, "cash")} />,
          },
          { value: "swaps", label: t("detail.tabs.swaps"), icon: ArrowLeftRight, content: <AgentSwapsTab agentId={id} /> },
          { value: "anomalies", label: t("detail.tabs.anomalies"), icon: ScanSearch, content: <AgentAnomaliesTab agentId={id} /> },
          { value: "activity", label: t("detail.tabs.activity"), icon: Activity, content: <ActivityTab agentId={id} /> },
        ]}
      />
    </div>
  );
}
