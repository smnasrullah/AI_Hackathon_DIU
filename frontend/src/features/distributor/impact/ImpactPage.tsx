import { Banknote, Clock, Coins, Fuel, Truck } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useImpactComparison, useImpactSummary } from "../../../api/hooks/system";
import type { ImpactSummary } from "../../../api/types";
import { BentoTile } from "../../../components/signature/BentoTile";
import { SkeletonCard, SkeletonText } from "../../../components/ui/Skeleton";
import { SourceChip } from "../../../components/ui/SourceChip";
import { ErrorState } from "../../../components/ui/StatePanel";
import { StatChip } from "../../../components/ui/StatChip";
import { formatDuration, formatMoney, formatNumber, formatPercent, localizeDigits } from "../../../lib/format";
import { useLocale } from "../../../lib/prefs";
import { CompareBars } from "./CompareBars";
import { compareRows, dailySeries } from "./impactModel";

function Assumptions({ summary }: { summary: ImpactSummary }) {
  const { t } = useTranslation();
  const { lang, digits } = useLocale();
  const a = summary.assumptions;
  const hours = (h: number) => formatDuration(h, lang, digits);
  const rows: [string, string][] = [
    [t("impact.assume.vanCost"), formatMoney(a.van_cost_per_trip_bdt, digits, { lang })],
    [t("impact.assume.vanLead"), hours(a.van_lead_time_h)],
    [t("impact.assume.topup"), hours(a.topup_eta_h)],
    [t("impact.assume.emergency"), hours(a.emergency_eta_h)],
    [t("impact.assume.horizon"), hours(a.rebalance_horizon_h)],
    [t("impact.assume.fee"), formatPercent(a.cashout_fee_pct / 100, digits)],
  ];
  return (
    <section aria-labelledby="impact-assume" className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="impact-assume" className="font-display text-h2 font-bold">
          {t("impact.assume.title")}
        </h2>
        <SourceChip source="rule" />
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-small sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-line py-1.5">
            <dt className="text-muted">{k}</dt>
            <dd className="num font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted">{t("impact.assume.note")}</p>
    </section>
  );
}

/** Impact (F11): AI plan vs fixed-threshold baseline over the held-out days. */
export function ImpactPage() {
  const { t } = useTranslation();
  const { lang, digits } = useLocale();
  const summary = useImpactSummary();
  const comparison = useImpactComparison();
  const days = comparison.data?.days ?? [];

  if (summary.isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <SkeletonText lines={2} className="max-w-md" />
        <div className="grid gap-4 md:grid-cols-3">
          <SkeletonCard className="md:col-span-2" />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }
  if (summary.isError) return <ErrorState onRetry={() => void summary.refetch()} retrying={summary.isFetching} />;

  const s = summary.data;
  const d = s.delta;
  const pct = d.stockout_hours_reduced_pct;
  const eq = s.equal_service;
  const period = localizeDigits(t("impact.period", { start: s.start, end: s.end, days: s.days, agents: s.n_agents }), digits);

  return (
    <div className="space-y-4" data-testid="impact-page">
      <header>
        <h1 className="font-display text-h1 font-bold">{t("impact.title")}</h1>
        <p className="mt-1 text-small text-muted">{t("impact.lead")}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          <SourceChip source="model" />
          <SourceChip source="rule" />
          <span className="num">{period}</span>
          <span className="num">· {s.model_version}</span>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-3" data-testid="impact-bento">
        <BentoTile
          className="md:col-span-2 md:row-span-2"
          title={t("impact.tile.hours")}
          value={d.stockout_hours_reduced}
          format="hours"
          icon={Clock}
          tone="green"
          sparkline={dailySeries(days, "stockout_hours_reduced")}
          footer={
            pct !== null ? (
              <StatChip label={t("impact.tile.hoursPct")} value={formatPercent(pct / 100, digits)} />
            ) : null
          }
        />
        <BentoTile title={t("impact.tile.value")} value={d.value_saved_bdt} format="money" icon={Banknote} sparkline={dailySeries(days, "value_saved_bdt")} />
        <BentoTile title={t("impact.tile.trips")} value={d.van_trips_avoided} icon={Truck} sparkline={dailySeries(days, "van_trips_avoided")} />
        <BentoTile title={t("impact.tile.vanCost")} value={d.van_cost_avoided_bdt} format="money" icon={Fuel} sparkline={dailySeries(days, "van_cost_avoided_bdt")} />
        <BentoTile title={t("impact.tile.fee")} value={d.fee_saved_bdt} format="money" icon={Coins} sparkline={dailySeries(days, "fee_saved_bdt")} />
      </div>
      {comparison.isError ? <p className="text-xs text-muted">{t("impact.noDaily")}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="impact-compare" className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
          <h2 id="impact-compare" className="font-display text-h2 font-bold">
            {t("impact.compareTitle")}
          </h2>
          <p className="mb-4 mt-1 text-small text-muted">{t("impact.compareLead")}</p>
          <CompareBars rows={compareRows(s.model, s.baseline)} />
        </section>
        <div className="space-y-4">
          <Assumptions summary={s} />
          {eq.baseline_trips_at_ai_stockout_hours !== null ? (
            <section className="rounded-[var(--radius-card)] border border-line bg-surface-2 p-5 text-small" data-testid="equal-service">
              <h2 className="font-semibold">{t("impact.equal.title")}</h2>
              <p className="num mt-1 text-muted">
                {t("impact.equal.body", {
                  trips: formatNumber(eq.baseline_trips_at_ai_stockout_hours, digits),
                  ai: formatNumber(s.model.van_trips, digits),
                  hours: formatDuration(s.model.stockout_hours, lang, digits),
                })}
              </p>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
