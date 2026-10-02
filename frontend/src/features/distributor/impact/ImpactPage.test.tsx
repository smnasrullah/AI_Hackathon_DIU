import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ImpactSummary, ScenarioTotals } from "../../../api/types";
import { api as realApi } from "../../../lib/api";
import type { FakeApi } from "../../../test/fakeApi";
import { signIn } from "../../auth/testUtils";
import { renderAt } from "../testRender";
import { ImpactPage } from "./ImpactPage";

vi.mock("../../../lib/api", async () => {
  const { createFakeApi } = await import("../../../test/fakeApi");
  return { api: createFakeApi(), authClient: { post: vi.fn() }, refreshAccessToken: vi.fn() };
});

const api = realApi as unknown as FakeApi;

const totals = (over: Partial<ScenarioTotals>): ScenarioTotals => ({
  actions: {},
  stockout_hours: 0,
  value_lost_bdt: 0,
  fee_lost_bdt: 0,
  van_trips: 0,
  van_cost_bdt: 0,
  ...over,
});

const SUMMARY: ImpactSummary = {
  scope: "distributor",
  n_agents: 40,
  days: 14,
  start: "2026-02-25",
  end: "2026-03-10",
  generated_at: "2026-03-10T06:00:00Z",
  model_version: "lgbm-q-2026.03",
  model: totals({ stockout_hours: 30, value_lost_bdt: 90000, fee_lost_bdt: 1600, van_trips: 12, van_cost_bdt: 18000 }),
  baseline: totals({ stockout_hours: 120, value_lost_bdt: 400000, fee_lost_bdt: 7400, van_trips: 20, van_cost_bdt: 30000 }),
  delta: { stockout_hours_reduced: 90, stockout_hours_reduced_pct: 75, value_saved_bdt: 310000, fee_saved_bdt: 5800, van_trips_avoided: 8, van_cost_avoided_bdt: 12000 },
  assumptions: { alert_share: 0.2, cashout_fee_pct: 1.85, decision_hours: [8, 14], emergency_eta_h: 4, rebalance_horizon_h: 24, topup_eta_h: 3, van_cost_per_trip_bdt: 1500, van_lead_time_h: 6 },
  equal_service: { baseline_stockout_hours_at_ai_trips: 160, baseline_trips_at_ai_stockout_hours: 31, stockout_hours_avoided: 90, sweep: [], van_trips_avoided: 19 },
};

describe("impact", () => {
  beforeEach(() => {
    api.reset();
    signIn("distributor");
    api.on("get", "/impact/summary", () => SUMMARY);
    api.on("get", "/impact/comparison", () => ({ days: [], generated_at: SUMMARY.generated_at, model_version: SUMMARY.model_version, n_agents: 40, scope: "distributor", totals: null }));
  });

  it("shows the bento, AI vs baseline bars and the assumptions", async () => {
    renderAt("/distributor/impact", "/distributor/impact", <ImpactPage />);
    const bento = await screen.findByTestId("impact-bento");
    expect(within(bento).getByText("Stockout hours avoided")).toBeInTheDocument();
    expect(within(bento).getByText("Van trips avoided")).toBeInTheDocument();
    expect(within(bento).getByText("75%")).toBeInTheDocument();

    const trips = screen.getByTestId("compare-bars").querySelector('[data-key="van_trips"]') as HTMLElement;
    expect(within(trips).getByText("8 less with AI")).toBeInTheDocument();
    expect(within(trips).getByText("12")).toBeInTheDocument();
    expect(within(trips).getByText("20")).toBeInTheDocument();

    expect(screen.getByText("Van cost per trip")).toBeInTheDocument();
    expect(screen.getByTestId("equal-service")).toHaveTextContent("31 van trips instead of 12");
    expect(screen.getAllByTestId("source-chip").map((c) => c.getAttribute("data-source"))).toEqual(expect.arrayContaining(["model", "rule"]));
  });

  it("offers a retry when the summary fails", async () => {
    api.on("get", "/impact/summary", () => {
      throw new Error("down");
    });
    renderAt("/distributor/impact", "/distributor/impact", <ImpactPage />);
    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
