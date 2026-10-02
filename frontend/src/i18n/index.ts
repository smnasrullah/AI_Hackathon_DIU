import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { usePrefsStore } from "../lib/prefs";
import bn from "./bn.json";
import en from "./en.json";

export const resources = { en: { translation: en }, bn: { translation: bn } } as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: usePrefsStore.getState().lang,
  fallbackLng: "en",
  initAsync: false,
  interpolation: { escapeValue: false },
});

function applyLang(lang: string): void {
  document.documentElement.lang = lang;
  if (i18n.language !== lang) void i18n.changeLanguage(lang);
}

applyLang(usePrefsStore.getState().lang);
usePrefsStore.subscribe((s, prev) => {
  if (s.lang !== prev.lang) applyLang(s.lang);
});

export default i18n;
