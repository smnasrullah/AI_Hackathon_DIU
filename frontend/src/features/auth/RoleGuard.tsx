import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { refreshAccessToken } from "../../lib/api";
import { useAuthStore } from "./authStore";
import type { Role } from "./types";

export function RoleGuard({ roles, children }: { roles: readonly Role[]; children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const location = useLocation();

  useEffect(() => {
    // Back/forward cache restores a frozen page: re-check the session with the server.
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      if (useAuthStore.getState().status !== "signedIn") return;
      void refreshAccessToken();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  if (status === "checking") return null;
  if (!user || status !== "signedIn") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (!roles.includes(user.role)) return <Navigate to="/403" replace />;
  return <>{children}</>;
}
