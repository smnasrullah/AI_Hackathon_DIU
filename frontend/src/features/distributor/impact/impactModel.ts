import type { ImpactDay, ScenarioTotals } from "../../../api/types";

export type CompareKey = "stockout_hours" | "value_lost_bdt" | "fee_lost_bdt" | "van_trips" | "van_cost_bdt";
export type CompareFormat = "hours" | "money" | "number";

export interface CompareRow {
  key: CompareKey;
  format: CompareFormat;
  model: number;
  baseline: number;
  /** Bar lengths as a share of the larger of the two (0..1). */
  modelShare: number;
  baselineShare: number;
  /** Baseline minus AI: positive means the AI plan did better (every metric is a cost). */
  saved: number;
}

const ROWS: { key: CompareKey; format: CompareFormat }[] = [
  { key: "stockout_hours", format: "hours" },
  { key: "value_lost_bdt", format: "money" },
  { key: "fee_lost_bdt", format: "money" },
  { key: "van_trips", format: "number" },
  { key: "van_cost_bdt", format: "money" },
];

/** AI vs fixed-threshold baseline, one row per cost, scaled for side-by-side bars. */
export function compareRows(model: ScenarioTotals, baseline: ScenarioTotals): CompareRow[] {
  return ROWS.map(({ key, format }) => {
    const m = model[key];
    const b = baseline[key];
    const top = Math.max(m, b) || 1;
    return { key, format, model: m, baseline: b, modelShare: m / top, baselineShare: b / top, saved: b - m };
  });
}

export type DeltaKey = "stockout_hours_reduced" | "value_saved_bdt" | "van_trips_avoided" | "van_cost_avoided_bdt" | "fee_saved_bdt";

/** One daily series per headline number for the tile sparklines (oldest first). */
export function dailySeries(days: ImpactDay[], key: DeltaKey): number[] {
  return [...days].sort((a, b) => a.date.localeCompare(b.date)).map((d) => d.delta[key]);
}
