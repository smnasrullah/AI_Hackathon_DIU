import { api } from "../../lib/api";
import type { PreferencesUpdate, ProfileOut, ProfileUpdate, UserOut } from "../types";

export async function getProfile(): Promise<ProfileOut> {
  return (await api.get<ProfileOut>("/users/me/profile")).data;
}

export async function updatePreferences(body: PreferencesUpdate): Promise<UserOut> {
  return (await api.patch<UserOut>("/users/me/preferences", body)).data;
}

export async function updateProfile(body: ProfileUpdate): Promise<ProfileOut> {
  return (await api.patch<ProfileOut>("/users/me/profile", body)).data;
}
