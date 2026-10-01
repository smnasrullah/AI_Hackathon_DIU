import { api, authClient } from "../../lib/api";
import type { AuthUser, Lang, TokenResponse } from "./types";

export async function login(email: string, password: string): Promise<TokenResponse> {
  const res = await api.post<TokenResponse>("/auth/login", { email, password });
  return res.data;
}

export async function fetchMe(): Promise<AuthUser> {
  const res = await api.get<AuthUser>("/auth/me");
  return res.data;
}

/** Revokes the refresh token in the cookie and clears the cookie. */
export async function logoutRequest(): Promise<void> {
  await authClient.post("/auth/logout");
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<number> {
  const res = await api.post<{ other_sessions_revoked: number }>("/auth/change-password", {
    old_password: oldPassword,
    new_password: newPassword,
  });
  return res.data.other_sessions_revoked;
}

export async function updatePreferences(lang: Lang): Promise<AuthUser> {
  const res = await api.patch<AuthUser>("/users/me/preferences", { lang });
  return res.data;
}
