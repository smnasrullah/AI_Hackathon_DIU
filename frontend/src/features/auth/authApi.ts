import { api, authClient } from "../../lib/api";
import type { AuthUser, Lang, Role, TokenResponse } from "./types";

export async function login(email: string, password: string): Promise<TokenResponse> {
  const res = await api.post<TokenResponse>("/auth/login", { email, password });
  return res.data;
}

/** DEMO_MODE only: one-click sign-in as the seeded demo account of `role`. */
export async function demoLogin(role: Role): Promise<TokenResponse> {
  const res = await api.post<TokenResponse>("/auth/demo-login", { role });
  return res.data;
}

/** Self-signup: the body never carries a role; the account waits for admin approval. */
export async function signup(fullName: string, email: string, password: string): Promise<void> {
  await api.post("/auth/signup", { full_name: fullName, email, password });
}

/** Same answer whether or not the account exists. */
export async function forgotPassword(email: string): Promise<void> {
  await api.post("/auth/forgot-password", { email });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await api.post("/auth/reset-password", { token, new_password: newPassword });
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
