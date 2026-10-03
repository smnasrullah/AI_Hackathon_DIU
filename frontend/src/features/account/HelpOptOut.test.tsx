import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api as realApi } from "../../lib/api";
import type { FakeApi } from "../../test/fakeApi";
import { signIn } from "../auth/testUtils";
import { SettingsPage } from "./SettingsPage";

vi.mock("../../lib/api", async () => {
  const { createFakeApi } = await import("../../test/fakeApi");
  return { api: createFakeApi(), authClient: { post: vi.fn() }, refreshAccessToken: vi.fn() };
});

const api = realApi as unknown as FakeApi;

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("allow help requests to me", () => {
  beforeEach(() => {
    api.reset();
    api.on("get", "/liquidity-requests/opt-out", () => ({ opted_out: false }));
    api.on("put", "/liquidity-requests/opt-out", (body) => body);
  });

  it("an agent switches it off through the opt-out endpoint", async () => {
    signIn("agent");
    renderSettings();
    const toggle = await screen.findByRole("switch", { name: "Allow help requests to me" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/You decide each time/)).toBeInTheDocument();
    fireEvent.click(toggle);
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/liquidity-requests/opt-out", { opted_out: true }));
    await waitFor(() => expect(screen.getByRole("switch", { name: "Allow help requests to me" })).toHaveAttribute("aria-checked", "false"));
  });

  it("is not shown to distributors", () => {
    signIn("distributor");
    renderSettings();
    expect(screen.queryByRole("switch", { name: "Allow help requests to me" })).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith("/liquidity-requests/opt-out", undefined);
  });
});
