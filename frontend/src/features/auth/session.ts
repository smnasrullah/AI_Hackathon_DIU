import { queryClient } from "../../lib/queryClient";
import { clearAppStorage, resetAllStores } from "../../lib/storeRegistry";
import { logoutRequest } from "./authApi";
import { useAuthStore, type SessionNotice } from "./authStore";
import { broadcast } from "./sessionChannel";

/**
 * Wipe every trace of the session in this tab: query cache, all zustand stores, app storage.
 * The caller navigates (replace) to /login.
 */
export function clearClientSession(notice: SessionNotice | null = null): void {
  queryClient.clear();
  resetAllStores();
  clearAppStorage();
  if (notice) useAuthStore.setState({ notice });
}

/** Full logout: revoke on the server, clear locally, tell the other tabs. */
export async function logout(notice: SessionNotice | null = null): Promise<void> {
  try {
    await logoutRequest();
  } catch {
    // Server unreachable: still end the session locally; the token expires on its own.
  }
  clearClientSession(notice);
  broadcast({ type: "logout" });
}
