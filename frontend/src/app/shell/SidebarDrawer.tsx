import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";

import type { NavItem } from "./nav";
import { SideNavList, Tip } from "./SideNavList";

/**
 * Phones: the icon rail opens the full labelled navigation as an overlay drawer. It closes with
 * the close button, Escape, a backdrop click, or by navigating; Radix returns focus to the trigger.
 */
export function SidebarDrawer({ items, area }: { items: NavItem[]; area: string }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  // Open only on the route it was opened on: any navigation closes it, with no effect needed.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => setOpenOn(next ? pathname : null)}>
      <Tip label={t("shell.openMenu")} enabled>
        <Dialog.Trigger
          aria-label={t("shell.openMenu")}
          data-testid="sidebar-open"
          className="ap-press grid size-10 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg"
        >
          <Menu aria-hidden className="size-5" />
        </Dialog.Trigger>
      </Tip>
      <Dialog.Portal>
        <Dialog.Overlay data-testid="sidebar-backdrop" className="ap-overlay fixed inset-0 z-50 bg-ink-950/50" />
        <Dialog.Content
          data-testid="sidebar-drawer"
          className="ap-sheet fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-line bg-surface pb-4 text-fg shadow-lift"
        >
          <div className="flex min-h-16 items-center justify-between px-4 pb-2 pt-4">
            <Dialog.Title className="px-1 font-mono text-xs uppercase tracking-[0.18em] text-muted">{area}</Dialog.Title>
            <Dialog.Close
              aria-label={t("shell.closeMenu")}
              data-testid="sidebar-close"
              className="ap-press grid size-10 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg"
            >
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">{t("shell.mainNav")}</Dialog.Description>
          <SideNavList items={items} collapsed={false} layoutId="drawer-active" />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
