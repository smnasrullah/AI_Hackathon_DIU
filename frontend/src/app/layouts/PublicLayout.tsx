import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

import { PageBackdrop } from "../../components/backdrop/Backdrop";
import { PulseLine } from "../../components/signature/PulseLine";
import { ThemeToggle } from "../../components/ui/ThemeToggle";
import { Notices } from "../../features/shared/Notices";
import { cn } from "../../lib/cn";
import { pageVariants } from "../../styles/motion";
import { LanguageSwitch } from "../shell/LanguageSwitch";
import { RouteProgress } from "../shell/RouteProgress";

type Width = "narrow" | "wide" | "full";

const MAIN: Record<Width, string> = {
  narrow: "mx-auto w-full max-w-3xl px-4 pb-10",
  wide: "mx-auto w-full max-w-6xl px-4 pb-10 md:px-6",
  full: "w-full",
};

interface PublicLayoutProps {
  /** narrow: status pages; wide: login split; full: landing (full-bleed). */
  width?: Width;
  /** Rendered instead of the route outlet (landing at `/`). */
  children?: ReactNode;
}

export function PublicLayout({ width = "narrow", children }: PublicLayoutProps) {
  const { pathname } = useLocation();
  const content = children ?? <Outlet />;
  return (
    <div className="relative isolate flex min-h-screen flex-col bg-bg text-fg">
      {width === "full" ? null : <PageBackdrop />}
      <header className="relative flex items-center justify-between gap-3 px-4 py-4 md:px-6">
        <Link to="/" className="flex min-h-11 items-center gap-2 rounded-lg">
          <span className="w-12" aria-hidden>
            <PulseLine className="h-7" />
          </span>
          <span className="font-display text-xl font-bold">AgentPulse AI</span>
        </Link>
        <div className="flex items-center gap-2">
          <LanguageSwitch />
          <ThemeToggle />
        </div>
        <RouteProgress />
      </header>
      <main className={cn("flex-1", MAIN[width])}>
        {width === "full" ? (
          content
        ) : (
          <motion.div key={pathname} variants={pageVariants} initial="initial" animate="enter">
            {content}
          </motion.div>
        )}
      </main>
      <Notices />
    </div>
  );
}
