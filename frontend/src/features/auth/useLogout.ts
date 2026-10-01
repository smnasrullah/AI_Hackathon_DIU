import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

import type { SessionNotice } from "./authStore";
import { logout } from "./session";

export function useLogout(): (notice?: SessionNotice | null) => Promise<void> {
  const navigate = useNavigate();
  return useCallback(
    async (notice: SessionNotice | null = null) => {
      await logout(notice);
      navigate("/login", { replace: true });
    },
    [navigate],
  );
}
