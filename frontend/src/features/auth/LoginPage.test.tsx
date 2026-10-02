import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AxiosError, AxiosHeaders } from "axios";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { systemStatusKey, type SystemStatus } from "../../lib/systemStatus";
import { demoLogin, login } from "./authApi";
import { useAuthStore } from "./authStore";
import { LoginPage } from "./LoginPage";
import { signOut, tokensFor } from "./testUtils";

vi.mock("./authApi", () => ({ login: vi.fn(), demoLogin: vi.fn() }));

const STATUS: SystemStatus = {
  ready: true,
  bootstrap_state: "ready",
  db: true,
  migration_current: "0010",
  migration_head: "0010",
  seed: 42,
  data_version: "1.0.0",
  artifacts_ok: true,
  model_version: "1.0.0",
  llm_mode: "template",
  demo_mode: true,
  generated_at: "2026-10-01T00:00:00Z",
};

function renderLogin({ from, demoMode = true }: { from?: string; demoMode?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(systemStatusKey, { ...STATUS, demo_mode: demoMode });
  const router = createMemoryRouter(
    [
      { path: "/login", element: <LoginPage /> },
      { path: "/agent/*", element: <p>Agent area</p> },
      { path: "/distributor/*", element: <p>Distributor area</p> },
      { path: "/admin/*", element: <p>Admin area</p> },
    ],
    { initialEntries: [{ pathname: "/login", state: from ? { from } : null }] },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

function submit(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

function httpError(status: number, detail: string, extraHeaders: Record<string, string> = {}): AxiosError {
  const headers = new AxiosHeaders();
  return new AxiosError(String(status), "ERR_BAD_REQUEST", { headers }, null, {
    status,
    statusText: detail,
    data: { detail },
    headers: extraHeaders,
    config: { headers },
  });
}

describe("LoginPage", () => {
  beforeEach(() => {
    signOut();
    vi.mocked(login).mockReset();
    vi.mocked(demoLogin).mockReset();
  });

  it("shows an error for a wrong password and stays signed out", async () => {
    vi.mocked(login).mockRejectedValue(httpError(401, "invalid_credentials"));
    renderLogin();
    submit("admin@agentpulse.demo", "wrong");
    expect(await screen.findByRole("alert")).toHaveTextContent("Email or password is incorrect.");
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("validates empty fields without calling the API", async () => {
    renderLogin();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Enter your email")).toBeInTheDocument();
    expect(screen.getByText("Enter your password")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(login).not.toHaveBeenCalled();
  });

  it("validates the email format inline on blur", async () => {
    renderLogin();
    const email = screen.getByLabelText("Email");
    fireEvent.change(email, { target: { value: "not-an-email" } });
    fireEvent.blur(email);
    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
  });

  it.each(["agent", "distributor", "admin"] as const)("redirects a %s to their home", async (role) => {
    vi.mocked(login).mockResolvedValue(tokensFor(role));
    const router = renderLogin();
    submit(`${role}@agentpulse.demo`, "pw");
    await waitFor(() => expect(router.state.location.pathname).toBe(`/${role}`));
    expect(useAuthStore.getState().accessToken).toBe("access-2");
    expect(useAuthStore.getState().status).toBe("signedIn");
  });

  it("returns to the requested page only inside the role's own area", async () => {
    vi.mocked(login).mockResolvedValue(tokensFor("agent"));
    const router = renderLogin({ from: "/admin/users" });
    submit("agent@agentpulse.demo", "pw");
    await waitFor(() => expect(router.state.location.pathname).toBe("/agent"));
  });

  it("shows a lockout countdown from Retry-After and blocks submit", async () => {
    vi.mocked(login).mockRejectedValue(httpError(429, "too_many_attempts", { "retry-after": "900" }));
    renderLogin();
    submit("admin@agentpulse.demo", "wrong");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Too many failed attempts");
    expect(alert).toHaveTextContent("15:00");
    expect(screen.getByTestId("login-submit")).toBeDisabled();
  });

  it("toggles password visibility", () => {
    renderLogin();
    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
  });

  it("hints when Caps Lock is on", () => {
    renderLogin();
    fireEvent.keyDown(screen.getByLabelText("Password"), { key: "A", modifierCapsLock: true });
    expect(screen.getByText("Caps Lock is on")).toBeInTheDocument();
  });

  it("shows the session expired notice", () => {
    useAuthStore.setState({ notice: "session_expired" });
    renderLogin();
    expect(screen.getByText("Your session expired. Sign in again to continue.")).toBeInTheDocument();
  });

  it("demo chip signs in with one click", async () => {
    vi.mocked(demoLogin).mockResolvedValue(tokensFor("distributor"));
    const router = renderLogin();
    fireEvent.click(screen.getByRole("button", { name: "Distributor" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/distributor"));
    expect(demoLogin).toHaveBeenCalledWith("distributor");
    expect(login).not.toHaveBeenCalled();
  });

  it("hides demo chips when DEMO_MODE is off", () => {
    renderLogin({ demoMode: false });
    expect(screen.queryByTestId("demo-chip-agent")).not.toBeInTheDocument();
  });
});
