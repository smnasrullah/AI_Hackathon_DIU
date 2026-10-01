import { render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

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

describe("RoleGuard", () => {
  beforeEach(() => signOut());

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
