import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SwapItem, SwapPage } from "../../../api/types";
import { useToastStore } from "../../../components/ui/toastStore";
import { api as realApi } from "../../../lib/api";
import { usePrefsStore } from "../../../lib/prefs";
import type { FakeApi } from "../../../test/fakeApi";
import { signIn } from "../../auth/testUtils";
import { AS_OF } from "../testFixtures";
import { AgentSwapPage } from "./AgentSwapPage";

vi.mock("../../../lib/api", async () => {
  const { createFakeApi } = await import("../../../test/fakeApi");
  return { api: createFakeApi(), authClient: { post: vi.fn() }, refreshAccessToken: vi.fn() };
});

const api = realApi as unknown as FakeApi;
const ME = { agent_id: 1, code: "AGT-0001", name: "Mirpur 10 Mobile Point", upazila: "Mirpur", response: null };

function swap(id: number, over: Partial<SwapItem> = {}): SwapItem {
  return {
    id,
    float_type: "cash",
    amount_bdt: 182_500,
    distance_km: 0.99,
    score: 0.6,
    status: "pending",
    van_trip_saved: false,
    note: null,
    deadline_at: "2026-05-01T00:06:00Z",
    decided_at: null,
    generated_at: AS_OF,
    model_version: "swap-1",
    donor: { agent_id: 4, code: "AGT-0004", name: "Mirpur 11 Bazar Telecom", upazila: "Mirpur", response: null },
    receiver: ME,
    ...over,
  };
}

const INCOMING = swap(21);
const OUTGOING = swap(22, {
  amount_bdt: 20_000,
  donor: ME,
  receiver: { agent_id: 9, code: "AGT-0009", name: "Pallabi Corner Store", upazila: "Pallabi", response: "accepted" },
});

function page(items: SwapItem[]): SwapPage {
  return { items, total: items.length, page: 1, page_size: 100, van_trips_avoided: 0, advisory: true };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AgentSwapPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("agent swap page", () => {
  let items: SwapItem[];

  beforeEach(() => {
    api.reset();
    signIn("agent");
    items = [INCOMING, OUTGOING];
    api.on("get", "/swaps", () => page(items));
  });

  it("lists incoming and outgoing swaps with partner, distance, amount and deadline", async () => {
    renderPage();
    const incoming = await screen.findByTestId("swaps-incoming");
    const card = within(incoming).getByTestId("swap-offer-21");
    expect(card).toHaveTextContent("Get ৳1,82,500 Cash from Mirpur 11 Bazar Telecom");
    expect(card).toHaveTextContent("1.0 km away");
    expect(within(card).getByTestId("swap-deadline")).toHaveTextContent("Needed by");
    const outgoing = screen.getByTestId("swaps-outgoing");
    expect(within(outgoing).getByTestId("swap-offer-22")).toHaveTextContent("Give ৳20,000 Cash to Pallabi Corner Store");
    expect(within(outgoing).getByText("Pallabi Corner Store accepted")).toBeInTheDocument();
    // Whole-list query: decided swaps stay visible, not only pending ones.
    expect(api.get).toHaveBeenCalledWith("/swaps", { params: { page_size: 100 } });
  });

  it("accept updates the card at once and waits for the distributor", async () => {
    api.on("post", "/swaps/21/respond", () => {
      const answered = swap(21, { receiver: { ...ME, response: "accepted" } });
      items = [answered, OUTGOING];
      return answered;
    });
    renderPage();
    const card = await screen.findByTestId("swap-offer-21");
    fireEvent.click(within(card).getByRole("button", { name: "Accept" }));
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/swaps/21/respond", { response: "accept" }));

    const mine = await within(card).findByTestId("my-response");
    expect(mine).toHaveTextContent("You accepted · your distributor decides");
    expect(within(card).getByRole("button", { name: "Accept" })).toBeDisabled();
    expect(card).toHaveTextContent("Waiting for your distributor to decide · You can change your answer until your distributor decides.");
    // Changing the answer stays possible while pending.
    expect(within(card).getByRole("button", { name: "Decline" })).toBeEnabled();
    expect(useToastStore.getState().toasts.at(-1)?.title).toBe("You accepted the swap");
  });

  it("a swap the distributor already decided shows a clear message", async () => {
    api.on("post", "/swaps/21/respond", () => {
      throw Object.assign(new Error("409"), { isAxiosError: true, response: { status: 409, data: { detail: "already_decided" } } });
    });
    renderPage();
    const card = await screen.findByTestId("swap-offer-21");
    fireEvent.click(within(card).getByRole("button", { name: "Decline" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Decline" }));
    await waitFor(() => expect(useToastStore.getState().toasts.at(-1)?.title).toBe("Your distributor already decided this swap."));
  });

  it.each(["approved", "rejected"] as const)("a %s swap is locked: buttons disabled with a short explanation", async (status) => {
    items = [swap(21, { status, decided_at: AS_OF, note: "Both agreed", receiver: { ...ME, response: "accepted" } })];
    renderPage();
    const card = await screen.findByTestId("swap-offer-21");
    expect(within(card).getByTestId("swap-decision")).toHaveTextContent(status === "approved" ? "Approved by your distributor" : "Rejected by your distributor");
    expect(card).toHaveTextContent("Distributor note: Both agreed");
    expect(within(card).getByRole("button", { name: "Accept" })).toBeDisabled();
    expect(within(card).getByRole("button", { name: "Decline" })).toBeDisabled();
    expect(within(card).getByTestId("swap-locked")).toHaveTextContent("this swap is locked");
    expect(within(card).queryByText(/You can change your answer/)).toBeNull();
    expect(within(screen.getByTestId("swaps-outgoing")).getByText("Nothing here right now.")).toBeInTheDocument();
  });

  it("is Bangla first with Bangla digits", async () => {
    act(() => usePrefsStore.setState({ lang: "bn", digits: "bn" }));
    renderPage();
    const card = await screen.findByTestId("swap-offer-21");
    expect(card).toHaveTextContent("Mirpur 11 Bazar Telecom-এর কাছ থেকে");
    expect(within(card).getByTestId("swap-deadline")).toHaveTextContent("মধ্যে দরকার");
    expect(screen.getByRole("heading", { name: "আপনি পাবেন" })).toBeInTheDocument();
  });

  it("shows the empty state", async () => {
    items = [];
    renderPage();
    expect(await screen.findByText("No swap offers right now")).toBeInTheDocument();
  });

  it("shows an error with a working retry", async () => {
    let fail = true;
    api.on("get", "/swaps", () => {
      if (fail) throw new Error("network");
      return page(items);
    });
    renderPage();
    const retry = await screen.findByRole("button", { name: "Try again" });
    fail = false;
    fireEvent.click(retry);
    expect(await screen.findByTestId("swap-offer-21")).toBeInTheDocument();
  });
});
