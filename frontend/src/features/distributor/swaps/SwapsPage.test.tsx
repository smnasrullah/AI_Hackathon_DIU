import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useToastStore } from "../../../components/ui/toastStore";
import { api as realApi } from "../../../lib/api";
import type { FakeApi } from "../../../test/fakeApi";
import { signIn } from "../../auth/testUtils";
import { swapItem, swapPage } from "../testFixtures";
import { renderAt } from "../testRender";
import { SwapsPage } from "./SwapsPage";

vi.mock("../../../lib/api", async () => {
  const { createFakeApi } = await import("../../../test/fakeApi");
  return { api: createFakeApi(), authClient: { post: vi.fn() }, refreshAccessToken: vi.fn() };
});

const api = realApi as unknown as FakeApi;

function byStatus(status: unknown) {
  if (status === "pending") return swapPage([swapItem({ id: 7 }), swapItem({ id: 8, receiver: { agent_id: 3, code: "A003", name: "Mita Pharmacy", upazila: null, response: "declined" } })]);
  if (status === "approved") return swapPage([swapItem({ id: 5, status: "approved", note: "Both agreed", decided_at: "2026-03-10T07:00:00Z" })]);
  return swapPage([]);
}

function openCard(id: number) {
  const card = screen.getAllByTestId("swap-card").find((c) => c.getAttribute("data-swap-id") === String(id));
  fireEvent.click(card as HTMLElement);
  return screen.findByTestId("handshake");
}

describe("swap queue", () => {
  beforeEach(() => {
    api.reset();
    useToastStore.setState({ toasts: [] });
    signIn("distributor");
    api.on("get", "/swaps", (_b, config) => byStatus(config?.params?.["status"]));
    api.on("post", "/swaps/7/decision", (body) => swapItem({ id: 7, status: (body as { decision: string }).decision === "approve" ? "approved" : "rejected" }));
  });

  it("shows Pending / Approved / Rejected columns with counts", async () => {
    renderAt("/distributor/swaps", "/distributor/swaps", <SwapsPage />);
    await waitFor(() => expect(screen.getByTestId("swap-count-pending")).toHaveTextContent("2"));
    expect(screen.getByTestId("swap-count-approved")).toHaveTextContent("1");
    expect(within(screen.getByTestId("swap-column-approved")).getByText("Note: Both agreed")).toBeInTheDocument();
    expect(within(screen.getByTestId("swap-column-rejected")).getByText("No rejected swaps")).toBeInTheDocument();
  });

  it("approves only after a note and a full hold, then logs the note", async () => {
    renderAt("/distributor/swaps", "/distributor/swaps", <SwapsPage />);
    await screen.findAllByTestId("swap-card");
    const dialog = await openCard(7);
    expect(screen.getByTestId("location")).toHaveTextContent("swap=7");
    const hold = within(dialog).getByRole("button", { name: /hold to approve swap/i });
    expect(hold).toBeDisabled();

    fireEvent.change(within(dialog).getByTestId("handshake-note"), { target: { value: "Both shops are on the same road" } });
    expect(hold).toBeEnabled();
    fireEvent.pointerDown(hold);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/swaps/7/decision", { decision: "approve", note: "Both shops are on the same road" }), { timeout: 2500 });
    await waitFor(() => expect(useToastStore.getState().toasts.map((t) => t.title)).toContain("Swap approved"));
    await waitFor(() => expect(screen.queryByTestId("handshake")).not.toBeInTheDocument());
  });

  it("rejects after a confirm step", async () => {
    renderAt("/distributor/swaps?swap=7", "/distributor/swaps", <SwapsPage />);
    const dialog = await screen.findByTestId("handshake");
    fireEvent.change(within(dialog).getByTestId("handshake-note"), { target: { value: "Too far for cash" } });
    fireEvent.click(within(dialog).getByTestId("handshake-reject"));
    fireEvent.click(await screen.findByRole("button", { name: "Reject swap" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/swaps/7/decision", { decision: "reject", note: "Too far for cash" }));
  });

  it("blocks approval when an agent declined", async () => {
    renderAt("/distributor/swaps", "/distributor/swaps", <SwapsPage />);
    await screen.findAllByTestId("swap-card");
    const dialog = await openCard(8);
    fireEvent.change(within(dialog).getByTestId("handshake-note"), { target: { value: "Checking this one" } });
    expect(within(dialog).getByRole("alert")).toHaveTextContent("declined this swap");
    expect(within(dialog).getByRole("button", { name: /hold to approve swap/i })).toBeDisabled();
  });
});
