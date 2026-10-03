import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HelpRequestItem, HelpRequestPage } from "../../api/types";
import { useToastStore } from "../../components/ui/toastStore";
import { api as realApi } from "../../lib/api";
import { formatMoney } from "../../lib/format";
import type { FakeApi } from "../../test/fakeApi";
import { AgentHelpPage } from "./AgentHelpPage";
import { HelpNeededCard } from "./HelpNeededCard";

vi.mock("../../lib/api", async () => {
  const { createFakeApi } = await import("../../test/fakeApi");
  return { api: createFakeApi(), authClient: { post: vi.fn() }, refreshAccessToken: vi.fn() };
});

const api = realApi as unknown as FakeApi;

// Fixed clock for the card tests: the deadline is two hours after "now".
const DEADLINE = "2026-03-10T09:40:00Z";
const NOW = new Date("2026-03-10T07:40:00Z");
const MONEY = formatMoney(15000, "en", { lang: "en" });

function item(over: Partial<HelpRequestItem> = {}): HelpRequestItem {
  return {
    id: 7,
    view: "recipient",
    requester: { agent_id: 3, code: "AGT-0003", name: "Mirpur 10 Mobile Point", upazila: "Mirpur", district: "Dhaka" },
    float_type: "cash",
    amount_needed: 15000,
    needed_by: DEADLINE,
    status: "open",
    wave_number: 1,
    created_by: "system",
    created_at: "2026-03-10T06:00:00Z",
    updated_at: "2026-03-10T06:00:00Z",
    claimed_at: null,
    claim_expires_at: null,
    fulfilled_at: null,
    my_response: "none",
    claimed_by_me: false,
    my_distance_km: 1.2,
    simulated: false,
    reason_summary: null,
    claimed_by: null,
    recipients: null,
    advisory: true,
    urgent: false,
    deadline_asap: false,
    reason_category: "unknown",
    can_confirm_late: false,
    ...over,
  };
}

function page(items: HelpRequestItem[]): HelpRequestPage {
  return { items, total: items.length, page: 1, page_size: 50 };
}

function client(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderCard(card: HelpRequestItem, now: Date = NOW) {
  render(
    <QueryClientProvider client={client()}>
      <MemoryRouter>
        <HelpNeededCard item={card} now={now} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** An axios-shaped error the way the API client delivers a 409 from the server. */
function conflict(detail: string): Error {
  return Object.assign(new Error("Request failed with status code 409"), {
    isAxiosError: true,
    response: { status: 409, data: { detail } },
  });
}

describe("HelpNeededCard", () => {
  beforeEach(() => {
    api.reset();
    useToastStore.setState({ toasts: [] });
  });

  it("shows who asks, how much, the time left and the distance", () => {
    renderCard(item());
    const card = screen.getByTestId("help-needed-7");
    expect(card).toHaveTextContent("Mirpur 10 Mobile Point · Mirpur");
    expect(card).toHaveTextContent(`Needs ${MONEY} Cash`);
    expect(card).toHaveTextContent("1.2 km away");
    expect(screen.getByTestId("help-countdown")).toHaveTextContent("2h");
    expect(screen.getByTestId("help-countdown")).toHaveTextContent("left");
    expect(screen.getByTestId("help-countdown")).toHaveAttribute("dateTime", DEADLINE);
  });

  it("says time is up after the deadline and disables claiming", () => {
    renderCard(item(), new Date("2026-03-10T10:00:00Z"));
    expect(screen.getByTestId("help-countdown")).toHaveTextContent("Time is up");
    expect(screen.getByRole("button", { name: "I can help" })).toBeDisabled();
  });

  it("sends the claim and confirms it with a toast", async () => {
    api.on("post", "/liquidity-requests/7/claim", () => item({ status: "claimed", my_response: "accepted", claimed_by_me: true }));
    renderCard(item());
    fireEvent.click(screen.getByRole("button", { name: "I can help" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/liquidity-requests/7/claim"));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.title).toBe("You said yes. The requester will confirm when the money arrives."));
  });

  it("shows the next step once the refreshed card says I hold the claim", () => {
    renderCard(item({ status: "claimed", my_response: "accepted", claimed_by_me: true }));
    expect(screen.getByTestId("help-next-step")).toHaveTextContent(
      `Next step: send ${MONEY} Cash to Mirpur 10 Mobile Point, then wait for their confirmation.`,
    );
    expect(screen.getByRole("button", { name: "Withdraw" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "I can help" })).not.toBeInTheDocument();
  });

  it("reports any other failure as a plain error", async () => {
    api.on("post", "/liquidity-requests/7/decline", () => {
      throw new Error("network");
    });
    renderCard(item());
    fireEvent.click(screen.getByRole("button", { name: "I can't help" }));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.tone).toBe("error"));
  });
});

describe("AgentHelpPage: claim conflicts and states", () => {
  beforeEach(() => {
    api.reset();
    useToastStore.setState({ toasts: [] });
  });

  // Real clock here, so the deadline is always in the future for the buttons to work.
  const SOON = new Date(Date.now() + 2 * 3_600_000).toISOString();

  function renderPage() {
    render(
      <QueryClientProvider client={client()}>
        <MemoryRouter>
          <AgentHelpPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("shows a friendly message on 'already taken' and removes the request after the refresh", async () => {
    let taken = false;
    api.on("get", "/liquidity-requests/inbox", () => page(taken ? [] : [item({ needed_by: SOON })]));
    api.on("get", "/liquidity-requests/mine", () => page([]));
    api.on("post", "/liquidity-requests/7/claim", () => {
      taken = true;
      throw conflict("already_taken");
    });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "I can help" }));

    await waitFor(() =>
      expect(useToastStore.getState().toasts[0]?.title).toBe("Someone else already accepted this one. The list is up to date."),
    );
    expect(useToastStore.getState().toasts[0]?.tone).toBe("warning");
    expect(await screen.findByText("Nobody needs help from you right now")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/liquidity-requests/inbox", expect.anything());
  });

  it("shows the empty states when nothing is asked of me and I have no open request", async () => {
    api.on("get", "/liquidity-requests/inbox", () => page([]));
    api.on("get", "/liquidity-requests/mine", () => page([]));
    renderPage();
    expect(await screen.findByText("Nobody needs help from you right now")).toBeInTheDocument();
    expect(screen.getByText("You have no open request")).toBeInTheDocument();
  });

  it("shows an error with a retry that asks again", async () => {
    api.on("get", "/liquidity-requests/inbox", () => {
      throw new Error("down");
    });
    api.on("get", "/liquidity-requests/mine", () => page([]));
    renderPage();
    const retry = await screen.findByRole("button", { name: "Try again" });
    api.on("get", "/liquidity-requests/inbox", () => page([item({ needed_by: SOON })]));
    fireEvent.click(retry);
    expect(await screen.findByTestId("help-needed-7")).toBeInTheDocument();
  });
});
