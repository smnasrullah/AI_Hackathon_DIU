// Every frontend route the app serves. Each later prompt that adds a route APPENDS it here.
// `as`: the demo role the smoke test signs in with, or "public" to visit signed out.
// Params (":id") use a concrete sample value.

export type Role = "agent" | "distributor" | "admin";

export interface E2ERoute {
  path: string;
  as: Role | "public";
}

export const ROUTES: E2ERoute[] = [
  // Public
  { path: "/login", as: "public" },
  { path: "/403", as: "public" },

  // Shared (any signed-in role)
  { path: "/settings", as: "agent" },
  { path: "/settings", as: "distributor" },
  { path: "/settings", as: "admin" },
  { path: "/responsible-ai", as: "distributor" },

  // Agent
  { path: "/agent", as: "agent" },
  { path: "/agent/forecast", as: "agent" },
  { path: "/agent/swap", as: "agent" },
  { path: "/agent/copilot", as: "agent" },
  { path: "/agent/settings", as: "agent" },

  // Distributor
  { path: "/distributor", as: "distributor" },
  { path: "/distributor/agents/1", as: "distributor" },
  { path: "/distributor/swaps", as: "distributor" },
  { path: "/distributor/anomalies", as: "distributor" },
  { path: "/distributor/anomalies/1", as: "distributor" },
  { path: "/distributor/impact", as: "distributor" },
  { path: "/distributor/briefing", as: "distributor" },

  // Admin
  { path: "/admin", as: "admin" },
  { path: "/admin/users", as: "admin" },
  { path: "/admin/models", as: "admin" },
  { path: "/admin/llm", as: "admin" },
  { path: "/admin/audit", as: "admin" },
];
