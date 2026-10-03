import { describe, expect, it } from "vitest";

import { agentFeatures, along, droplets, swapLines } from "./mapModel";
import { mapAt, SWAP } from "./testFixtures";

// The style paints each dot from its level (tokens.css risk colours), so the level is what must change.
function levels(hour: number): Record<number, string> {
  const fc = agentFeatures(mapAt(hour).agents, null);
  return Object.fromEntries(fc.features.map((f) => [f.properties.id, f.properties.level]));
}

describe("map model", () => {
  it("recolours dots when the scrubber moves", () => {
    expect(levels(0)).toEqual({ 1: "green", 2: "amber", 3: "green" });
    expect(levels(24)).toEqual({ 1: "red", 2: "red", 3: "amber" });
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
