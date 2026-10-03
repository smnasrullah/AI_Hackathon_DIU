import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AxiosError, AxiosHeaders } from "axios";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { signup } from "./authApi";
import { SignupPage } from "./SignupPage";
import { signOut } from "./testUtils";

vi.mock("./authApi", () => ({ signup: vi.fn() }));

function renderSignup() {
  const router = createMemoryRouter([{ path: "/signup", element: <SignupPage /> }], { initialEntries: ["/signup"] });
  render(<RouterProvider router={router} />);
}

function fill(values: { name?: string; email?: string; password?: string; confirm?: string }) {
  fireEvent.change(screen.getByLabelText("Full name"), { target: { value: values.name ?? "New Person" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: values.email ?? "new@example.org" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: values.password ?? "Str0ng-pass" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: values.confirm ?? values.password ?? "Str0ng-pass" } });
  fireEvent.click(screen.getByTestId("signup-submit"));
}

function httpError(status: number, detail: string): AxiosError {
  const headers = new AxiosHeaders();
  return new AxiosError(String(status), "ERR_BAD_REQUEST", { headers }, null, {
    status,
    statusText: detail,
    data: { detail },
    headers: {},
    config: { headers },
  });
}

describe("SignupPage", () => {
  beforeEach(() => {
    signOut();
    vi.mocked(signup).mockReset();
  });

  it("sends name, email and password only, then shows the approval message", async () => {
    vi.mocked(signup).mockResolvedValue(undefined);
    renderSignup();
    fill({});
    expect(await screen.findByTestId("signup-pending")).toHaveTextContent("Waiting for approval");
    // Three arguments, no role: the server decides the role.
    expect(signup).toHaveBeenCalledWith("New Person", "new@example.org", "Str0ng-pass");
  });

  it("checks length and confirmation before calling the API", async () => {
    renderSignup();
    fill({ password: "short", confirm: "short" });
    expect(await screen.findByText("Use at least 8 characters")).toBeInTheDocument();
    fill({ password: "long-enough-1", confirm: "different-1" });
    expect(await screen.findByText("The passwords do not match")).toBeInTheDocument();
    expect(signup).not.toHaveBeenCalled();
  });

  it("shows a strength hint while typing", () => {
    renderSignup();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "abcdEFG1!xyz2026" } });
    expect(screen.getByTestId("password-strength")).toHaveAttribute("data-level", "strong");
  });

  it("rejects a taken email without saying it is taken", async () => {
    vi.mocked(signup).mockRejectedValue(httpError(400, "signup_rejected"));
    renderSignup();
    fill({});
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We could not create an account with these details.");
    expect(alert).not.toHaveTextContent(/already (in use|registered|taken)/i);
    await waitFor(() => expect(screen.queryByTestId("signup-pending")).not.toBeInTheDocument());
  });
});
