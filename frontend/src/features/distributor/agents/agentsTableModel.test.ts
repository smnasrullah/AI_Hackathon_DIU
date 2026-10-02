import { describe, expect, it } from "vitest";

import { DEFAULT_STATE, pageQuery, patchState, readState, writeState } from "./agentsTableModel";

describe("agents table URL state", () => {
  it("round-trips through the URL and drops defaults", () => {
    const state = { horizon: 72 as const, level: "red" as const, sort: "stockout" as const, q: "Savar", page: 3, hidden: ["tier" as const, "area" as const] };
    const url = writeState(state);
    expect(url.toString()).toBe("horizon=72&level=red&sort=stockout&q=Savar&page=3&hide=area%2Ctier");
    expect(readState(url)).toEqual({ ...state, hidden: ["area", "tier"] });
    expect(writeState(DEFAULT_STATE).toString()).toBe("");
  });

  it("ignores unknown values", () => {
    const state = readState(new URLSearchParams("horizon=5&level=pink&sort=evil&page=-2&hide=agent,tier"));
    expect(state).toEqual({ ...DEFAULT_STATE, hidden: ["tier"] });
  });

  it("goes back to page 1 when a filter changes, not when paging", () => {
    const on3 = { ...DEFAULT_STATE, page: 3 };
    expect(patchState(on3, { level: "amber" }).page).toBe(1);
    expect(patchState(on3, { hidden: ["tier"] }).page).toBe(3);
    expect(pageQuery(patchState(on3, { page: 4 }))).toEqual({ horizon: 24, sort: "risk", page: 4, page_size: 20 });
  });
});
