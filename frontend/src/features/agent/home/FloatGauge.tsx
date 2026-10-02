import { useRunway } from "../../../api/hooks/agents";
import type { FloatSummary } from "../../../api/types";
import { VesselGauge } from "../../../components/signature/VesselGauge";

const GAUGE_HOURS = 24;

/** One float's vessel. The hourly drill-down appears once the runway projection has loaded. */
export function FloatGauge({ agentId, float }: { agentId: number; float: FloatSummary }) {
  const runway = useRunway(agentId, float.float_type);
  const hourly = runway.data?.series.filter((p) => p.hour >= 1 && p.hour <= GAUGE_HOURS).map((p) => p.expected);
  return (
    <VesselGauge
      floatType={float.float_type}
      balance={float.balance}
      capacity={float.capacity}
      level={float.level}
      hourly={hourly?.length ? hourly : undefined}
    />
  );
}
