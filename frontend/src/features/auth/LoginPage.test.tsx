import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AxiosError, AxiosHeaders } from "axios";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { login } from "./authApi";
import { useAuthStore } from "./authStore";
import { LoginPage } from "./LoginPage";
import { makeUser, signOut } from "./testUtils";
import type { Role } from "./types";

vi.mock("./authApi", () => ({ login: vi.fn() }));

function renderLogin(from?: string) {
  const router = createMemoryRouter(
    [
      { path: "/login", element: <LoginPage /> },
      { path: "/agent/*", element: <p>Agent area</p> },
      { path: "/distributor/*", element: <p>Distributor area</p> },
      { path: "/admin/*", element: <p>Admin area</p> },
    ],
    { initialEntries: [{ pathname: "/login", state: from ? { from } : null }] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

function submit(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

function tokensFor(role: Role) {
  return {
    access_token: "a",
    refresh_token: "r",
    token_type: "bearer" as const,
    expires_in: 900,
    user: makeUser(role),
  };
}

function unauthorized(): AxiosError {
  const headers = new AxiosHeaders();
  return new AxiosError("401", "ERR_BAD_REQUEST", { headers }, null, {
    status: 401,
    statusText: "Unauthorized",
    data: { detail: "invalid_credentials" },
    headers: {},
    config: { headers },
  });
}

describe("LoginPage", () => {
  beforeEach(() => {
    signOut();
    vi.mocked(login).mockReset();
  });

  it("shows an error for a wrong password and stays signed out", async () => {
    vi.mocked(login).mockRejectedValue(unauthorized());
    renderLogin();
    submit("admin@agentpulse.demo", "wrong");
    expect(await screen.findByRole("alert")).toHaveTextContent("Email or password is incorrect.");
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("validates empty fields without calling the API", async () => {
    renderLogin();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Enter your email")).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it.each(["agent", "distributor", "admin"] as const)("redirects a %s to their home", async (role) => {
    vi.mocked(login).mockResolvedValue(tokensFor(role));
    const router = renderLogin();
    submit(`${role}@agentpulse.demo`, "pw");
    await waitFor(() => expect(router.state.location.pathname).toBe(`/${role}`));
    expect(useAuthStore.getState().refreshToken).toBe("r");
  });

  it("returns to the requested page only inside the role's own area", async () => {
    vi.mocked(login).mockResolvedValue(tokensFor("agent"));
    const router = renderLogin("/admin/users");
    submit("agent@agentpulse.demo", "pw");
    await waitFor(() => expect(router.state.location.pathname).toBe("/agent"));
  });

  it("demo chip fills the email", () => {
    renderLogin();
    fireEvent.click(screen.getByRole("button", { name: "Distributor" }));
    expect(screen.getByLabelText("Email")).toHaveValue("dist.dhaka@agentpulse.demo");
  });
});
