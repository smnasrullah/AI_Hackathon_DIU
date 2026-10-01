import { useAuthStore } from "./authStore";
import type { AuthUser, Role } from "./types";

export function makeUser(role: Role): AuthUser {
  return {
    id: `00000000-0000-0000-0000-00000000000${role.length}`,
    email: `${role}@agentpulse.demo`,
    full_name: `Demo ${role}`,
    role,
    agent_id: role === "agent" ? 1 : null,
    distributor_id: role === "admin" ? null : 1,
    lang: "en",
  };
}

export function signIn(role: Role): void {
  useAuthStore.setState({ accessToken: "access-1", refreshToken: "refresh-1", user: makeUser(role) });
}

export function signOut(): void {
  useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
}
