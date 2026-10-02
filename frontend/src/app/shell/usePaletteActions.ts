import { Keyboard, Languages, LogOut, Route, SunMoon, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useUpdatePreferences } from "../../api/hooks/users";
import { useLogout } from "../../features/auth/useLogout";
import { useReducedMotionPref } from "../../lib/motionPrefs";
import { usePrefsStore } from "../../lib/prefs";
import { resolveTheme, switchTheme } from "../../lib/theme";
import { useShellStore } from "./shellStore";

export interface PaletteAction {
  id: string;
  label: string;
  icon: LucideIcon;
  run: () => void;
}

/** Commands that are not pages: theme, language, shortcuts, tour, log out. */
export function usePaletteActions(): PaletteAction[] {
  const { t } = useTranslation();
  const save = useUpdatePreferences();
  const logout = useLogout();
  const reduced = useReducedMotionPref();
  const shell = useShellStore.getState();

  return [
    {
      id: "theme",
      label: t("palette.action.theme"),
      icon: SunMoon,
      run: () => {
        const next = resolveTheme(usePrefsStore.getState().theme) === "dark" ? "light" : "dark";
        switchTheme(next, null, reduced);
        save.mutate({ theme: next });
      },
    },
    {
      id: "language",
      label: t("palette.action.language"),
      icon: Languages,
      run: () => save.mutate({ language: usePrefsStore.getState().lang === "bn" ? "en" : "bn" }),
    },
    { id: "shortcuts", label: t("palette.action.shortcuts"), icon: Keyboard, run: () => shell.setShortcutsOpen(true) },
    { id: "tour", label: t("palette.action.tour"), icon: Route, run: () => shell.setTourReplay(true) },
    { id: "logout", label: t("palette.action.logout"), icon: LogOut, run: () => void logout() },
  ];
}
