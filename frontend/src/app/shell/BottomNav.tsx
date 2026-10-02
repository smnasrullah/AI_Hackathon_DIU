import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";

import { cn } from "../../lib/cn";
import { useReducedMotionPref } from "../../lib/motionPrefs";
import { SPRING } from "../../styles/motion";
import { AGENT_NAV } from "./nav";

/** Agent bottom nav (one thumb): a sliding pill follows the active tab. */
export function BottomNav() {
  const { t } = useTranslation();
  const reduced = useReducedMotionPref();
  return (
    <nav
      aria-label={t("shell.mainNav")}
      data-tour="nav"
      className="sticky bottom-0 z-30 grid grid-cols-4 gap-1 border-t border-line bg-surface/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur"
    >
      {AGENT_NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              "relative isolate flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-xs transition-colors",
              isActive ? "font-semibold text-fg" : "text-muted",
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive ? (
                <motion.span
                  layoutId="bottom-nav-pill"
                  transition={reduced ? { duration: 0 } : SPRING.snappy}
                  className="absolute inset-0 -z-10 rounded-2xl bg-brand/25"
                />
              ) : null}
              <motion.span animate={isActive && !reduced ? { y: -2 } : { y: 0 }} transition={SPRING.snappy}>
                <Icon aria-hidden className="size-5" />
              </motion.span>
              {t(label)}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
