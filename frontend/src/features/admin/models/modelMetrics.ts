import type { ModelVersionItem } from "../../../api/types";

type MetricLabel = "skillCashOut" | "skillCashIn" | "coverageCashOut" | "maeCashOut" | "precision" | "recall";

/** Headline metrics per model (dotted keys of the stored metrics document). */
export const HEADLINE: { model: string; key: string; label: MetricLabel; fraction: number }[] = [
  { model: "demand_forecast", key: "cash_out.mae_skill", label: "skillCashOut", fraction: 3 },
  { model: "demand_forecast", key: "cash_in.mae_skill", label: "skillCashIn", fraction: 3 },
  { model: "demand_forecast", key: "cash_out.coverage_q10_q90", label: "coverageCashOut", fraction: 3 },
  { model: "demand_forecast", key: "cash_out.mae_bdt", label: "maeCashOut", fraction: 0 },
  { model: "agent_anomaly", key: "holdout.precision", label: "precision", fraction: 3 },
  { model: "agent_anomaly", key: "holdout.recall", label: "recall", fraction: 3 },
];

export function metricValue(m: ModelVersionItem, key: string): number | null {
  return m.metrics.find((x) => x.key === key)?.value ?? null;
}
