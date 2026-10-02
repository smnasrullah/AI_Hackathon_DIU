import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { useShellStore } from "./shellStore";

const SEQUENCE_MS = 1200;

function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Ctrl/Cmd+K palette, "?" shortcut help, "g" sequences, "[" sidebar. */
export function useGlobalShortcuts(home: string): void {
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
        shell.toggleSidebar();
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
  }, [home, navigate]);
}
