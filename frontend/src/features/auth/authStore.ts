import { create } from "zustand";

import { registerStoreReset } from "../../lib/storeRegistry";
import type { AuthUser, TokenResponse } from "./types";

/** `checking` until the silent refresh on load has answered. */
export type AuthStatus = "checking" | "signedIn" | "signedOut";
/** Why the last session ended, shown once on the login page. */
export type SessionNotice = "session_expired" | "idle_logout";

interface AuthState {
  status: AuthStatus;
  /** Memory only: never persisted, so a reload goes through the refresh cookie. */
  accessToken: string | null;
  user: AuthUser | null;
  notice: SessionNotice | null;
  setSession: (tokens: TokenResponse) => void;
  setUser: (user: AuthUser) => void;
  signOut: (notice?: SessionNotice | null) => void;
  dismissNotice: () => void;
}

const initial = { status: "checking" as AuthStatus, accessToken: null, user: null, notice: null };

export const useAuthStore = create<AuthState>()((set) => ({
  ...initial,
  setSession: (tokens) =>
    set({ status: "signedIn", accessToken: tokens.access_token, user: tokens.user, notice: null }),
  setUser: (user) => set({ user }),
  signOut: (notice = null) => set({ status: "signedOut", accessToken: null, user: null, notice }),
  dismissNotice: () => set({ notice: null }),
}));

// After logout the app is known to be signed out; only a page load starts at `checking`.
registerStoreReset(() => useAuthStore.setState({ ...initial, status: "signedOut" }));

// Earlier builds persisted tokens in localStorage; drop that copy (tokens live in memory now).
try {
  window.localStorage.removeItem("agentpulse-auth");
} catch {
  // Storage blocked: nothing was persisted either.
}
