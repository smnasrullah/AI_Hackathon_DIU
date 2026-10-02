import { describe, expect, it } from "vitest";

import { formatClock } from "../../lib/format";
import { bandAt, DAY_START_MIN, dhakaDate, expectedAt, riskAt, STOCKOUT_MIN } from "./demoDay";

describe("demo day", () => {
  it("drains to zero exactly at the stockout and stays dry", () => {
    expect(expectedAt(DAY_START_MIN)).toBe(120_000);
    expect(expectedAt(STOCKOUT_MIN - 10)).toBeGreaterThan(0);
    expect(expectedAt(STOCKOUT_MIN)).toBe(0);
    expect(expectedAt(20 * 60)).toBe(0);
  });

  it("keeps the band around the expected line", () => {
    for (let m = DAY_START_MIN; m <= STOCKOUT_MIN; m += 30) {
      const { low, high } = bandAt(m);
      expect(low).toBeLessThanOrEqual(expectedAt(m));
      expect(high).toBeGreaterThanOrEqual(expectedAt(m));
    }
  });

  it("escalates risk as the stockout nears", () => {
    expect(riskAt(DAY_START_MIN)).toBe("green");
    expect(riskAt(12 * 60)).toBe("amber");
    expect(riskAt(14 * 60)).toBe("red");
  });

  it("matches the headline clock in both languages", () => {
    expect(formatClock(dhakaDate(STOCKOUT_MIN), "en", "en")).toBe("3:40 PM");
    expect(formatClock(dhakaDate(STOCKOUT_MIN), "bn", "bn")).toBe("বিকেল ৩:৪০");
  });
});
