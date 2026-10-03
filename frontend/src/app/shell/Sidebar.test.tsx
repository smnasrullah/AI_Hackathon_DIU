import * as Tooltip from "@radix-ui/react-tooltip";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { SIDE_NAV } from "./nav";
import { Sidebar } from "./Sidebar";
import { useShellStore } from "./shellStore";

const realMatchMedia = window.matchMedia;

function phoneWidth(): void {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("max-width: 767px"),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function renderSidebar(path = "/admin") {
  const page = (title: string) => <h1>{title}</h1>;
  const router = createMemoryRouter(
    [
      {
        element: (
          <Tooltip.Provider>
            <Sidebar items={SIDE_NAV.admin} area="Admin" />
            <Outlet />
          </Tooltip.Provider>
        ),
        children: [
          { path: "/admin", element: page("Overview") },
          { path: "/admin/users", element: page("Users") },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

const aside = () => document.querySelector("aside");

describe("admin sidebar", () => {
  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  it("can be collapsed and expanded again: the active pill stays inside its link", () => {
    renderSidebar();
    const toggle = screen.getByTestId("sidebar-toggle");
    fireEvent.click(toggle);
    expect(aside()).toHaveAttribute("data-collapsed", "true");
    // Collapsed links sit under a Radix Slot: a function className used to be stringified.
    for (const link of screen.getAllByRole("link")) {
      expect(link.className).toContain("relative");
      expect(link.className).not.toContain("isActive");
    }
    fireEvent.click(screen.getByTestId("sidebar-toggle"));
    expect(aside()).toHaveAttribute("data-collapsed", "false");
    expect(useShellStore.getState().sidebarCollapsed).toBe(false);
  });

  describe("phone drawer", () => {
    async function openDrawer(): Promise<HTMLElement> {
      const trigger = screen.getByTestId("sidebar-open");
      trigger.focus();
      fireEvent.click(trigger);
      await screen.findByTestId("sidebar-drawer");
      return trigger;
    }

    it("closes with the close button and returns focus to the menu button", async () => {
      phoneWidth();
      renderSidebar();
      const trigger = await openDrawer();
      fireEvent.click(screen.getByTestId("sidebar-close"));
      await waitFor(() => expect(screen.queryByTestId("sidebar-drawer")).toBeNull());
      expect(document.activeElement).toBe(trigger);
    });

    it("closes with Escape", async () => {
      phoneWidth();
      renderSidebar();
      await openDrawer();
      fireEvent.keyDown(screen.getByTestId("sidebar-drawer"), { key: "Escape" });
      await waitFor(() => expect(screen.queryByTestId("sidebar-drawer")).toBeNull());
    });

    it("closes on a backdrop click", async () => {
      phoneWidth();
      renderSidebar();
      await openDrawer();
      const backdrop = screen.getByTestId("sidebar-backdrop");
      fireEvent.pointerDown(backdrop);
      fireEvent.click(backdrop);
      await waitFor(() => expect(screen.queryByTestId("sidebar-drawer")).toBeNull());
    });

    it("closes on route change", async () => {
      phoneWidth();
      const router = renderSidebar();
      await openDrawer();
      await act(() => router.navigate("/admin/users"));
      await waitFor(() => expect(screen.queryByTestId("sidebar-drawer")).toBeNull());
      expect(screen.getByRole("heading", { name: "Users" })).toBeInTheDocument();
    });
  });
});
