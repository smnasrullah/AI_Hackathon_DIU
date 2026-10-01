import { useAuthStore } from "./authStore";
import type { AuthUser, Role, TokenResponse } from "./types";

export function makeUser(role: Role): AuthUser {
  return {
    id: `00000000-0000-0000-0000-00000000000${role.length}`,
    email: `${role}@agentpulse.demo`,
    full_name: `Demo ${role}`,
    role,
    agent_id: role === "agent" ? 1 : null,
    distributor_id: role === "admin" ? null : 1,
    lang: "en",
    theme: "system",
    last_login_at: null,
  };
}

export function tokensFor(role: Role, accessToken = "access-2"): TokenResponse {
  return { access_token: accessToken, token_type: "bearer", expires_in: 900, user: makeUser(role) };
}

export function signIn(role: Role): void {
  useAuthStore.setState({ status: "signedIn", accessToken: "access-1", user: makeUser(role), notice: null });
}

export function signOut(): void {
  useAuthStore.setState({ status: "signedOut", accessToken: null, user: null, notice: null });
}
