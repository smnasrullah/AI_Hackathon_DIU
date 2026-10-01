import { useEffect, type ReactNode } from "react";

import { refreshAccessToken } from "../../lib/api";
import { useAuthStore } from "./authStore";

/** Silent refresh on load: the httpOnly cookie, if still valid, restores the session. */
export function AuthBootstrap({ children }: { children: ReactNode }) {
  const checking = useAuthStore((s) => s.status === "checking");

  useEffect(() => {
    if (useAuthStore.getState().status === "checking") void refreshAccessToken();
  }, []);

  if (checking) {
    return (
      <div role="status" className="grid min-h-screen place-items-center bg-bg text-fg">
        <div className="w-64 space-y-3" aria-hidden>
          <div className="h-3 w-24 animate-pulse rounded-full bg-surface-2 motion-reduce:animate-none" />
          <div className="h-8 animate-pulse rounded-xl bg-surface-2 motion-reduce:animate-none" />
        </div>
        <span className="sr-only">Checking your session</span>
      </div>
    );
  }
  return <>{children}</>;
}
