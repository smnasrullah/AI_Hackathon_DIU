import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api as realApi } from "../../../lib/api";
import type { FakeApi } from "../../../test/fakeApi";
import { signIn } from "../../auth/testUtils";
import { riskPage, riskRow } from "../testFixtures";
import { renderAt } from "../testRender";
import { AgentsPage } from "./AgentsPage";

vi.mock("../../../lib/api", async () => {
  const { createFakeApi } = await import("../../../test/fakeApi");
  return { api: createFakeApi(), authClient: { post: vi.fn() }, refreshAccessToken: vi.fn() };
});

const api = realApi as unknown as FakeApi;
const ROWS = [riskRow({}), riskRow({ agent_id: 2, code: "A002", name: "Rahim Store", level: "amber", probability: 0.4, hours_to_stockout: null })];

function lastRiskParams(): Record<string, unknown> {
  const calls = api.get.mock.calls.filter(([path]) => path === "/agents/risk");
  return ((calls.at(-1)?.[1] as { params?: Record<string, unknown> } | undefined)?.params ?? {});
}

describe("distributor agents table", () => {
  beforeEach(() => {
    api.reset();
    signIn("distributor");
    api.on("get", "/agents/risk", () => riskPage(ROWS, { total: 45 }));
    api.on("post", "/agents/1/whatif", () => ({
      advisory: true,
      agent_id: 1,
      as_of: "2026-03-10T06:00:00Z",
      generated_at: "2026-03-10T06:00:00Z",
      model_version: "m",
      unit: "BDT",
      float_type: "cash",
      capacity: 300000,
      delta_amount: 0,
      before: { balance: 90000, confidence: 0.8, horizons: [], hours_to_stockout: 5, level: "red", stockout_at: null, series: [0, 1, 2].map((h) => ({ hour: h, ts: "2026-03-10T06:00:00Z", expected: 90000 - h * 30000, low: 0, high: 0 })) },
      after: { balance: 90000, confidence: 0.8, horizons: [], hours_to_stockout: 5, level: "red", stockout_at: null, series: [] },
    }));
  });

  it("reads filters from the URL and writes sort, level and page back", async () => {
    renderAt("/distributor/agents?horizon=72&q=Savar", "/distributor/agents", <AgentsPage />);
    await screen.findByText("Karim Telecom");
    expect(lastRiskParams()).toMatchObject({ horizon: 72, q: "Savar", sort: "risk", page: 1, page_size: 20 });

    fireEvent.click(screen.getByRole("button", { name: "Sort by Runs out" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("sort=stockout"));
    expect(lastRiskParams()).toMatchObject({ sort: "stockout" });

    fireEvent.click(screen.getByRole("radio", { name: "Act now" }));
    await waitFor(() => expect(lastRiskParams()).toMatchObject({ level: "red" }));

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("page=2"));
    expect(lastRiskParams()).toMatchObject({ page: 2, level: "red" });
    expect(screen.getByText("21–40 of 45")).toBeInTheDocument();
  });

  it("hides a column from the chooser and keeps it hidden in the URL", async () => {
    renderAt("/distributor/agents", "/distributor/agents", <AgentsPage />);
    await screen.findByText("Karim Telecom");
    expect(screen.getByRole("columnheader", { name: "Tier" })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("column-chooser"));
    fireEvent.click(await screen.findByRole("checkbox", { name: "Tier" }));
    await waitFor(() => expect(screen.queryByRole("columnheader", { name: "Tier" })).not.toBeInTheDocument());
    expect(screen.getByTestId("location")).toHaveTextContent("hide=tier");
  });

  it("expands a row into its 72h trend with the keyboard", async () => {
    renderAt("/distributor/agents", "/distributor/agents", <AgentsPage />);
    const name = await screen.findByText("Karim Telecom");
    const row = name.closest("tr");
    expect(row).not.toBeNull();
    fireEvent.keyDown(row as HTMLElement, { key: "Enter" });
    const trend = await screen.findByTestId("agent-trend");
    expect(await within(trend).findByRole("img", { name: /Expected Cash balance/ })).toBeInTheDocument();
    expect(row).toHaveAttribute("data-expanded", "true");
    expect(document.getElementById(row?.getAttribute("aria-controls") ?? "")).toContainElement(trend);
  });

  it("offers a way out when nothing matches", async () => {
    api.on("get", "/agents/risk", () => riskPage([]));
    renderAt("/distributor/agents?level=green", "/distributor/agents", <AgentsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/^\/distributor\/agents$/));
  });
});
