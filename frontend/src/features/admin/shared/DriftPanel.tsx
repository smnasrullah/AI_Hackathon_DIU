import { useTranslation } from "react-i18next";

import { useDrift } from "../../../api/hooks/admin";
import type { DriftFloat, DriftStatus } from "../../../api/types";
import { SkeletonText } from "../../../components/ui/Skeleton";
import { SourceChip } from "../../../components/ui/SourceChip";
import { Sparkline } from "../../../components/ui/Sparkline";
import { ErrorState } from "../../../components/ui/StatePanel";
import { TimeText } from "../../../components/ui/TimeText";
import { formatMoney, formatNumber, localizeDigits } from "../../../lib/format";
import { useLocale } from "../../../lib/prefs";
import { Badge, Panel, type Tone } from "./ui";

const DRIFT_TONE: Record<DriftStatus, Tone> = { stable: "good", watch: "warn", drift: "bad", no_data: "neutral" };

export function DriftBadge({ status }: { status: DriftStatus }) {
  const { t } = useTranslation();
  return (
    <Badge tone={DRIFT_TONE[status]} testId="drift-status">
      {t(`admin.drift.status.${status}`)}
    </Badge>
  );
}

function FloatDrift({ f }: { f: DriftFloat }) {
  const { t } = useTranslation();
  const { lang, digits } = useLocale();
  const money = (v: number | null) => (v === null ? "—" : formatMoney(v, digits, { lang }));
  const floatName = t(`float.${f.float_type}`);
  return (
    <div className="rounded-2xl border border-line p-4" data-testid="drift-float" data-float={f.float_type}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{floatName}</p>
        <DriftBadge status={f.status} />
      </div>
      <Sparkline values={f.by_horizon.map((p) => p.mae)} label={t("admin.drift.chart", { float: floatName })} className="mt-2 h-12" />
      <table className="mt-2 w-full text-xs">
        <thead className="text-muted">
          <tr>
            <th scope="col" className="py-1 text-left font-semibold">
              {t("admin.drift.horizonCol")}
            </th>
            <th scope="col" className="py-1 text-right font-semibold">
              {t("admin.drift.live")}
            </th>
            <th scope="col" className="py-1 text-right font-semibold">
              {t("admin.drift.reference")}
            </th>
            <th scope="col" className="py-1 text-right font-semibold">
              {t("admin.drift.ratio")}
            </th>
          </tr>
        </thead>
        <tbody>
          {f.buckets.map((b) => (
            <tr key={b.horizon} className="border-t border-line" data-horizon={b.horizon}>
              <td className="num py-1.5">{localizeDigits(t("admin.drift.horizon", { range: b.horizon }), digits)}</td>
              <td className="num py-1.5 text-right">{money(b.mae)}</td>
              <td className="num py-1.5 text-right text-muted">{money(b.reference_mae)}</td>
              <td className="py-1.5 text-right">
                <span className="inline-flex items-center gap-1.5">
                  <span className="num">{b.ratio === null ? "—" : `×${formatNumber(b.ratio, digits, { fraction: 2 })}`}</span>
                  <DriftBadge status={b.status} />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="num mt-2 text-xs text-muted">{t("admin.drift.hours", { n: formatNumber(f.hours_compared, digits) })}</p>
    </div>
  );
}

/** Forecast-error drift: live MAE against the holdout MAE per horizon bucket and float. */
export function DriftPanel() {
  const { t } = useTranslation();
  const { digits } = useLocale();
  const q = useDrift();
  return (
    <Panel title={t("admin.drift.title")} aside={q.data ? <DriftBadge status={q.data.status} /> : null} testId="drift-panel">
      <p className="text-small text-muted">{t("admin.drift.lead")}</p>
      {q.isPending ? (
        <SkeletonText lines={4} className="mt-3" />
      ) : q.isError ? (
        <ErrorState compact className="mt-3" onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : q.data.floats.length === 0 ? (
        <p className="mt-3 text-small text-muted">{t("admin.drift.noData")}</p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
            <SourceChip source="model" />
            <SourceChip source="rule" />
            {q.data.model_version ? <span className="num">{q.data.model_version}</span> : null}
            {q.data.origin ? (
              <span>
                · {t("admin.drift.origin")} <TimeText at={q.data.origin} mode="datetime" />
              </span>
            ) : null}
            <span className="num">
              · {localizeDigits(t("admin.drift.thresholds", { watch: q.data.watch_ratio, drift: q.data.drift_ratio }), digits)}
            </span>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {q.data.floats.map((f) => (
              <FloatDrift key={f.float_type} f={f} />
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}
