import { Settings } from "lucide-react";
import { Link } from "react-router-dom";

import { useAuthStore } from "./authStore";
import { LogoutButton } from "./LogoutButton";

/** Temporary header actions until the full top bar (avatar menu) lands. */
export function AccountActions({ settingsTo = "/settings", compact = false }: { settingsTo?: string; compact?: boolean }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;

  return (
    <div className="flex items-center gap-2">
      {compact ? null : <span className="hidden text-sm text-muted sm:inline">{user.full_name}</span>}
      <Link to={settingsTo} aria-label="Settings" className="grid size-11 place-items-center rounded-full">
        <Settings className="size-5" aria-hidden />
      </Link>
      <LogoutButton />
    </div>
  );
}
