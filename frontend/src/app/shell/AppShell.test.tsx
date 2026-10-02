import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NotificationItem, NotificationPage } from "../../api/types";
import { logoutRequest } from "../../features/auth/authApi";
import { useAuthStore } from "../../features/auth/authStore";
import { signIn } from "../../features/auth/testUtils";
import { api as realApi } from "../../lib/api";
import type { FakeApi } from "../../test/fakeApi";
import { AppShell } from "./AppShell";
import { useShellStore } from "./shellStore";

vi.mock("../../lib/api", async () => {
  const { createFakeApi } = await import("../../test/fakeApi");
  return { api: createFakeApi(), authClient: { post: vi.fn() }, refreshAccessToken: vi.fn() };
});
vi.mock("../../features/auth/authApi", () => ({ logoutRequest: vi.fn() }));
vi.mock("../../features/auth/sessionChannel", () => ({ broadcast: vi.fn(), subscribe: vi.fn(() => () => undefined) }));

const api = realApi as unknown as FakeApi;

const unread: NotificationItem = {
  id: 7,
  type: "risk_change",
  severity: "critical",
  title_key: "notifications.risk_change",
  params: { agent_code: "AGT-0001", from: "green", to: "red", horizon_h: 24 },
  entity_type: "agent",
  entity_id: "1",
  read_at: null,
  created_at: new Date().toISOString(),
};

function inbox(items: NotificationItem[]): NotificationPage {
  return { items, page: 1, page_size: 20, total: items.length, unread_count: items.filter((n) => !n.read_at).length };
}

function renderShell(path = "/agent") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: "/login", element: <p>Login page</p> },
      {
        element: <AppShell />,
        children: [
          { path: "/agent", element: <h1>Agent home</h1> },
          { path: "/agent/forecast", element: <h1>Forecast page</h1> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe("app shell", () => {
  let items: NotificationItem[];

  beforeEach(() => {
    api.reset();
    vi.mocked(logoutRequest).mockReset().mockResolvedValue(undefined);
    useShellStore.setState({ paletteOpen: false, shortcutsOpen: false, tourReplay: false });
    items = [unread];
    api.on("get", "/notifications", () => inbox(items));
    api.on("post", "/notifications/7/read", () => {
      items = items.map((n) => (n.id === 7 ? { ...n, read_at: new Date().toISOString() } : n));
      return items[0];
    });
    api.on("get", "/system/freshness", () => ({
      generated_at: new Date().toISOString(),
      last_forecast_at: new Date(Date.now() - 2 * 60_000).toISOString(),
      llm_mode: "template",
      model_version: "v3",
      data_period: { start: "2026-06-01T00:00:00Z", end: "2026-09-30T00:00:00Z", holdout_start: "2026-09-16T00:00:00Z", sim_now: "2026-09-30T00:00:00Z" },
    }));
    api.on("get", "/search", (_body, config) => ({
      q: String(config?.params?.q ?? ""),
      items: [{ kind: "agent", key: "AGT-0001", label: "Mirpur 10 Mobile Point", sublabel: "Dhaka / Dhaka", path: "/agent/forecast", title_key: null }],
    }));
    signIn("agent");
  });

  it("logs out from the avatar menu", async () => {
    const router = renderShell();
    fireEvent.keyDown(screen.getByTestId("avatar-menu"), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Log out" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(logoutRequest).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("opens the command palette with Ctrl+K and jumps to a search hit", async () => {
    const router = renderShell();
    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: "k", ctrlKey: true });
    const palette = await screen.findByTestId("command-palette");
    fireEvent.change(within(palette).getByPlaceholderText("Jump to a page or agent…"), { target: { value: "AGT" } });

    const hit = await within(palette).findByText("AGT-0001 · Mirpur 10 Mobile Point");
    expect(api.get).toHaveBeenCalledWith("/search", expect.objectContaining({ params: { q: "AGT" } }));
    fireEvent.click(hit);
    await waitFor(() => expect(router.state.location.pathname).toBe("/agent/forecast"));
    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
  });

  it("marks a notification read from the bell panel", async () => {
    renderShell();
    const bell = await screen.findByRole("button", { name: "Notifications, 1 unread" });
    expect(screen.getByTestId("notification-badge")).toHaveTextContent("1");

    fireEvent.click(bell);
    const text = "AGT-0001: risk moved from Safe to Act now for the next 24h";
    expect(await screen.findByText(text)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `Mark as read: ${text}` }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/notifications/7/read"));
    await waitFor(() => expect(screen.queryByTestId("notification-badge")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: `Mark as read: ${text}` })).not.toBeInTheDocument();
  });

  it("shows shortcut help on ? and the freshness chip on prediction pages", async () => {
    renderShell();
    expect(await screen.findByText(/Updated .* ago · model v3/)).toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(document.body, { key: "?" });
    });
    expect(await screen.findByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
  });
});
