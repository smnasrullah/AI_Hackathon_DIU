import type { AgentSummary } from "../../../api/types";
import { FloatGauge } from "../../agent/home/FloatGauge";
import { RunwaySection } from "../../agent/home/RunwaySection";
import { WhyPanel } from "../../agent/home/WhyPanel";

/** Both vessels, the riskier float's runway and the reasons behind it. */
export function OverviewTab({ summary }: { summary: AgentSummary }) {
  const worst = [...summary.floats].sort((a, b) => (a.hours_to_stockout ?? Infinity) - (b.hours_to_stockout ?? Infinity))[0];
  const floatType = worst?.float_type ?? "cash";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:max-w-xl">
        {summary.floats.map((f) => (
          <FloatGauge key={f.float_type} agentId={summary.agent_id} float={f} />
        ))}
      </div>
      <RunwaySection agentId={summary.agent_id} floatType={floatType} events={[]} />
      <WhyPanel agentId={summary.agent_id} initialFloat={floatType} forecastPath={`/distributor/agents/${summary.agent_id}`} />
    </div>
  );
}
