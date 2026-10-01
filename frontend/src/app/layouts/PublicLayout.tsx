import { Outlet } from "react-router-dom";

import { Notices } from "../../features/shared/Notices";

export function PublicLayout() {
  return (
    <div data-theme="light" className="flex min-h-screen flex-col bg-bg text-fg">
      <header className="px-6 py-5 font-display text-xl font-bold">AgentPulse AI</header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-10">
        <Outlet />
      </main>
      <Notices />
    </div>
  );
}
