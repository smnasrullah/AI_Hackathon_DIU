import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryClient } from "../../lib/queryClient";
import { logoutRequest } from "./authApi";
import { useAuthStore } from "./authStore";
import { LogoutButton } from "./LogoutButton";
import { RoleGuard } from "./RoleGuard";
import { logout } from "./session";
import { broadcast, subscribe, type SessionMessage } from "./sessionChannel";
import { SessionRoot } from "./SessionRoot";
import { signIn } from "./testUtils";

vi.mock("./authApi", () => ({ logoutRequest: vi.fn() }));

const tabs = vi.hoisted(() => ({ handlers: [] as ((msg: SessionMessage) => void)[] }));
vi.mock("./sessionChannel", () => ({
  broadcast: vi.fn(),
  subscribe: vi.fn((handler: (msg: SessionMessage) => void) => {
    tabs.handlers.push(handler);
    return () => undefined;
  }),
}));

function renderApp(entries: string[]) {
  const router = createMemoryRouter(
    [
      {
        element: <SessionRoot />,
        children: [
          { path: "/login", element: <p>Login page</p> },
          {
            path: "/agent/*",
            element: (
              <RoleGuard roles={["agent"]}>
                <p>Agent area</p>
                <LogoutButton />
              </RoleGuard>
            ),
          },
        ],
      },
    ],
    { initialEntries: entries, initialIndex: entries.length - 1 },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("logout", () => {
  beforeEach(() => {
    vi.mocked(logoutRequest).mockReset().mockResolvedValue(undefined);
    vi.mocked(broadcast).mockClear();
    tabs.handlers = [];
    window.localStorage.clear();
    window.sessionStorage.clear();
    signIn("agent");
  });

  it("revokes on the server and clears store, query cache and storage", async () => {
    queryClient.setQueryData(["agents", 1], { code: "AGT-0001" });
    window.localStorage.setItem("agentpulse-ui", "x");
    window.sessionStorage.setItem("agentpulse-draft", "y");
    window.localStorage.setItem("unrelated", "keep");

    await logout();

    expect(logoutRequest).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({ status: "signedOut", accessToken: null, user: null });
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(window.localStorage.getItem("agentpulse-ui")).toBeNull();
    expect(window.sessionStorage.getItem("agentpulse-draft")).toBeNull();
    expect(window.localStorage.getItem("unrelated")).toBe("keep");
    expect(broadcast).toHaveBeenCalledWith({ type: "logout" });
  });

  it("still clears locally when the server is unreachable", async () => {
    vi.mocked(logoutRequest).mockRejectedValue(new Error("offline"));
    await logout();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("button logs out, replaces history, and Back cannot reopen the page", async () => {
    const router = renderApp(["/agent", "/agent/forecast"]);
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));

    await act(() => router.navigate(-1));
    expect(router.state.location.pathname).toBe("/login");
    expect(screen.queryByText("Agent area")).not.toBeInTheDocument();
  });

  it("logs out when another tab logs out", async () => {
    const router = renderApp(["/agent"]);
    expect(subscribe).toHaveBeenCalled();
    act(() => tabs.handlers.forEach((deliver) => deliver({ type: "logout" })));
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(useAuthStore.getState().user).toBeNull();
    expect(logoutRequest).not.toHaveBeenCalled();
  });
});
