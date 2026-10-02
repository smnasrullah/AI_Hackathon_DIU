import { Moon, Sun } from "lucide-react";
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "../../lib/cn";
import { useReducedMotionPref } from "../../lib/motionPrefs";
import { usePrefsStore } from "../../lib/prefs";
import { resolveTheme, switchTheme } from "../../lib/theme";

/** Light/dark switch with a circular reveal from the button (View Transitions; fallback fade). */
export function ThemeToggle({ className, onSwitch }: { className?: string; onSwitch?: (next: "light" | "dark") => void }) {
  const { t } = useTranslation();
  const theme = usePrefsStore((s) => s.theme);
  const reduced = useReducedMotionPref();
  const dark = resolveTheme(theme) === "dark";

  function onClick(e: MouseEvent<HTMLButtonElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const next = dark ? "light" : "dark";
    switchTheme(next, { x: box.left + box.width / 2, y: box.top + box.height / 2 }, reduced);
    onSwitch?.(next);
  }

  const Icon = dark ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t(dark ? "theme.toLight" : "theme.toDark")}
      className={cn(
        "grid size-11 place-items-center rounded-full border border-line bg-surface text-fg transition-colors hover:bg-surface-2",
        className,
      )}
    >
      <Icon aria-hidden className="size-5" />
    </button>
  );
}
