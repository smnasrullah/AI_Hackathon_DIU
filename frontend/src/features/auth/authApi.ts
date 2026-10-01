import { api } from "../../lib/api";
import type { AuthUser, Lang, TokenResponse } from "./types";

export async function login(email: string, password: string): Promise<TokenResponse> {
  const res = await api.post<TokenResponse>("/auth/login", { email, password });
  return res.data;
}

export async function fetchMe(): Promise<AuthUser> {
  const res = await api.get<AuthUser>("/auth/me");
  return res.data;
}

export async function logout(refreshToken: string): Promise<void> {
  await api.post("/auth/logout", { refresh_token: refreshToken });
}

export async function updatePreferences(lang: Lang): Promise<AuthUser> {
  const res = await api.patch<AuthUser>("/users/me/preferences", { lang });
  return res.data;
}
