import { MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { AgentSummary } from "../../../api/types";
import { RiskPill } from "../../../components/ui/RiskPill";
import { SourceChip } from "../../../components/ui/SourceChip";
import { RISK_STYLE } from "../../../components/ui/risk";
import { cn } from "../../../lib/cn";
import { formatDateTime, formatPercent, localizeDigits } from "../../../lib/format";
import { useLocale } from "../../../lib/prefs";

/** Name, area, tier and risk now, plus the 6/24/72h ladder. */
export function AgentHero({ summary }: { summary: AgentSummary }) {
  const { t } = useTranslation();
  const { lang, digits } = useLocale();
  const a = summary.agent;
  const area = [a.upazila, a.district, a.region].filter(Boolean).join(", ");

  return (
    <header className="glass relative overflow-hidden rounded-[var(--radius-card)] p-5" data-testid="agent-hero" data-level={summary.level}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="num text-xs font-semibold uppercase tracking-[0.14em] text-muted">{a.code}</p>
          <h1 className="mt-1 font-display text-h1 font-bold">{a.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-muted">
            <span className="inline-flex items-center gap-1">
              <MapPin aria-hidden className="size-4" />
              {area}
            </span>
            <span className="num">{localizeDigits(t("detail.tier", { tier: a.tier }), digits)}</span>
            <span>{t(`detail.area.${a.urban_rural}`)}</span>
          </p>
        </div>
        <RiskPill level={summary.level} />
      </div>

      <ul className="mt-4 grid grid-cols-3 gap-2" aria-label={t("stockout.horizons")}>
        {summary.by_horizon.map((h) => {
          const style = RISK_STYLE[h.level];
          const Icon = style.icon;
          return (
            <li key={h.horizon_h} className={cn("rounded-2xl px-3 py-2 ring-1 ring-inset", style.bg, style.ring)}>
              <p className="num text-xs text-muted">{localizeDigits(t("stockout.horizon", { hours: h.horizon_h }), digits)}</p>
              <p className={cn("mt-0.5 flex items-center gap-1.5 text-small font-semibold", style.fg)}>
                <Icon aria-hidden className="size-4" />
                <span className="num">{formatPercent(h.probability, digits)}</span>
                <span className="sr-only">{t(`risk.${h.level}`)}</span>
              </p>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
        <SourceChip source="model" />
        <SourceChip source="rule" />
        <span className="num">{t("forecast.asOf", { time: formatDateTime(new Date(summary.as_of), lang, digits), model: summary.model_version })}</span>
      </div>
    </header>
  );
}
