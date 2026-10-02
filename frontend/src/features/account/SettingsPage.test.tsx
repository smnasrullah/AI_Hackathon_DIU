import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api as realApi } from "../../lib/api";
import { usePrefsStore } from "../../lib/prefs";
import type { FakeApi } from "../../test/fakeApi";
import { useAuthStore } from "../auth/authStore";
import { makeUser, signIn, tokensFor } from "../auth/testUtils";
import { installPrefsSync } from "./prefsSync";
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

describe("settings and preferences", () => {
  beforeEach(() => {
    api.reset();
    window.localStorage.clear();
    signIn("agent");
    // The server echoes the saved user, like PATCH /users/me/preferences.
    api.on("patch", "/users/me/preferences", (body) => ({ ...useAuthStore.getState().user, ...(body as object) }));
  });

  it("applies digits instantly, saves them to the server and keeps them in storage", async () => {
    renderSettings();
    fireEvent.click(screen.getByRole("radio", { name: "১২৩" }));

    await waitFor(() => expect(usePrefsStore.getState().digits).toBe("bn"));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/users/me/preferences", { digits: "bn" }));
    expect(JSON.parse(window.localStorage.getItem("agentpulse-prefs") ?? "{}").state.digits).toBe("bn");
    await waitFor(() => expect(useAuthStore.getState().user?.digits).toBe("bn"));
  });

  it("switches theme with a live preview and saves the in-app notification toggle", async () => {
    renderSettings();
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    await waitFor(() => expect(usePrefsStore.getState().theme).toBe("dark"));
    expect(screen.getByTestId("theme-preview")).toHaveAttribute("data-theme", "dark");

    fireEvent.click(screen.getByRole("switch", { name: "In-app notifications" }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/users/me/preferences", { notify_in_app: false }));
    await waitFor(() => expect(screen.getByRole("switch", { name: "In-app notifications" })).toHaveAttribute("aria-checked", "false"));
  });

  it("rolls back when the server refuses the change", async () => {
    api.on("patch", "/users/me/preferences", () => Promise.reject(new Error("offline")));
    renderSettings();
    fireEvent.click(screen.getByRole("radio", { name: "বাংলা" }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/users/me/preferences", { language: "bn" }));
    await waitFor(() => expect(usePrefsStore.getState().lang).toBe("en"));
  });

  it("restores saved preferences when a session starts", () => {
    const stop = installPrefsSync();
    act(() => useAuthStore.getState().setSession({ ...tokensFor("distributor"), user: { ...makeUser("distributor"), lang: "bn", digits: "bn", theme: "dark" } }));
    expect(usePrefsStore.getState()).toMatchObject({ lang: "bn", digits: "bn", theme: "dark" });
    stop();
  });
});
