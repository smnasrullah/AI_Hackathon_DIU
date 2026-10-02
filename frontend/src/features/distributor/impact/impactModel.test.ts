import { describe, expect, it } from "vitest";

import type { ImpactDay, ScenarioTotals } from "../../../api/types";
import { compareRows, dailySeries } from "./impactModel";

const totals = (over: Partial<ScenarioTotals>): ScenarioTotals => ({
  actions: {},
  stockout_hours: 0,
  value_lost_bdt: 0,
  fee_lost_bdt: 0,
  van_trips: 0,
  van_cost_bdt: 0,
  ...over,
});

describe("impact model", () => {
  it("scales each pair to the larger bar and reports what the AI saved", () => {
    const rows = compareRows(totals({ stockout_hours: 30, van_trips: 12 }), totals({ stockout_hours: 120, van_trips: 10 }));
    const hours = rows.find((r) => r.key === "stockout_hours");
    expect(hours).toMatchObject({ modelShare: 0.25, baselineShare: 1, saved: 90, format: "hours" });
    const trips = rows.find((r) => r.key === "van_trips");
    expect(trips?.modelShare).toBe(1);
    expect(trips?.saved).toBe(-2);
    // Both zero: no division by zero.
    expect(rows.find((r) => r.key === "fee_lost_bdt")).toMatchObject({ modelShare: 0, baselineShare: 0 });
  });

  it("orders the daily series by date", () => {
    const day = (date: string, v: number): ImpactDay => ({
      date,
      model: totals({}),
      baseline: totals({}),
      delta: { stockout_hours_reduced: v, stockout_hours_reduced_pct: null, value_saved_bdt: 0, fee_saved_bdt: 0, van_trips_avoided: 0, van_cost_avoided_bdt: 0 },
    });
    expect(dailySeries([day("2026-03-02", 2), day("2026-03-01", 1)], "stockout_hours_reduced")).toEqual([1, 2]);
  });
});
