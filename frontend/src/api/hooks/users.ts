import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuthStore } from "../../features/auth/authStore";
import { usePrefsStore } from "../../lib/prefs";
import { qk } from "../keys";
import { getProfile, updatePreferences, updateProfile } from "../services/users";
import type { PreferencesUpdate, ProfileUpdate } from "../types";

export function useProfile() {
  return useQuery({ queryKey: qk.profile, queryFn: getProfile });
}

/** Applies the change locally at once (optimistic), then saves it to the profile. */
export function useUpdatePreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: PreferencesUpdate) => updatePreferences(body),
    onMutate: (body) => {
      const prefs = usePrefsStore.getState();
      const previous = { lang: prefs.lang, digits: prefs.digits, theme: prefs.theme };
      const user = useAuthStore.getState().user;
      if (body.language) prefs.setLang(body.language);
      if (body.digits) prefs.setDigits(body.digits);
      if (body.theme) prefs.setTheme(body.theme);
      if (user && (body.notify_in_app != null || body.tour_done != null)) {
        useAuthStore.getState().setUser({
          ...user,
          notify_in_app: body.notify_in_app ?? user.notify_in_app,
          tour_done: body.tour_done ?? user.tour_done,
        });
      }
      return { previous, user };
    },
    onSuccess: (saved) => useAuthStore.getState().setUser(saved),
    onError: (_err, _body, ctx) => {
      if (!ctx) return;
      usePrefsStore.setState(ctx.previous);
      if (ctx.user) useAuthStore.getState().setUser(ctx.user);
    },
    onSettled: () => client.invalidateQueries({ queryKey: qk.profile }),
  });
}

/** Save without touching local prefs (the caller already applied them, e.g. the animated theme switch). */
export function useSavePreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: PreferencesUpdate) => updatePreferences(body),
    onSuccess: (saved) => useAuthStore.getState().setUser(saved),
    onSettled: () => client.invalidateQueries({ queryKey: qk.profile }),
  });
}

export function useUpdateProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ProfileUpdate) => updateProfile(body),
    onSuccess: (profile) => {
      client.setQueryData(qk.profile, profile);
      const user = useAuthStore.getState().user;
      if (user) {
        useAuthStore.getState().setUser({ ...user, display_name: profile.display_name, avatar_color: profile.avatar_color });
      }
    },
  });
}
