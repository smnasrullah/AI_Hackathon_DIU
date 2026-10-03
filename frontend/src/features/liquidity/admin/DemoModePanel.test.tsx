import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DemoHelpInfo, SimulateOut } from "../../../api/types";
import { useToastStore } from "../../../components/ui/toastStore";
import { api as realApi } from "../../../lib/api";
import type { FakeApi } from "../../../test/fakeApi";
import { signIn } from "../../auth/testUtils";
import { renderAt } from "../../distributor/testRender";
import { DemoModePanel } from "./DemoModePanel";
import { DemoShortage } from "./DemoShortage";

vi.mock("../../../lib/api", async () => {
  const { createFakeApi } = await import("../../../test/fakeApi");
  return { api: createFakeApi(), authClient: { post: vi.fn() }, refreshAccessToken: vi.fn() };
});

const api = realApi as unknown as FakeApi;
const toasts = () => useToastStore.getState().toasts.map((t) => t.title);

const INFO: DemoHelpInfo = {
  demo_mode: true,
  defaults_on: true,
  overrides: [
    { name: "max_recipients_per_wave", value: 1 },
    { name: "wave_timeout_min", value: 2 },
  ],
  auto_per_day: 1,
  start_delay_s: 120,
  last_reset_at: null,
};

describe("demo mode panel", () => {
  beforeEach(() => {
    api.reset();
    useToastStore.setState({ toasts: [] });
    signIn("admin");
    api.on("get", "/admin/liquidity-requests/demo", () => INFO);
  });

  it("lists the demo defaults in force, read-only", async () => {
    renderAt("/admin/help-settings", "/admin/help-settings", <DemoModePanel />);
    const list = await screen.findByTestId("demo-overrides");
    expect(within(list).getByText("Helpers asked per wave")).toBeInTheDocument();
    expect(within(list).queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText(/at most 1 request\(s\) per shop and float per day/)).toBeInTheDocument();
  });

  it("resets only after confirming", async () => {
    api.on("post", "/admin/liquidity-requests/demo-reset", () => ({ cancelled_request_ids: [4, 5], agent_ids: [1], reset_at: "2026-10-03T08:00:00Z" }));
    renderAt("/admin/help-settings", "/admin/help-settings", <DemoModePanel />);
    fireEvent.click(await screen.findByTestId("demo-reset"));
    const dialog = await screen.findByRole("dialog");
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Reset demo help-request state" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/admin/liquidity-requests/demo-reset"));
    await waitFor(() => expect(toasts()).toContain("Demo state reset: 2 request(s) cancelled."));
  });

  it("cancelling the reset sends nothing", async () => {
    renderAt("/admin/help-settings", "/admin/help-settings", <DemoModePanel />);
    fireEvent.click(await screen.findByTestId("demo-reset"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe("simulate shortage result", () => {
  beforeEach(() => {
    api.reset();
    signIn("admin");
    api.on("get", "/agents", () => [{ id: 1, code: "AGT-0001", name: "Mirpur 10 Mobile Point" }]);
  });

  it("says clearly why no request was made", async () => {
    const blocked = { agent_id: 1, agent_code: "AGT-0001", float_type: "cash", created_request_ids: [], sent: true, dry_run: false, enabled: true, would_create: [], blocked_reason: "active_request" } as unknown as SimulateOut;
    api.on("post", "/admin/liquidity-requests/simulate-shortage", () => blocked);
    renderAt("/admin/help-settings", "/admin/help-settings", <DemoShortage />);
    const pick = await screen.findByTestId("demo-agent");
    fireEvent.change(pick, { target: { value: "1" } });
    fireEvent.click(screen.getByTestId("demo-simulate"));
    expect(await screen.findByTestId("demo-result")).toHaveTextContent("already has an open request");
  });
});
