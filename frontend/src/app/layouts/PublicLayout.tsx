import { Outlet } from "react-router-dom";

import { AccountActions } from "../../features/auth/AccountActions";
import { Notices } from "../../features/shared/Notices";

export function PublicLayout() {
  return (
    <div data-theme="light" className="flex min-h-screen flex-col bg-bg text-fg">
      <header className="flex items-center justify-between px-6 py-5">
        <span className="font-display text-xl font-bold">AgentPulse AI</span>
        <AccountActions />
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-10">
        <Outlet />
      </main>
      <Notices />
    </div>
  );
}
