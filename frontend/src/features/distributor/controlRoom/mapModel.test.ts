import { describe, expect, it } from "vitest";

import { agentFeatures, along, droplets, RISK_HEX, swapLines } from "./mapModel";
import { mapAt, SWAP } from "./testFixtures";

function colours(hour: number): Record<number, string> {
  const fc = agentFeatures(mapAt(hour).agents, null);
  return Object.fromEntries(fc.features.map((f) => [f.properties.id, f.properties.color]));
}

describe("map model", () => {
  it("recolours dots when the scrubber moves", () => {
    expect(colours(0)).toEqual({ 1: RISK_HEX.green, 2: RISK_HEX.amber, 3: RISK_HEX.green });
    expect(colours(24)).toEqual({ 1: RISK_HEX.red, 2: RISK_HEX.red, 3: RISK_HEX.amber });
  });

  it("puts dots at lng/lat with severity for cluster colouring and marks the selection", () => {
    const fc = agentFeatures(mapAt(24).agents, 2);
    const second = fc.features[1];
    const [lng, lat] = second?.geometry.coordinates ?? [];
    expect(lng).toBeCloseTo(90.37);
    expect(lat).toBeCloseTo(23.72);
    expect(second?.properties).toMatchObject({ id: 2, level: "red", sev: 2, selected: true });
    expect(fc.features.filter((f) => f.properties.selected)).toHaveLength(1);
  });

  it("flows droplets from donor to receiver along relevant swaps only", () => {
    expect(along(SWAP, 0)).toEqual([SWAP.from_lng, SWAP.from_lat]);
    const [toLng, toLat] = along(SWAP, 1);
    expect(toLng).toBeCloseTo(SWAP.to_lng);
    expect(toLat).toBeCloseTo(SWAP.to_lat);
    expect(droplets([SWAP], 0.25, 2).features.map((f) => f.geometry.coordinates)).toEqual([along(SWAP, 0.25), along(SWAP, 0.75)]);
    expect(droplets([{ ...SWAP, relevant: false }], 0.5).features).toHaveLength(0);
    expect(swapLines([SWAP]).features[0]?.properties).toEqual({ id: 9, relevant: true });
  });
});
