import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import type { Lang } from "../features/auth/types";
import { usePrefsStore } from "../lib/prefs";

type Dict = Record<string, unknown>;

// One dictionary per chunk: only the active language is in the first load (bundle budget).
const LOADERS: Record<Lang, () => Promise<{ default: Dict }>> = {
  en: () => import("./en.json"),
  bn: () => import("./bn.json"),
};

void i18n.use(initReactI18next).init({
  resources: {},
  partialBundledLanguages: true,
  lng: usePrefsStore.getState().lang,
  fallbackLng: "en",
  initAsync: false,
  interpolation: { escapeValue: false },
});

/** Registers a dictionary already in memory (tests load both up front). */
export function addLanguage(lang: Lang, dict: Dict): void {
  i18n.addResourceBundle(lang, "translation", dict, true, true);
}

/** Fetches a language's dictionary once; resolves when t() can use it. */
export async function loadLanguage(lang: Lang): Promise<void> {
  if (i18n.hasResourceBundle(lang, "translation")) return;
  addLanguage(lang, (await LOADERS[lang]()).default);
}

function applyLang(lang: Lang): void {
  document.documentElement.lang = lang;
  if (i18n.language !== lang) void i18n.changeLanguage(lang);
}

usePrefsStore.subscribe((s, prev) => {
  if (s.lang === prev.lang) return;
  const lang = s.lang;
  if (i18n.hasResourceBundle(lang, "translation")) applyLang(lang);
  else void loadLanguage(lang).then(() => usePrefsStore.getState().lang === lang && applyLang(lang));
});

/** Loads the saved language before first render. */
export async function initI18n(): Promise<void> {
  const lang = usePrefsStore.getState().lang;
  await loadLanguage(lang);
  applyLang(lang);
}

export default i18n;
