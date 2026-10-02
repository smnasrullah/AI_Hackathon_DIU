import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePageActionsStore } from "../../../app/shell/pageActions";
import { api as realApi } from "../../../lib/api";
import type { FakeApi } from "../../../test/fakeApi";
import { signIn } from "../../auth/testUtils";
import { ControlRoomPage } from "./ControlRoomPage";
import { AS_OF, mapAt } from "./testFixtures";

vi.mock("../../../lib/api", async () => {
  const { createFakeApi } = await import("../../../test/fakeApi");
  return { api: createFakeApi(), authClient: { post: vi.fn() }, refreshAccessToken: vi.fn() };
});

const api = realApi as unknown as FakeApi;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ControlRoomPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function rowIds(): number[] {
  return screen.getAllByTestId("agent-row").map((r) => Number(r.getAttribute("data-agent-id")));
}

function dotLevel(id: number): string | null {
  const row = screen.getAllByTestId("agent-row").find((r) => r.getAttribute("data-agent-id") === String(id));
  return row ? within(row).getByTestId("agent-dot").getAttribute("data-level") : null;
}

describe("distributor control room", () => {
  beforeEach(() => {
    api.reset();
    signIn("distributor");
    api.on("get", "/map/agents", (_body, config) => mapAt(Number(config?.params?.["at_hour"] ?? 0)));
    api.on("get", "/swaps", () => ({ items: [], total: 4, page: 1, page_size: 1, advisory: true }));
    api.on("get", "/anomalies", () => ({ items: [], total: 2, page: 1, page_size: 1, advisory: true }));
    api.on("get", "/system/freshness", () => ({ last_forecast_at: AS_OF, model_version: "lgbm-q-2026.03" }));
  });

  it("recolours the dots when the time scrubber moves", async () => {
    renderPage();
    await waitFor(() => expect(rowIds()).toEqual([2, 1, 3]));
    expect(dotLevel(1)).toBe("green");
    expect(dotLevel(2)).toBe("amber");

    fireEvent.change(screen.getByRole("slider", { name: "Time ahead" }), { target: { value: "24" } });
    await waitFor(() => expect(dotLevel(1)).toBe("red"));
    expect(dotLevel(2)).toBe("red");
    expect(dotLevel(3)).toBe("amber");
    expect(api.get).toHaveBeenCalledWith("/map/agents", { params: { at_hour: 24 } });
    expect(screen.getByTestId("control-room")).toHaveAttribute("data-hour", "24");
    expect(screen.getByTestId("kpi-red")).toHaveAttribute("data-count", "2");
  });

  it("filters by risk level, search and district", async () => {
    renderPage();
    await waitFor(() => expect(rowIds()).toHaveLength(3));

    fireEvent.click(screen.getByTestId("filter-green"));
    expect(rowIds()).toEqual([2]);
    expect(screen.getByTestId("filter-count")).toHaveTextContent("1 of 3 agents");

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search name, code or area" }), { target: { value: "tongi" } });
    expect(rowIds()).toEqual([3]);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search name, code or area" }), { target: { value: "" } });
    fireEvent.change(screen.getByRole("combobox", { name: "District" }), { target: { value: "Dhaka" } });
    expect(rowIds()).toEqual([2, 1]);

    fireEvent.click(screen.getByTestId("filter-amber"));
    fireEvent.click(screen.getByTestId("filter-green"));
    expect(screen.getByText("No agents match")).toBeInTheDocument();
  });

  it("shows only what the role-scoped endpoint returns; scope is never sent from the client", async () => {
    renderPage();
    await waitFor(() => expect(rowIds()).toHaveLength(3));
    const mapCalls = api.get.mock.calls.filter(([path]) => path === "/map/agents");
    expect(mapCalls.length).toBeGreaterThan(0);
    for (const [, config] of mapCalls) expect(config).toEqual({ params: { at_hour: 0 } });
    expect(rowIds().sort()).toEqual(mapAt(0).agents.map((a) => a.agent_id).sort());
    expect(screen.getByTestId("kpi-amber")).toHaveAttribute("data-count", "1");
    expect(screen.getByTestId("kpi-green")).toHaveAttribute("data-count", "2");
  });

  it("adds control room commands to the Ctrl+K palette while mounted", async () => {
    const view = renderPage();
    await waitFor(() => expect(rowIds()).toHaveLength(3));
    fireEvent.change(screen.getByRole("slider", { name: "Time ahead" }), { target: { value: "24" } });
    await waitFor(() => expect(dotLevel(3)).toBe("amber"));

    const red = usePageActionsStore.getState().actions.find((a) => a.id === "cr-red");
    expect(red).toBeDefined();
    act(() => red?.run());
    expect(rowIds()).toEqual([1, 2]);

    view.unmount();
    expect(usePageActionsStore.getState().actions).toEqual([]);
  });

  it("opens the inspector from the list on small screens and goes back", async () => {
    api.on("post", "/agents/2/whatif", () => {
      throw new Error("not needed here");
    });
    api.on("get", "/agents/2/explanations", () => {
      throw new Error("not needed here");
    });
    renderPage();
    await waitFor(() => expect(rowIds()).toHaveLength(3));
    fireEvent.click(screen.getAllByTestId("agent-row")[0] as HTMLElement);

    const inspector = await screen.findByTestId("inspector");
    expect(within(inspector).getByRole("heading", { name: "Savar Bazar Store" })).toBeInTheDocument();
    fireEvent.click(within(inspector).getByRole("button", { name: "Back to the list" }));
    expect(screen.queryByTestId("inspector")).not.toBeInTheDocument();
    expect(rowIds()).toHaveLength(3);
  });
});
