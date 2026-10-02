import { describe, expect, it } from "vitest";

import { districtsOf, filterAgents, levelCounts, swapsOf, visibleSwaps, type AgentFilters } from "./controlRoomModel";
import { mapAt, SWAP } from "./testFixtures";

const ALL: AgentFilters = { levels: ["red", "amber", "green"], query: "", district: null, float: "all" };
const ids = (f: Partial<AgentFilters>, hour = 0) => filterAgents(mapAt(hour).agents, { ...ALL, ...f }).map((a) => a.agent_id);

describe("control room model", () => {
  it("orders riskiest first: level, then probability", () => {
    expect(ids({})).toEqual([2, 1, 3]);
    expect(ids({}, 24)).toEqual([1, 2, 3]);
  });

  it("filters by level, search, district and float", () => {
    expect(ids({ levels: ["amber"] })).toEqual([2]);
    expect(ids({ query: "  savar " })).toEqual([2]);
    expect(ids({ query: "agt-0003" })).toEqual([3]);
    expect(ids({ district: "Gazipur" })).toEqual([3]);
    expect(ids({ float: "emoney" })).toEqual([2]);
    expect(ids({ levels: [] })).toEqual([]);
  });

  it("counts levels, lists districts and keeps swaps whose ends are both visible", () => {
    const agents = mapAt(24).agents;
    expect(levelCounts(agents)).toEqual({ red: 2, amber: 1, green: 0 });
    expect(districtsOf(agents)).toEqual(["Dhaka", "Gazipur"]);
    expect(swapsOf([SWAP], 1)).toEqual([SWAP]);
    expect(swapsOf([SWAP], 2)).toEqual([]);
    expect(visibleSwaps([SWAP], agents)).toEqual([SWAP]);
    expect(visibleSwaps([SWAP], agents.filter((a) => a.agent_id !== 3))).toEqual([]);
  });
});
