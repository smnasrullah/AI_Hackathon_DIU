import { act, render, screen, waitFor } from "@testing-library/react";
import { AxiosError, type AxiosResponse } from "axios";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { authClient } from "../../lib/api";
import { useAuthStore } from "./authStore";
import { ForbiddenPage } from "./ForbiddenPage";
import { HomeRedirect } from "./HomeRedirect";
import { RoleGuard } from "./RoleGuard";
import { signIn, signOut } from "./testUtils";

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: "/", element: <HomeRedirect /> },
      { path: "/login", element: <p>Login page</p> },
      { path: "/403", element: <ForbiddenPage /> },
      { path: "/agent", element: <RoleGuard roles={["agent"]}><p>Agent home</p></RoleGuard> },
      {
        path: "/distributor",
        element: <RoleGuard roles={["distributor"]}><p>Distributor home</p></RoleGuard>,
      },
      { path: "/admin", element: <RoleGuard roles={["admin"]}><p>Admin home</p></RoleGuard> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

const originalAuthAdapter = authClient.defaults.adapter;

describe("RoleGuard", () => {
  beforeEach(() => signOut());
  afterEach(() => {
    authClient.defaults.adapter = originalAuthAdapter;
  });

  it("renders nothing while the session check is running", () => {
    useAuthStore.setState({ status: "checking" });
    const router = renderAt("/agent");
    expect(router.state.location.pathname).toBe("/agent");
    expect(screen.queryByText("Agent home")).not.toBeInTheDocument();
  });

  it("re-checks the session when the page is restored from the back/forward cache", async () => {
    signIn("agent");
    authClient.defaults.adapter = (config) => {
      const response: AxiosResponse = {
        data: { detail: "invalid_refresh_token" },
        status: 401,
        statusText: "Unauthorized",
        headers: {},
        config,
      };
      return Promise.reject(new AxiosError("401", "ERR_BAD_REQUEST", config, null, response));
    };
    const router = renderAt("/agent");
    expect(screen.getByText("Agent home")).toBeInTheDocument();
    const restored = new Event("pageshow");
    Object.defineProperty(restored, "persisted", { value: true });
    act(() => {
      window.dispatchEvent(restored);
    });
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(useAuthStore.getState().notice).toBe("session_expired");
  });

  it("sends signed-out users to login and remembers the page", () => {
    const router = renderAt("/distributor");
    expect(screen.getByText("Login page")).toBeInTheDocument();
    expect(router.state.location.state).toEqual({ from: "/distributor" });
  });

  it("renders the page for the allowed role", () => {
    signIn("distributor");
    renderAt("/distributor");
    expect(screen.getByText("Distributor home")).toBeInTheDocument();
  });

  it.each([
    ["agent", "/distributor"],
    ["agent", "/admin"],
    ["distributor", "/agent"],
    ["distributor", "/admin"],
    ["admin", "/agent"],
  ] as const)("shows 403 when %s opens %s", (role, path) => {
    signIn(role);
    renderAt(path);
    expect(screen.getByText("This page is not for your role")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to my home" })).toHaveAttribute(
      "href",
      `/${role}`,
    );
  });

  it.each(["agent", "distributor", "admin"] as const)("redirects / to the %s home", (role) => {
    signIn(role);
    const router = renderAt("/");
    expect(router.state.location.pathname).toBe(`/${role}`);
  });
});
