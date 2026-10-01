import type { ReactNode } from "react";
import { createBrowserRouter, type RouteObject } from "react-router-dom";

import { ForbiddenPage } from "../features/auth/ForbiddenPage";
import { HomeRedirect } from "../features/auth/HomeRedirect";
import { LoginPage } from "../features/auth/LoginPage";
import { RoleGuard } from "../features/auth/RoleGuard";
import { ALL_ROLES, type Role } from "../features/auth/types";
import { PlaceholderPage } from "../features/shared/PlaceholderPage";
import { AdminLayout } from "./layouts/AdminLayout";
import { AgentLayout } from "./layouts/AgentLayout";
import { DistributorLayout } from "./layouts/DistributorLayout";
import { PublicLayout } from "./layouts/PublicLayout";
import {
  adminPages,
  agentPages,
  distributorPages,
  loginPage,
  responsibleAiPage,
  type PageDef,
} from "./routes";

function children(pages: PageDef[]): RouteObject[] {
  return pages.map((page) =>
    page.path === ""
      ? { index: true, element: <PlaceholderPage page={page} /> }
      : { path: page.path, element: <PlaceholderPage page={page} /> },
  );
}

function guarded(roles: readonly Role[], element: ReactNode): ReactNode {
  return <RoleGuard roles={roles}>{element}</RoleGuard>;
}

export const routes: RouteObject[] = [
  { path: "/", element: <HomeRedirect /> },
  {
    element: <PublicLayout />,
    children: [
      { path: loginPage.path, element: <LoginPage /> },
      { path: "/403", element: <ForbiddenPage /> },
      {
        path: responsibleAiPage.path,
        element: guarded(ALL_ROLES, <PlaceholderPage page={responsibleAiPage} />),
      },
    ],
  },
  { path: "/agent", element: guarded(["agent"], <AgentLayout />), children: children(agentPages) },
  {
    path: "/distributor",
    element: guarded(["distributor"], <DistributorLayout />),
    children: children(distributorPages),
  },
  { path: "/admin", element: guarded(["admin"], <AdminLayout />), children: children(adminPages) },
  { path: "*", element: <HomeRedirect /> },
];

export const router = createBrowserRouter(routes);
