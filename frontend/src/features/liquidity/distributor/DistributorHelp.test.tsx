import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HelpRequestItem } from "../../../api/types";
import { useToastStore } from "../../../components/ui/toastStore";
import { api as realApi } from "../../../lib/api";
import type { FakeApi } from "../../../test/fakeApi";
import { signIn } from "../../auth/testUtils";
import { renderAt } from "../../distributor/testRender";
import { HelpRequestDetail } from "./HelpRequestDetail";
import { HelpRequestList } from "./HelpRequestList";

vi.mock("../../../lib/api", async () => {
  const { createFakeApi } = await import("../../../test/fakeApi");
  return { api: createFakeApi(), authClient: { post: vi.fn() }, refreshAccessToken: vi.fn() };
});

const api = realApi as unknown as FakeApi;
const toasts = () => useToastStore.getState().toasts.map((t) => t.title);

function request(over: Partial<HelpRequestItem> = {}): HelpRequestItem {
  return {
    id: 7,
    view: "owner",
    requester: { agent_id: 1, code: "AGT-0001", name: "Mirpur 10 Mobile Point", upazila: "Mirpur", district: "Dhaka" },
    float_type: "cash",
    amount_needed: 15000,
    needed_by: "2026-03-10T09:40:00Z",
    status: "open",
    created_by: "system",
    created_at: "2026-03-10T06:00:00Z",
    updated_at: "2026-03-10T06:00:00Z",
    claimed_at: null,
    claim_expires_at: null,
    fulfilled_at: null,
    my_response: null,
    claimed_by_me: false,
    my_distance_km: null,
    simulated: false,
    reason_summary: "Cash is forecast to run out in about 3 hours.",
    claimed_by: null,
    recipients: [],
    advisory: true,
    urgent: false,
    deadline_asap: false,
    reason_category: "unknown",
    can_confirm_late: false,
    wave_number: 1,
    max_waves: 3,
    is_last_wave: false,
    ...over,
  };
}

const page = (items: HelpRequestItem[], total = items.length, n = 1) => ({ items, total, page: n, page_size: 25 });

describe("distributor help request detail", () => {
  beforeEach(() => {
    api.reset();
    useToastStore.setState({ toasts: [] });
    signIn("distributor");
  });

  it("cancels its own agent's request only after confirming", async () => {
    api.on("get", "/liquidity-requests/7", () => request());
    api.on("post", "/liquidity-requests/7/cancel", () => request({ status: "cancelled" }));
    renderAt("/distributor/help-requests/7", "/distributor/help-requests/:id", <HelpRequestDetail id={7} />);
    fireEvent.click(await screen.findByTestId("help-dist-cancel"));
    const dialog = await screen.findByRole("dialog");
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: /cancel request/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/liquidity-requests/7/cancel", {}));
    await waitFor(() => expect(toasts().length).toBe(1));
  });

  it("dismissing the cancel dialog sends nothing", async () => {
    api.on("get", "/liquidity-requests/7", () => request());
    renderAt("/distributor/help-requests/7", "/distributor/help-requests/:id", <HelpRequestDetail id={7} />);
    fireEvent.click(await screen.findByTestId("help-dist-cancel"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.post).not.toHaveBeenCalled();
  });

  it("hides Cancel for a request that is not from its own agents", async () => {
    api.on("get", "/liquidity-requests/7", () => request({ view: "recipient", recipients: null, reason_summary: null }));
    renderAt("/distributor/help-requests/7", "/distributor/help-requests/:id", <HelpRequestDetail id={7} />);
    await screen.findByText(/Mirpur 10 Mobile Point/);
    expect(screen.queryByTestId("help-dist-cancel")).not.toBeInTheDocument();
  });

  it("confirms the money arrived on a claimed request", async () => {
    api.on("get", "/liquidity-requests/7", () => request({ status: "claimed" }));
    api.on("post", "/liquidity-requests/7/confirm", () => request({ status: "fulfilled" }));
    renderAt("/distributor/help-requests/7", "/distributor/help-requests/:id", <HelpRequestDetail id={7} />);
    fireEvent.click(await screen.findByRole("button", { name: "Confirm money received" }));
    const dialog = await screen.findByRole("dialog");
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm money received" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/liquidity-requests/7/confirm", {}));
  });

  it("shows Urgent and the last-wave flag as text, not colour alone", async () => {
    api.on("get", "/liquidity-requests/7", () => request({ urgent: true, wave_number: 3, is_last_wave: true }));
    renderAt("/distributor/help-requests/7", "/distributor/help-requests/:id", <HelpRequestDetail id={7} />);
    expect(await screen.findByTestId("help-urgent")).toHaveTextContent("Urgent");
    expect(screen.getByTestId("help-attention")).toHaveTextContent("Reached the last wave");
  });
});

describe("distributor help request list", () => {
  beforeEach(() => {
    api.reset();
    signIn("distributor");
  });

  it("flags urgent and last-wave rows and loads more than the first page", async () => {
    const first = Array.from({ length: 25 }, (_, i) => request({ id: i + 1, urgent: i === 0, is_last_wave: i === 1, wave_number: i === 1 ? 3 : 1 }));
    api.on("get", "/liquidity-requests/mine", (_body, config) => {
      const n = (config as { params?: { page?: number } } | undefined)?.params?.page ?? 1;
      return n === 1 ? page(first, 26, 1) : page([request({ id: 26 })], 26, 2);
    });
    renderAt("/distributor/help-requests", "/distributor/help-requests", <HelpRequestList />);
    const urgentRow = await screen.findByTestId("help-row-1");
    expect(within(urgentRow).getByTestId("help-urgent")).toHaveTextContent("Urgent");
    expect(within(screen.getByTestId("help-row-2")).getByTestId("help-attention")).toHaveTextContent("Reached the last wave");
    expect(screen.queryByTestId("help-row-26")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("help-load-more"));
    expect(await screen.findByTestId("help-row-26")).toBeInTheDocument();
    expect(screen.queryByTestId("help-load-more")).not.toBeInTheDocument();
  });
});
