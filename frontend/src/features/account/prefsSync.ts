import { usePrefsStore } from "../../lib/prefs";
import { useAuthStore } from "../auth/authStore";
import type { AuthUser } from "../auth/types";

/** The server profile is the source of truth for language, digits and theme. */
export function applyUserPrefs(user: AuthUser): void {
  const prefs = usePrefsStore.getState();
  if (prefs.lang === user.lang && prefs.digits === user.digits && prefs.theme === user.theme) return;
  usePrefsStore.setState({ lang: user.lang, digits: user.digits, theme: user.theme });
}

/** Apply the saved preferences whenever a session starts or the user record changes. */
export function installPrefsSync(): () => void {
  const current = useAuthStore.getState().user;
  if (current) applyUserPrefs(current);
  return useAuthStore.subscribe((s, prev) => {
    if (s.user && s.user !== prev.user) applyUserPrefs(s.user);
  });
}
