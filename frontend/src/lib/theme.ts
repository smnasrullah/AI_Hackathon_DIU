import type { Theme } from "../features/auth/types";
import { EASE, MS } from "../styles/motion";
import { usePrefsStore } from "./prefs";

export type ResolvedTheme = "light" | "dark";

const THEME_COLOR: Record<ResolvedTheme, string> = { light: "#F4F6FA", dark: "#0A1120" };
const REVEAL_MS = MS.reveal;
const REVEAL_EASING = `cubic-bezier(${EASE.join(",")})`;

function systemDark(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "system") return systemDark() ? "dark" : "light";
  return theme;
}

export function applyTheme(theme: Theme): void {
  const resolved = resolveTheme(theme);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[resolved]);
}

export function currentResolvedTheme(): ResolvedTheme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Switch theme with a circular reveal from `origin` (View Transitions API).
 * Fallback: a colour fade. Reduced motion: instant.
 */
export function switchTheme(next: Theme, origin: { x: number; y: number } | null, reduced: boolean): void {
  const set = () => usePrefsStore.getState().setTheme(next);
  if (reduced || prefersReducedMotion()) {
    set();
    return;
  }
  if (typeof document.startViewTransition !== "function" || !origin) {
    const root = document.documentElement;
    root.classList.add("ap-theme-fade");
    set();
    window.setTimeout(() => root.classList.remove("ap-theme-fade"), REVEAL_MS);
    return;
  }
  const transition = document.startViewTransition(set);
  const radius = Math.hypot(
    Math.max(origin.x, window.innerWidth - origin.x),
    Math.max(origin.y, window.innerHeight - origin.y),
  );
  void transition.ready.then(() => {
    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${origin.x}px ${origin.y}px)`,
          `circle(${radius}px at ${origin.x}px ${origin.y}px)`,
        ],
      },
      { duration: REVEAL_MS, easing: REVEAL_EASING, pseudoElement: "::view-transition-new(root)" },
    );
  });
}

/** Keep <html data-theme> in step with the store and, for "system", with the OS. */
export function installThemeSync(): () => void {
  applyTheme(usePrefsStore.getState().theme);
  const unsubscribe = usePrefsStore.subscribe((s, prev) => {
    if (s.theme !== prev.theme) applyTheme(s.theme);
  });
  const mq = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const onChange = () => {
    if (usePrefsStore.getState().theme === "system") applyTheme("system");
  };
  mq?.addEventListener("change", onChange);
  return () => {
    unsubscribe();
    mq?.removeEventListener("change", onChange);
  };
}
