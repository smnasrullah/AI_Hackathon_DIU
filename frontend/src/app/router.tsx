import type { ComponentType, ReactNode } from "react";
import { createBrowserRouter, Outlet, type RouteObject } from "react-router-dom";

import { HomeRedirect } from "../features/auth/HomeRedirect";
import { RoleGuard } from "../features/auth/RoleGuard";
import { SessionRoot } from "../features/auth/SessionRoot";
import { ALL_ROLES, type Role } from "../features/auth/types";
import { DevKitRoute } from "../features/devkit/DevKitRoute";
import { PlaceholderPage } from "../features/shared/PlaceholderPage";
import { RootErrorPage } from "../features/shared/RootErrorPage";
import { ForbiddenPage, NotFoundPage, ServerErrorPage } from "../features/shared/StatusPages";
import { PublicLayout } from "./layouts/PublicLayout";
import { adminPages, agentPages, distributorPages, loginPage, responsibleAiPage, type PageDef } from "./routes";
import { AppShell } from "./shell/AppShell";

/** Design kit: dev server always; production bundle only when built with VITE_DEV_KIT=true (e2e). */
const DEV_KIT = import.meta.env.DEV || import.meta.env.VITE_DEV_KIT === "true";

type Lazy = NonNullable<RouteObject["lazy"]>;

/** Route-split page: its chunk loads on first visit (PulseLine route progress shows meanwhile). */
function page(load: () => Promise<ComponentType>): Lazy {
  return async () => ({ Component: await load() });
}

// Login is split too: its form stack (react-hook-form, zod) stays out of the initial bundle.
const login = page(() => import("../features/auth/LoginPage").then((m) => m.LoginPage));
const settings = page(() => import("../features/account/SettingsPage").then((m) => m.SettingsPage));
const profile = page(() => import("../features/account/ProfilePage").then((m) => m.ProfilePage));
const help = page(() => import("../features/help/HelpPage").then((m) => m.HelpPage));
const about = page(() => import("../features/about/AboutPage").then((m) => m.AboutPage));
const notifications = page(() => import("../features/notifications/NotificationsPage").then((m) => m.NotificationsPage));

const agentHome = page(() => import("../features/agent/home/AgentHomePage").then((m) => m.AgentHomePage));
const agentForecast = page(() => import("../features/agent/forecast/ForecastPage").then((m) => m.ForecastPage));
const agentStockout = page(() => import("../features/agent/stockout/StockoutPage").then((m) => m.StockoutPage));
const agentCopilot = page(() => import("../features/agent/copilot/CopilotPage").then((m) => m.CopilotPage));

/** Pages built so far, keyed by role-relative path; the rest render a placeholder. */
const BUILT: Record<string, Lazy> = { settings };
const AGENT_BUILT: Record<string, Lazy> = { "": agentHome, forecast: agentForecast, stockout: agentStockout, copilot: agentCopilot, settings };

function children(pages: PageDef[], built: Record<string, Lazy> = BUILT): RouteObject[] {
  return pages.map((p) => {
    const lazy = built[p.path];
    const content = lazy ? { lazy } : { element: <PlaceholderPage page={p} /> };
    return p.path === "" ? { index: true, ...content } : { path: p.path, ...content };
  });
}

function guarded(roles: readonly Role[], element: ReactNode): ReactNode {
  return <RoleGuard roles={roles}>{element}</RoleGuard>;
}

const appRoutes: RouteObject[] = [
  // Signed out: lazy landing; signed in: role home.
  { path: "/", element: <HomeRedirect /> },
  { element: <PublicLayout width="wide" />, children: [{ path: loginPage.path, lazy: login }] },
  {
    element: <PublicLayout />,
    children: [
      { path: "/403", element: <ForbiddenPage /> },
      { path: "/404", element: <NotFoundPage /> },
      { path: "/500", element: <ServerErrorPage /> },
    ],
  },
  {
    // Every signed-in page shares the shell; each role area adds its own guard.
    element: guarded(ALL_ROLES, <AppShell />),
    children: [
      { path: "/agent", element: guarded(["agent"], <Outlet />), children: children(agentPages, AGENT_BUILT) },
      { path: "/distributor", element: guarded(["distributor"], <Outlet />), children: children(distributorPages) },
      { path: "/admin", element: guarded(["admin"], <Outlet />), children: children(adminPages) },
      { path: responsibleAiPage.path, element: <PlaceholderPage page={responsibleAiPage} /> },
      { path: "/settings", lazy: settings },
      { path: "/profile", lazy: profile },
      { path: "/help", lazy: help },
      { path: "/about", lazy: about },
      { path: "/notifications", lazy: notifications },
    ],
  },
  ...(DEV_KIT ? [{ path: "/dev/kit", element: <DevKitRoute /> }] : []),
  { element: <PublicLayout />, children: [{ path: "*", element: <NotFoundPage /> }] },
];

export const routes: RouteObject[] = [{ element: <SessionRoot />, errorElement: <RootErrorPage />, children: appRoutes }];

export const router = createBrowserRouter(routes);
