import { useTranslation } from "react-i18next";

import type { Theme } from "../auth/types";
import { PulseLine } from "../../components/signature/PulseLine";
import { RiskPill } from "../../components/ui/RiskPill";
import { formatClock, formatMoney } from "../../lib/format";
import { useLocale } from "../../lib/prefs";
import { resolveTheme } from "../../lib/theme";

// A fixed sample moment (15:40 Dhaka) so the preview reads the same for everyone.
const SAMPLE_AT = new Date("2026-10-01T09:40:00Z");
const SAMPLE_BALANCE = 120_000;

/** Mini countdown card rendered in the chosen theme, language and digits. */
export function ThemePreview({ theme }: { theme: Theme }) {
  const { t } = useTranslation();
  const { lang, digits } = useLocale();
  const resolved = resolveTheme(theme);
  return (
    <div
      data-theme={resolved}
      data-testid="theme-preview"
      className="rounded-[var(--radius-card)] border border-line bg-bg p-4 text-fg"
    >
      <div className="rounded-[var(--radius-card)] border border-watch/60 bg-surface p-4 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted">{t("settings.preview")}</span>
          <RiskPill level="amber" size="sm" />
        </div>
        <p className="mt-2 font-display text-h2 font-bold">
          {t("settings.previewLead", { time: formatClock(SAMPLE_AT, lang, digits) })}
        </p>
        <p className="num mt-1 text-small text-muted">
          {t("settings.previewBalance", { amount: formatMoney(SAMPLE_BALANCE, digits) })}
        </p>
        <div className="mt-3 w-full">
          <PulseLine level="amber" className="h-6" />
        </div>
      </div>
    </div>
  );
}
