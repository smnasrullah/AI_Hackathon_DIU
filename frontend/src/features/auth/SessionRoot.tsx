import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";

import { refreshAccessToken } from "../../lib/api";
import { useAuthStore } from "./authStore";
import { IdleWarningModal } from "./IdleWarningModal";
import { clearClientSession } from "./session";
import { subscribe } from "./sessionChannel";
import { useIdleTimeout } from "./useIdleTimeout";
import { useLogout } from "./useLogout";

/** Root route: cross-tab logout and the idle timeout, around every page. */
export function SessionRoot() {
  const signedIn = useAuthStore((s) => s.status === "signedIn");
  const navigate = useNavigate();
  const logout = useLogout();

  useEffect(
    () =>
      subscribe((msg) => {
        if (msg.type !== "logout" || useAuthStore.getState().status !== "signedIn") return;
        clearClientSession();
        navigate("/login", { replace: true });
      }),
    [navigate],
  );

  const idle = useIdleTimeout(signedIn, () => void logout("idle_logout"));

  return (
    <>
      <Outlet />
      {idle.warning ? (
        <IdleWarningModal
          secondsLeft={idle.secondsLeft}
          onStay={() => {
            idle.stay();
            void refreshAccessToken();
          }}
          onLogout={() => void logout()}
        />
      ) : null}
    </>
  );
}
