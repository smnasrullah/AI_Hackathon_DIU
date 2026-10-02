import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchSystemStatus, systemStatusKey } from "../../lib/systemStatus";
import { demoLogin } from "./authApi";
import { useAuthStore } from "./authStore";
import { ROLE_HOME, type Role } from "./types";

/** True when the server runs with DEMO_MODE (one-click demo accounts). */
export function useDemoMode(): boolean {
  const status = useQuery({ queryKey: systemStatusKey, queryFn: fetchSystemStatus });
  return status.data?.demo_mode ?? false;
}

/** One-click sign-in as a demo role, then go to that role's home. */
export function useDemoLogin(): { pending: Role | null; failed: boolean; signIn: (role: Role) => Promise<void> } {
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();
  const [pending, setPending] = useState<Role | null>(null);
  const [failed, setFailed] = useState(false);

  async function signIn(role: Role): Promise<void> {
    setPending(role);
    setFailed(false);
    try {
      const tokens = await demoLogin(role);
      setSession(tokens);
      navigate(ROLE_HOME[tokens.user.role], { replace: true });
    } catch {
      setFailed(true);
      setPending(null);
    }
  }

  return { pending, failed, signIn };
}
