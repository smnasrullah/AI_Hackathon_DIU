import { describe, expect, it } from "vitest";

import { assignLanes } from "../../components/signature/eventLanes";
import { eventRibbons, headlineFloat, stockoutFlag } from "./runwayModel";
import { AS_OF, CASH, CASH_STOCKOUT, EMONEY, EVENTS } from "./testFixtures";

describe("runway model", () => {
  it("places the stockout flag at the backend's hours and time", () => {
    expect(stockoutFlag(CASH)).toEqual({ hour: 3 + 40 / 60, at: CASH_STOCKOUT, confidence: 0.82 });
  });

  it("has no flag without a predicted stockout or beyond the 72h runway", () => {
    expect(stockoutFlag(EMONEY)).toBeNull();
    expect(stockoutFlag({ ...CASH, hours_to_stockout: 80 })).toBeNull();
  });

  it("leads with the soonest stockout, then the worse risk level", () => {
    expect(headlineFloat([EMONEY, CASH])?.float_type).toBe("cash");
    const calmCash = { ...CASH, stockout_at: null, hours_to_stockout: null, level: "green" as const };
    expect(headlineFloat([calmCash, { ...EMONEY, level: "amber" }])?.float_type).toBe("emoney");
  });

  it("turns events into ribbons in hours from as-of, clipped to 72h", () => {
    expect(eventRibbons(EVENTS.items, AS_OF, "bn")).toEqual([
      { kind: "salary", startHour: 6, endHour: 30, name: "গার্মেন্টস বেতন সপ্তাহ" },
    ]);
    const long = { ...EVENTS.items[0]!, type: "weather" as const, ends_at: "2026-03-20T00:00:00Z" };
    expect(eventRibbons([long], AS_OF, "en")[0]).toMatchObject({ kind: "rain", endHour: 72 });
  });

  it("stacks overlapping ribbons in separate lanes", () => {
    const ev = (startHour: number, endHour: number) => ({ kind: "hat" as const, startHour, endHour });
    expect(assignLanes([ev(0, 10), ev(5, 12), ev(11, 20)])).toEqual([0, 1, 0]);
  });
});
