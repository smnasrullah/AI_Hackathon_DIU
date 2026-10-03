import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { PHONE_QUERY, useShellStore } from "./shellStore";

const SEQUENCE_MS = 1200;

function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return true;
  return target.isContentEditable || target.closest("[contenteditable]:not([contenteditable='false'])") !== null;
}

function phoneWidth(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(PHONE_QUERY).matches;
}

/**
 * Ctrl/Cmd+K palette, "?" shortcut help, "g" sequences, "[" sidebar.
 * "[" only toggles the saved desktop width where that sidebar is shown (`sidebar`, not on phones).
 */
export function useGlobalShortcuts(home: string, sidebar = true): void {
  const navigate = useNavigate();

  useEffect(() => {
    let pendingG = 0;
    const onKey = (e: KeyboardEvent) => {
      const shell = useShellStore.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        shell.setPaletteOpen(!shell.paletteOpen);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      if (shell.paletteOpen || shell.shortcutsOpen) return;
      if (e.key === "?") {
        e.preventDefault();
        shell.setShortcutsOpen(true);
        return;
      }
      if (e.key === "[") {
        // Phones (rail + drawer) and the agent shell (no sidebar): do nothing, keep the saved preference.
        if (sidebar && !e.shiftKey && !phoneWidth()) shell.toggleSidebar();
        return;
      }
      const key = e.key.toLowerCase();
      if (pendingG && e.timeStamp - pendingG < SEQUENCE_MS) {
        pendingG = 0;
        const to = key === "h" ? home : key === "n" ? "/notifications" : key === "s" ? "/settings" : null;
        if (to) navigate(to);
        return;
      }
      pendingG = key === "g" ? e.timeStamp || 1 : 0;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [home, navigate, sidebar]);
}
