import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { Lang, Theme } from "../features/auth/types";
import type { Digits } from "./format";
import { registerStoreReset, STORAGE_PREFIX } from "./storeRegistry";

interface PrefsState {
  lang: Lang;
  digits: Digits;
  theme: Theme;
  setLang: (lang: Lang) => void;
  setDigits: (digits: Digits) => void;
  setTheme: (theme: Theme) => void;
}

/** Bangla-first: bn language and digits until the user (or their profile) says otherwise. */
export const DEFAULT_PREFS = { lang: "bn", digits: "bn", theme: "system" } as const satisfies {
  lang: Lang;
  digits: Digits;
  theme: Theme;
};

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFS,
      setLang: (lang) => set({ lang }),
      setDigits: (digits) => set({ digits }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: `${STORAGE_PREFIX}-prefs`,
      storage: createJSONStorage(() => window.localStorage),
      partialize: ({ lang, digits, theme }) => ({ lang, digits, theme }),
    },
  ),
);

registerStoreReset(() => usePrefsStore.setState({ ...DEFAULT_PREFS }));

/** lang + digits for formatters, in one selector. */
export function useLocale(): { lang: Lang; digits: Digits } {
  const lang = usePrefsStore((s) => s.lang);
  const digits = usePrefsStore((s) => s.digits);
  return { lang, digits };
}
