import * as Tooltip from "@radix-ui/react-tooltip";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";

import { cn } from "../../lib/cn";
import { useReducedMotionPref } from "../../lib/motionPrefs";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { SPRING } from "../../styles/motion";
import type { NavItem } from "./nav";
import { useShellStore } from "./shellStore";

function Tip({ label, enabled, children }: { label: string; enabled: boolean; children: ReactNode }) {
  if (!enabled) return <>{children}</>;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side="right" sideOffset={10} className="ap-sheet z-50 rounded-lg bg-ink-900 px-2.5 py-1.5 text-xs font-semibold text-paper shadow-lift">
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** Distributor/admin navigation: collapsible to icons, with tooltips when collapsed. */
export function Sidebar({ items, area }: { items: NavItem[]; area: string }) {
  const { t } = useTranslation();
  const stored = useShellStore((s) => s.sidebarCollapsed);
  const toggle = useShellStore((s) => s.toggleSidebar);
  const reduced = useReducedMotionPref();
  // Phones get the icon rail only.
  const narrow = useMediaQuery("(max-width: 767px)");
  const collapsed = stored || narrow;
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const toggleLabel = collapsed ? t("shell.expand") : t("shell.collapse");

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col border-r border-line bg-surface",
        collapsed ? "w-16 md:w-[76px]" : "w-64",
      )}
    >
      <div className={cn("flex min-h-16 items-center px-3 pb-2 pt-4", collapsed ? "justify-center" : "justify-between")}>
        {collapsed ? null : <p className="px-1 font-mono text-xs uppercase tracking-[0.18em] text-muted">{area}</p>}
        {narrow ? null : (
          <Tip label={toggleLabel} enabled>
            <button
              type="button"
              onClick={toggle}
              aria-label={toggleLabel}
              aria-expanded={!collapsed}
              data-testid="sidebar-toggle"
              className="ap-press grid size-10 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg"
            >
              <ToggleIcon aria-hidden className="size-5" />
            </button>
          </Tip>
        )}
      </div>
      <nav aria-label={t("shell.mainNav")} data-tour="nav" className="flex flex-col gap-1 px-3">
        {items.map(({ to, page, icon: Icon, end }) => {
          const label = t(`page.${page}`);
          return (
            <Tip key={to} label={label} enabled={collapsed}>
              <NavLink
                to={to}
                end={end}
                aria-label={collapsed ? label : undefined}
                className={({ isActive }) =>
                  cn(
                    "relative isolate flex min-h-11 items-center gap-3 rounded-xl px-3 text-small transition-colors",
                    collapsed && "justify-center px-0",
                    isActive ? "font-semibold text-fg" : "text-muted hover:text-fg",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive ? (
                      <motion.span
                        layoutId="sidebar-active"
                        transition={reduced ? { duration: 0 } : SPRING.snappy}
                        className="absolute inset-0 -z-10 rounded-xl bg-surface-2 shadow-glow"
                      />
                    ) : null}
                    <Icon aria-hidden className="size-5 shrink-0" />
                    {collapsed ? null : <span className="truncate">{label}</span>}
                  </>
                )}
              </NavLink>
            </Tip>
          );
        })}
      </nav>
    </aside>
  );
}
