import { describe, expect, it } from "vitest";

import { anomalyDetail } from "../testFixtures";
import { peerScale } from "./peerChartModel";

describe("peer comparison scale", () => {
  it("keeps the box ordered and the agent's value on the track", () => {
    const [growth] = anomalyDetail().features;
    const s = peerScale(growth!);
    expect(s.p10).toBeLessThan(s.p25);
    expect(s.p25).toBeLessThan(s.p50);
    expect(s.p75).toBeLessThan(s.p90);
    expect(s.value).toBeGreaterThan(s.p90);
    expect(s.value).toBeLessThanOrEqual(100);
    expect(s.p10).toBeGreaterThanOrEqual(0);
    expect(s.outside).toBe(true);
  });

  it("flags nothing inside the peer band and survives a flat distribution", () => {
    const flat = { name: "hour_shift" as const, value: 1, p10: 1, p25: 1, p50: 1, p75: 1, p90: 1, percentile: 0.5, deviation: 0 };
    const s = peerScale(flat);
    expect(s.outside).toBe(false);
    expect(Number.isFinite(s.value)).toBe(true);
  });
});
