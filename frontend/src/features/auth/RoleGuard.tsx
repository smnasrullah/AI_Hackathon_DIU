import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuthStore } from "./authStore";
import type { Role } from "./types";

export function RoleGuard({ roles, children }: { roles: readonly Role[]; children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const signedIn = useAuthStore((s) => s.refreshToken !== null);
  const location = useLocation();

  if (!user || !signedIn) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (!roles.includes(user.role)) return <Navigate to="/403" replace />;
  return <>{children}</>;
}
