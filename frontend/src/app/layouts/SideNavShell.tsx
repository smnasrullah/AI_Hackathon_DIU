import type { LucideIcon } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

import { AccountActions } from "../../features/auth/AccountActions";
import { Notices } from "../../features/shared/Notices";

export interface SideNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export function SideNavShell({ area, items }: { area: string; items: SideNavItem[] }) {
  return (
    <div data-theme="dark" className="flex min-h-screen bg-bg text-fg">
      <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-surface">
        <div className="px-5 py-5">
          <p className="font-display text-lg font-bold">AgentPulse</p>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted">{area}</p>
        </div>
        <nav className="flex flex-col gap-1 px-3">
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${isActive ? "bg-surface-2 font-semibold" : "text-muted hover:text-fg"}`
              }
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end border-b border-line px-6 py-2">
          <AccountActions />
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
        <Notices />
      </div>
    </div>
  );
}
