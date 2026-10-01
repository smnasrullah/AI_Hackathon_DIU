export type Role = "agent" | "distributor" | "admin";
export type Lang = "bn" | "en";

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  agent_id: number | null;
  distributor_id: number | null;
  lang: Lang;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
  user: AuthUser;
}

export const ROLE_HOME: Record<Role, string> = {
  agent: "/agent",
  distributor: "/distributor",
  admin: "/admin",
};

export const ALL_ROLES: readonly Role[] = ["agent", "distributor", "admin"];

/** Where to land after sign-in: the requested page if this role may open it, else role home. */
export function landingPath(role: Role, requested: string | null | undefined): string {
  const home = ROLE_HOME[role];
  if (!requested) return home;
  const ownArea = requested === home || requested.startsWith(`${home}/`);
  return ownArea || requested === "/responsible-ai" ? requested : home;
}
