import { ArrowLeftRight, ChartLine, House, MessageCircle } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

import { AccountActions } from "../../features/auth/AccountActions";
import { Notices } from "../../features/shared/Notices";

const NAV = [
  { to: "/agent", label: "Home", icon: House, end: true },
  { to: "/agent/forecast", label: "Forecast", icon: ChartLine, end: false },
  { to: "/agent/swap", label: "Swap", icon: ArrowLeftRight, end: false },
  { to: "/agent/copilot", label: "Ask", icon: MessageCircle, end: false },
] as const;

export function AgentLayout() {
  return (
    <div data-theme="light" className="mx-auto flex min-h-screen max-w-md flex-col bg-bg text-fg">
      <header className="flex items-center justify-between px-4 py-4">
        <span className="font-display text-lg font-bold">AgentPulse</span>
        <AccountActions settingsTo="/agent/settings" compact />
      </header>
      <main className="flex-1 px-4 pb-6">
        <Outlet />
      </main>
      <Notices />
      <nav className="sticky bottom-0 grid grid-cols-4 border-t border-line bg-surface">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex min-h-14 flex-col items-center justify-center gap-1 text-xs ${isActive ? "font-semibold text-fg" : "text-muted"}`
            }
          >
            <Icon className="size-5" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
