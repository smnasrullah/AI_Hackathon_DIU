import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useToastStore } from "../../../components/ui/toastStore";
import { api as realApi } from "../../../lib/api";
import type { FakeApi } from "../../../test/fakeApi";
import { signIn } from "../../auth/testUtils";
import { renderAt } from "../../distributor/testRender";
import { adminUser } from "../testFixtures";
import { AdminUsersPage } from "./AdminUsersPage";

vi.mock("../../../lib/api", async () => {
  const { createFakeApi } = await import("../../../test/fakeApi");
  return { api: createFakeApi(), authClient: { post: vi.fn() }, refreshAccessToken: vi.fn() };
});

const api = realApi as unknown as FakeApi;
const toasts = () => useToastStore.getState().toasts.map((t) => t.title);

describe("admin users", () => {
  beforeEach(() => {
    api.reset();
    useToastStore.setState({ toasts: [] });
    signIn("admin");
    api.on("get", "/admin/users", () => ({ items: [adminUser()], total: 1, page: 1, page_size: 25 }));
    api.on("get", "/admin/org", () => ({
      distributors: [{ id: 1, code: "DST-DHK", name: "Dhaka North" }],
      agents: [{ id: 1, code: "AGT-0001", name: "Mirpur Store", distributor_id: 1 }],
    }));
  });

  it("creates an agent user linked to an agent", async () => {
    api.on("post", "/admin/users", (body) => adminUser({ email: (body as { email: string }).email }));
    renderAt("/admin/users", "/admin/users", <AdminUsersPage />);
    await screen.findByText("agent.mirpur@agentpulse.demo");
    fireEvent.click(screen.getByTestId("add-user"));
    const form = await screen.findByTestId("user-form");
    fireEvent.change(within(form).getByLabelText("E-mail"), { target: { value: "New@Example.org" } });
    fireEvent.change(within(form).getByLabelText("Full name"), { target: { value: "New agent" } });
    fireEvent.change(within(form).getByLabelText("Initial password"), { target: { value: "short" } });
    fireEvent.click(within(form).getByRole("button", { name: "Create user" }));
    expect(await within(form).findByText("Use at least 8 characters.")).toBeInTheDocument();
    expect(await within(form).findByText("Choose the agent this user works for.")).toBeInTheDocument();
    await waitFor(() => expect(within(form).getByRole("option", { name: "AGT-0001 · Mirpur Store" })).toBeInTheDocument());
    fireEvent.change(within(form).getByLabelText("Agent"), { target: { value: "1" } });
    fireEvent.change(within(form).getByLabelText("Initial password"), { target: { value: "long-enough-pw" } });
    fireEvent.click(within(form).getByRole("button", { name: "Create user" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/admin/users", {
        email: "new@example.org",
        full_name: "New agent",
        role: "agent",
        password: "long-enough-pw",
        agent_id: 1,
        distributor_id: null,
      }),
    );
    await waitFor(() => expect(toasts()).toContain("User created"));
  });

  it("shows the server's duplicate e-mail error on the field", async () => {
    api.on("post", "/admin/users", () => {
      throw Object.assign(new Error("409"), { isAxiosError: true, response: { status: 409, data: { detail: "email_taken" } } });
    });
    renderAt("/admin/users", "/admin/users", <AdminUsersPage />);
    fireEvent.click(await screen.findByTestId("add-user"));
    const form = await screen.findByTestId("user-form");
    fireEvent.change(within(form).getByLabelText("E-mail"), { target: { value: "x@example.org" } });
    fireEvent.change(within(form).getByLabelText("Full name"), { target: { value: "X" } });
    fireEvent.change(within(form).getByLabelText("Role"), { target: { value: "admin" } });
    fireEvent.change(within(form).getByLabelText("Initial password"), { target: { value: "long-enough-pw" } });
    fireEvent.click(within(form).getByRole("button", { name: "Create user" }));
    expect(await within(form).findByText("That e-mail is already in use.")).toBeInTheDocument();
  });

  it("disables a user with a required note", async () => {
    api.on("patch", "/admin/users/11111111-1111-1111-1111-111111111111", (body) => adminUser({ is_active: (body as { is_active: boolean }).is_active }));
    renderAt("/admin/users", "/admin/users", <AdminUsersPage />);
    fireEvent.click(await screen.findByTestId("toggle-user"));
    const confirm = await screen.findByRole("button", { name: "Disable" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Left the network" } });
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/admin/users/11111111-1111-1111-1111-111111111111", { is_active: false, note: "Left the network" }),
    );
    await waitFor(() => expect(toasts()).toContain("User disabled"));
  });

  it("keeps the role filter in the URL", async () => {
    renderAt("/admin/users", "/admin/users", <AdminUsersPage />);
    await screen.findByText("agent.mirpur@agentpulse.demo");
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "distributor" } });
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("role=distributor"));
    expect(api.get).toHaveBeenLastCalledWith("/admin/users", { params: { role: "distributor", page: 1, page_size: 25 } });
  });
});
