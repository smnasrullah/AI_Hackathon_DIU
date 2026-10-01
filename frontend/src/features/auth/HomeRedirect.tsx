import { Navigate } from "react-router-dom";

import { useAuthStore } from "./authStore";
import { ROLE_HOME } from "./types";

/** `/` and unknown paths: role home when signed in, else the login page. */
export function HomeRedirect() {
  const user = useAuthStore((s) => s.user);
  return <Navigate to={user ? ROLE_HOME[user.role] : "/login"} replace />;
}
