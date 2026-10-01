import { LogOut } from "lucide-react";
import { useState } from "react";

import { useLogout } from "./useLogout";

export function LogoutButton() {
  const logout = useLogout();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void logout();
      }}
      className="flex min-h-11 items-center gap-2 rounded-full border border-line px-3 text-sm font-semibold disabled:opacity-60"
    >
      <LogOut className="size-4" aria-hidden />
      {busy ? "Logging out…" : "Log out"}
    </button>
  );
}
