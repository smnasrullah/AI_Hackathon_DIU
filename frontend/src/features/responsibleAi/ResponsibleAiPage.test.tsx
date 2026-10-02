import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FairnessGroup, FairnessReport, ModelCard } from "../../api/types";
import { api as realApi } from "../../lib/api";
import type { FakeApi } from "../../test/fakeApi";
import { signIn } from "../auth/testUtils";
import { renderAt } from "../distributor/testRender";
import { ResponsibleAiPage } from "./ResponsibleAiPage";

vi.mock("../../lib/api", async () => {
  const { createFakeApi } = await import("../../test/fakeApi");
  return { api: createFakeApi(), authClient: { post: vi.fn() }, refreshAccessToken: vi.fn() };
});

const api = realApi as unknown as FakeApi;

const group = (name: string, nmae: number, recall: number): FairnessGroup => ({
  group: name,
  n_agents: 10,
  forecast: [{ target: "cash_out", nmae, skill: 0.2, mae_bdt: 100, mae_baseline_bdt: 130, mean_demand_bdt: 1000 }],
  stockout: { caught: 8, events: 10, flagged: 12, recall, precision: 0.66 },
});

function report(groupBy: FairnessReport["group_by"]): FairnessReport {
  return {
    group_by: groupBy,
    generated_at: "2026-03-10T06:00:00Z",
    model_version: "lgbm-q-2026.03",
    method: { amber_cut_24h: 0.3, end: "2026-03-10", start: "2026-02-25", horizon_h: 24, n_paths: 200, rounds_local_hours: [8] },
    overall: group("all", 0.2, 0.8),
    groups: groupBy === "tier" ? [group("1", 0.18, 0.85), group("2", 0.22, 0.75)] : [group("urban", 0.19, 0.82), group("rural", 0.23, 0.76)],
    gap: { nmae: { cash_out: 0.04 }, recall: 0.06 },
  };
}

const CARD: ModelCard = {
  advisory_only: true,
  lang: "en",
  generated_at: "2026-03-10T06:00:00Z",
  model_version: "lgbm-q-2026.03",
  human_oversight: "A distributor approves every swap and top-up.",
  intended_use: ["Plan float top-ups a day ahead."],
  out_of_scope: ["Credit decisions."],
  limitations: ["New agents have little history."],
  fairness: {},
  data: { source: "synthetic", seed: 42, start: "2025-09-01", end: "2026-03-10", holdout_start: "2026-02-25", n_agents: 200, n_distributors: 5, data_version: "v1" },
  models: [{ name: "Demand forecaster", kind: "LightGBM quantile", version: "lgbm-q-2026.03", purpose: "Hourly cash-in and cash-out", trained_at: "2026-03-10T00:00:00Z", metrics: { mae: 812.5 } }],
};

describe("responsible AI", () => {
  beforeEach(() => {
    api.reset();
    signIn("distributor");
    api.on("get", "/responsible-ai/fairness", (_b, config) => report(config?.params?.["groupBy"] as FairnessReport["group_by"]));
    api.on("get", "/responsible-ai/model-card", () => CARD);
  });

  it("always shows the advisory and synthetic-data notices", async () => {
    renderAt("/responsible-ai", "/responsible-ai", <ResponsibleAiPage />);
    const notices = screen.getByTestId("rai-notices");
    expect(notices).toHaveTextContent("Advisory only — a human approves");
    expect(notices).toHaveTextContent("Synthetic data only");
    await screen.findByTestId("fairness-chart");
    expect(screen.getByTestId("rai-notices")).toBeInTheDocument();
  });

  it("switches the fairness grouping through the URL", async () => {
    renderAt("/responsible-ai", "/responsible-ai", <ResponsibleAiPage />);
    expect((await screen.findAllByText("Urban")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("radio", { name: "Tier" }));
    await waitFor(() => expect(screen.getByTestId("fairness-chart")).toHaveAttribute("data-group-by", "tier"));
    expect(screen.getByTestId("location")).toHaveTextContent("groupBy=tier");
    expect(api.get).toHaveBeenCalledWith("/responsible-ai/fairness", { params: { groupBy: "tier" } });
  });

  it("opens model card sections on demand", async () => {
    renderAt("/responsible-ai", "/responsible-ai", <ResponsibleAiPage />);
    expect(await screen.findByText("Demand forecaster")).toBeInTheDocument();
    const limits = screen.getByRole("button", { name: "Limits" });
    expect(limits).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(limits);
    expect(limits).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("New agents have little history.")).toBeInTheDocument();
  });
});
