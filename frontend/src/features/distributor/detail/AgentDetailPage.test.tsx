import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api as realApi } from "../../../lib/api";
import type { FakeApi } from "../../../test/fakeApi";
import { signIn } from "../../auth/testUtils";
import { agentSummary, anomalyItem, requestItem, swapItem, swapPage } from "../testFixtures";
import { renderAt } from "../testRender";
import { AgentDetailPage } from "./AgentDetailPage";

vi.mock("../../../lib/api", async () => {
  const { createFakeApi } = await import("../../../test/fakeApi");
  return { api: createFakeApi(), authClient: { post: vi.fn() }, refreshAccessToken: vi.fn() };
});

const api = realApi as unknown as FakeApi;
const ROUTE = "/distributor/agents/:id";
const ELSEWHERE = { code: "A009", name: "Other", upazila: null, response: null };

describe("agent detail", () => {
  beforeEach(() => {
    api.reset();
    signIn("distributor");
    api.on("get", "/agents/1/summary", () => agentSummary());
    api.on("get", "/swaps", () => swapPage([swapItem({ id: 7 }), swapItem({ id: 9, donor: { ...ELSEWHERE, agent_id: 4 }, receiver: { ...ELSEWHERE, agent_id: 5 } })]));
    api.on("get", "/anomalies", () => ({ items: [anomalyItem({})], total: 1, page: 1, page_size: 100, advisory: true }));
    api.on("get", "/recommendation-requests", () => ({ items: [requestItem({})], total: 1, page: 1, page_size: 100 }));
  });

  it("shows the hero and keeps the tab in the URL", async () => {
    renderAt("/distributor/agents/1?tab=activity", ROUTE, <AgentDetailPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "Karim Telecom" })).toBeInTheDocument();
    expect(screen.getByTestId("agent-hero")).toHaveAttribute("data-level", "red");
    const events = (await screen.findAllByTestId("activity-entry")).map((e) => e.getAttribute("data-event"));
    expect(events).toEqual(expect.arrayContaining(["request_requested", "swap_gives", "anomaly_flagged"]));

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Swaps" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("tab=swaps"));
    // Only this agent's swaps: 7 (gives), not 9.
    expect((await screen.findAllByTestId("swap-card")).map((c) => c.getAttribute("data-swap-id"))).toEqual(["7"]);
  });

  it("says when the agent is not in scope", async () => {
    api.on("get", "/agents/1/summary", () => {
      throw Object.assign(new Error("forbidden"), { isAxiosError: true, response: { status: 403, data: { detail: "forbidden" } } });
    });
    renderAt("/distributor/agents/1", ROUTE, <AgentDetailPage />);
    expect(await screen.findByText("Agent not found")).toBeInTheDocument();
  });

  it("rejects a malformed id without calling the API", () => {
    renderAt("/distributor/agents/abc", ROUTE, <AgentDetailPage />);
    expect(screen.getByText("Agent not found")).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });
});
