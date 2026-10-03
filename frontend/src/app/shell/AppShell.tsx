import * as Tooltip from "@radix-ui/react-tooltip";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation } from "react-router-dom";

import { useAuthStore } from "../../features/auth/authStore";
import { ROLE_HOME } from "../../features/auth/types";
import { Notices } from "../../features/shared/Notices";
import { cn } from "../../lib/cn";
import { usePageTitle } from "../../lib/usePageTitle";
import { pageVariants } from "../../styles/motion";
import { BottomNav } from "./BottomNav";
import { Breadcrumbs } from "./Breadcrumbs";
import { CommandPalette } from "./CommandPalette";
import { FreshnessChip } from "./FreshnessChip";
import { crumbsFor, pageFor, SIDE_NAV } from "./nav";
import { OfflineBanner } from "./OfflineBanner";
import { OnboardingTour } from "./OnboardingTour";
import { RouteErrorBoundary } from "./RouteErrorBoundary";
import { ShortcutHelp } from "./ShortcutHelp";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { useGlobalShortcuts } from "./useGlobalShortcuts";

/**
 * Every signed-in page: top bar, role navigation (agent bottom nav / control-room sidebar),
 * breadcrumbs + freshness, per-route error boundary, palette, shortcuts, tour, footer notices.
 */
export function AppShell() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const { pathname } = useLocation();
  const role = user?.role ?? "agent";
  const home = ROLE_HOME[role];
  const agent = role === "agent";
  const meta = pageFor(pathname);
  const crumbs = crumbsFor(pathname, role);
  usePageTitle(meta ? t(`page.${meta.page}`) : null);
  useGlobalShortcuts(home, !agent);

  const subRow =
    crumbs.length > 1 || meta?.prediction ? (
      <div className={cn("flex flex-wrap items-center justify-between gap-2", !agent && "lg:justify-end")}>
        <Breadcrumbs crumbs={crumbs} className={cn(crumbs.length < 2 && "invisible", !agent && "lg:hidden")} />
        {meta?.prediction ? <FreshnessChip /> : null}
      </div>
    ) : null;

  const page = (
    <main id="main" tabIndex={-1} className={cn("flex-1 outline-none", agent ? "px-4 pb-6 pt-3" : "p-4 md:p-6")}>
      {subRow ? <div className="mb-4">{subRow}</div> : null}
      <RouteErrorBoundary resetKey={pathname}>
        <motion.div key={pathname} variants={pageVariants} initial="initial" animate="enter">
          <Outlet />
        </motion.div>
      </RouteErrorBoundary>
    </main>
  );

  return (
    <Tooltip.Provider delayDuration={300}>
      <a href="#main" className="sr-only z-[70] rounded-xl bg-brand px-4 py-2 font-semibold text-on-brand focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        {t("shell.skip")}
      </a>
      <div data-testid="app-shell" data-role={role} className="min-h-screen bg-bg text-fg">
        <OfflineBanner />
        {role === "agent" ? (
          <div className="mx-auto flex min-h-screen max-w-md flex-col md:max-w-2xl">
            <TopBar home={home} crumbs={crumbs} compact />
            {page}
            <Notices />
            <BottomNav />
          </div>
        ) : (
          <div className="flex min-h-screen">
            <Sidebar items={SIDE_NAV[role]} area={t(`role.${role}`)} />
            <div className="flex min-w-0 flex-1 flex-col">
              <TopBar home={home} crumbs={crumbs} compact={false} />
              {page}
              <Notices />
            </div>
          </div>
        )}
      </div>
      <CommandPalette />
      <ShortcutHelp includeSidebar={!agent} />
      <OnboardingTour />
    </Tooltip.Provider>
  );
}
