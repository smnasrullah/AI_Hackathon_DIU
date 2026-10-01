import type { ReactNode } from "react";
import { createBrowserRouter, type RouteObject } from "react-router-dom";

import { SettingsPage } from "../features/account/SettingsPage";
import { ForbiddenPage } from "../features/auth/ForbiddenPage";
import { HomeRedirect } from "../features/auth/HomeRedirect";
import { LoginPage } from "../features/auth/LoginPage";
import { RoleGuard } from "../features/auth/RoleGuard";
import { SessionRoot } from "../features/auth/SessionRoot";
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
  settingsPage,
  type PageDef,
} from "./routes";

/** Pages built so far; the rest render a placeholder. */
const BUILT: Record<string, ReactNode> = { settings: <SettingsPage /> };

function children(pages: PageDef[]): RouteObject[] {
  return pages.map((page) => {
    const element = BUILT[page.path] ?? <PlaceholderPage page={page} />;
    return page.path === "" ? { index: true, element } : { path: page.path, element };
  });
}

function guarded(roles: readonly Role[], element: ReactNode): ReactNode {
  return <RoleGuard roles={roles}>{element}</RoleGuard>;
}

const appRoutes: RouteObject[] = [
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
      { path: settingsPage.path, element: guarded(ALL_ROLES, <SettingsPage />) },
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

export const routes: RouteObject[] = [{ element: <SessionRoot />, children: appRoutes }];

export const router = createBrowserRouter(routes);
