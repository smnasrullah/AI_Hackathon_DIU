import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentRecommendation, RecommendationItem, RequestItem, RequestStatus, SwapItem, SwapPage } from "../../../api/types";
import { api as realApi } from "../../../lib/api";
import type { FakeApi } from "../../../test/fakeApi";
import { signIn } from "../../auth/testUtils";
import { AS_OF, CASH_STOCKOUT, NO_RECOMMENDATION } from "../testFixtures";
import { RebalancePage } from "./RebalancePage";

vi.mock("../../../lib/api", async () => {
  const { createFakeApi } = await import("../../../test/fakeApi");
  return { api: createFakeApi(), authClient: { post: vi.fn() }, refreshAccessToken: vi.fn() };
});

const api = realApi as unknown as FakeApi;

const ITEM: RecommendationItem = {
  id: 7,
  kind: "add_cash",
  float_type: "cash",
  amount_bdt: 40_000,
  deadline_at: "2026-03-10T08:00:00Z",
  channel: "van",
  status: "open",
  van_route_id: null,
  rationale: {
    alternatives: [],
    balance_bdt: 18_000,
    buffer_bdt: 10_000,
    capacity_bdt: 150_000,
    capped: false,
    horizon_h: 24,
    lead_time_h: 2,
    need_bdt: 58_000,
    risk_level: "red",
    risk_probability: 0.82,
    rule_trace: [],
    shortfall_bdt: 30_000,
    stockout_at: CASH_STOCKOUT,
    urgent: false,
  },
};

const RECOMMENDATION: AgentRecommendation = { ...NO_RECOMMENDATION, items: [ITEM] };

function request(status: RequestStatus, note: string | null = null): RequestItem {
  return {
    id: 3,
    recommendation_id: ITEM.id,
    agent: { agent_id: 1, code: "AGT-0001", name: "Mirpur 10 Mobile Point" },
    float_type: "cash",
    amount_bdt: ITEM.amount_bdt,
    channel: ITEM.channel,
    deadline_at: ITEM.deadline_at,
    created_at: AS_OF,
    decided_at: null,
    decided_by: null,
    requested_by: "00000000-0000-0000-0000-000000000001",
    note,
    status,
    advisory: true,
  };
}

const SWAP: SwapItem = {
  id: 11,
  float_type: "cash",
  amount_bdt: 15_000,
  distance_km: 1.2,
  score: 0.8,
  status: "pending",
  van_trip_saved: true,
  note: null,
  deadline_at: "2026-03-10T08:00:00Z",
  decided_at: null,
  generated_at: AS_OF,
  model_version: "swap-1",
  donor: { agent_id: 2, code: "AGT-0002", name: "Mirpur 2 Store", upazila: "Mirpur", response: null },
  receiver: { agent_id: 1, code: "AGT-0001", name: "Mirpur 10 Mobile Point", upazila: "Mirpur", response: null },
};

function swapPage(items: SwapItem[]): SwapPage {
  return { items, total: items.length, page: 1, page_size: 20, van_trips_avoided: 0, advisory: true };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <RebalancePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("rebalance page", () => {
  let requests: RequestItem[] = [];

  beforeEach(() => {
    api.reset();
    signIn("agent");
    requests = [];
    api.on("get", "/agents/1/recommendation", () => RECOMMENDATION);
    api.on("get", "/recommendation-requests", () => ({ items: requests, total: requests.length, page: 1, page_size: 100 }));
    api.on("get", "/swaps", () => swapPage([]));
  });

  it("asks the distributor after a confirm and shows the request status", async () => {
    api.on("post", "/recommendations/7/request", () => {
      requests = [request("requested")];
      return requests[0];
    });
    renderPage();
    const card = await screen.findByTestId("recommendation-7");
    fireEvent.click(within(card).getByRole("button", { name: "Ask my distributor" }));
    expect(api.post).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("button", { name: "Send request" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/recommendations/7/request"));
    const status = await within(card).findByTestId("request-status");
    expect(status).toHaveAttribute("data-status", "requested");
    expect(status).toHaveTextContent("waiting for your distributor");
    expect(within(card).queryByRole("button", { name: "Ask my distributor" })).not.toBeInTheDocument();
  });

  it.each([
    ["approved", "Approved by your distributor"],
    ["declined", "Declined by your distributor"],
    ["fulfilled", "Delivered"],
  ] as const)("shows a %s request from the distributor", async (status, text) => {
    requests = [request(status, "Van at 3 pm")];
    renderPage();
    const line = await screen.findByTestId("request-status");
    expect(line).toHaveAttribute("data-status", status);
    expect(line).toHaveTextContent(text);
    expect(screen.getByText("Distributor note: Van at 3 pm")).toBeInTheDocument();
  });

  it("accepts a swap offer only after a confirm", async () => {
    api.on("get", "/swaps", () => swapPage([SWAP]));
    api.on("post", "/swaps/11/respond", () => ({ ...SWAP, receiver: { ...SWAP.receiver, response: "accepted" } }));
    renderPage();
    const offer = await screen.findByTestId("swap-offer-11");
    expect(offer).toHaveTextContent("Get ৳15,000 Cash from Mirpur 2 Store");
    fireEvent.click(within(offer).getByRole("button", { name: "Accept" }));
    expect(api.post).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/swaps/11/respond", { response: "accept" }));
  });
});
