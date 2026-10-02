import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useRunway } from "../../../api/hooks/agents";
import type { AgentRiskRow } from "../../../api/types";
import { Skeleton } from "../../../components/ui/Skeleton";
import { SourceChip } from "../../../components/ui/SourceChip";
import { Sparkline } from "../../../components/ui/Sparkline";
import { ErrorState } from "../../../components/ui/StatePanel";
import { formatMoney } from "../../../lib/format";
import { useLocale } from "../../../lib/prefs";

const FLOAT_STROKE = { cash: "var(--float-cash)", emoney: "var(--float-emoney)" } as const;

/** Expanded row: the worst float's expected balance over 72h as a sparkline. */
export function AgentTrend({ row }: { row: AgentRiskRow }) {
  const { t } = useTranslation();
  const { lang, digits } = useLocale();
  const q = useRunway(row.agent_id, row.worst_float);
  const float = t(`float.${row.worst_float}`);
  const values = q.data?.series.map((p) => p.expected) ?? [];
  const money = (v: number | undefined) => formatMoney(v ?? 0, digits, { lang, compact: true });

  return (
    <div data-testid="agent-trend" className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-small font-semibold">{t("agentsTable.trend", { float })}</p>
          <SourceChip source="model" />
        </div>
        {q.isPending ? (
          <Skeleton className="mt-2 h-10 w-full" />
        ) : q.isError ? (
          <ErrorState compact onRetry={() => void q.refetch()} retrying={q.isFetching} className="mt-2" />
        ) : values.length > 1 ? (
          <>
            <Sparkline
              className="mt-2"
              values={values}
              stroke={FLOAT_STROKE[row.worst_float]}
              label={t("agentsTable.trendLabel", { float, from: money(values[0]), to: money(values[values.length - 1]) })}
            />
            <div className="num flex justify-between text-xs text-muted">
              <span>{money(values[0])}</span>
              <span>{money(values[values.length - 1])}</span>
            </div>
          </>
        ) : (
          <p className="mt-2 text-small text-muted">{t("forecast.empty.body")}</p>
        )}
      </div>
      <Link
        to={`/distributor/agents/${row.agent_id}`}
        className="inline-flex min-h-11 items-center gap-2 justify-self-start rounded-full border border-line bg-surface px-4 text-small font-semibold hover:bg-surface-2"
      >
        <ExternalLink aria-hidden className="size-4" />
        {t("agentsTable.open")}
      </Link>
    </div>
  );
}
