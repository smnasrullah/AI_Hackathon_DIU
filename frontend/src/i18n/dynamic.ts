import i18n from "./index";

type Values = Record<string, string | number>;
type LooseT = (key: string, values?: Values) => string;

/**
 * Translate a key that arrives at runtime (server `title_key`, search `title_key`).
 * Unknown keys fall back instead of showing the raw key. Call inside a component that
 * uses useTranslation(), so a language switch re-renders it.
 */
export function translateKey(key: string, values?: Values, fallback?: string): string {
  if (!i18n.exists(key)) return fallback ?? key;
  return (i18n.t as unknown as LooseT)(key, values);
}
