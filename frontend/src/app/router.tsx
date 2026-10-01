import { Navigate, createBrowserRouter, type RouteObject } from "react-router-dom";

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

export const routes: RouteObject[] = [
  { path: "/", element: <Navigate to="/login" replace /> },
  {
    element: <PublicLayout />,
    children: [
      { path: loginPage.path, element: <PlaceholderPage page={loginPage} /> },
      { path: responsibleAiPage.path, element: <PlaceholderPage page={responsibleAiPage} /> },
    ],
  },
  { path: "/agent", element: <AgentLayout />, children: children(agentPages) },
  { path: "/distributor", element: <DistributorLayout />, children: children(distributorPages) },
  { path: "/admin", element: <AdminLayout />, children: children(adminPages) },
  { path: "*", element: <Navigate to="/login" replace /> },
];

export const router = createBrowserRouter(routes);
