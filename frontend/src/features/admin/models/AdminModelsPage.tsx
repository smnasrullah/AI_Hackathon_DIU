import { Boxes, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useModels } from "../../../api/hooks/admin";
import type { ModelVersionItem } from "../../../api/types";
import { SkeletonCard } from "../../../components/ui/Skeleton";
import { StaggerItem, StaggerList } from "../../../components/ui/Stagger";
import { SourceChip } from "../../../components/ui/SourceChip";
import { EmptyState, ErrorState } from "../../../components/ui/StatePanel";
import { TimeText } from "../../../components/ui/TimeText";
import { formatNumber } from "../../../lib/format";
import { useLocale } from "../../../lib/prefs";
import { DriftPanel } from "../shared/DriftPanel";
import { JobPanel } from "../shared/JobPanel";
import { knownModel } from "../shared/jobModel";
import { AdminHeader, Badge, Panel } from "../shared/ui";
import { HEADLINE, metricValue } from "./modelMetrics";

function ModelCard({ m }: { m: ModelVersionItem }) {
  const { t } = useTranslation();
  const { digits } = useLocale();
  const [open, setOpen] = useState(false);
  const known = knownModel(m.model_name);
  const headline = HEADLINE.filter((h) => h.model === m.model_name)
    .map((h) => ({ ...h, value: metricValue(m, h.key) }))
    .filter((h) => h.value !== null);
  return (
    <StaggerItem className="rounded-2xl border border-line bg-surface p-4" data-testid="model-card" data-active={m.is_active}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{known ? t(`admin.models.name.${known}`) : m.model_name}</p>
          <p className="num break-all text-xs text-muted">{m.version}</p>
        </div>
        <Badge tone={m.is_active ? "good" : "neutral"}>{t(m.is_active ? "admin.models.active" : "admin.models.candidate")}</Badge>
      </div>
      {headline.length > 0 ? (
        <dl className="mt-3 grid grid-cols-2 gap-2">
          {headline.map((h) => (
            <div key={h.key} className="rounded-xl bg-surface-2/70 px-3 py-2">
              <dt className="text-xs text-muted">{t(`admin.models.metric.${h.label}`)}</dt>
              <dd className="num text-lg font-semibold">{formatNumber(h.value ?? 0, digits, { fraction: h.fraction })}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <p className="mt-2 text-xs text-muted">
        {t("admin.models.trained")} <TimeText at={m.trained_at} mode="datetime" /> · {t("admin.models.sha")}{" "}
        <span className="font-mono" title={m.artifact_sha256}>
          {m.artifact_sha256.slice(0, 12)}
        </span>
      </p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-2 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-pulse-fg hover:underline"
      >
        {open ? <ChevronUp aria-hidden className="size-3.5" /> : <ChevronDown aria-hidden className="size-3.5" />}
        {t("admin.models.metrics")} ({formatNumber(m.metrics.length, digits)})
      </button>
      {open ? (
        <dl className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-line text-xs" data-testid="model-metrics">
          {m.metrics.map((x) => (
            <div key={x.key} className="flex justify-between gap-3 border-b border-line px-3 py-1.5 last:border-b-0">
              <dt className="break-all font-mono text-muted">{x.key}</dt>
              <dd className="num font-semibold">{formatNumber(x.value, digits, { fraction: Number.isInteger(x.value) ? 0 : 4 })}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </StaggerItem>
  );
}

/** /admin/models: registry with stored holdout metrics, retrain jobs and the drift monitor. */
export function AdminModelsPage() {
  const { t } = useTranslation();
  const q = useModels();
  return (
    <div className="space-y-4" data-testid="admin-models">
      <AdminHeader title={t("admin.models.title")} lead={t("admin.models.lead")} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-label={t("admin.models.title")}>
          {q.isPending ? (
            <div className="grid gap-3" aria-busy="true">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : q.isError ? (
            <ErrorState onRetry={() => void q.refetch()} retrying={q.isFetching} />
          ) : q.data.items.length === 0 ? (
            <EmptyState
              illustration="quiet-pulse"
              title={t("admin.models.empty.title")}
              body={t("admin.models.empty.body")}
              action={{ label: t("admin.common.refresh"), icon: Boxes, onClick: () => void q.refetch() }}
            />
          ) : (
            <>
              <div className="mb-2 flex gap-2">
                <SourceChip source="model" />
              </div>
              <StaggerList className="grid gap-3">
                {q.data.items.map((m) => (
                  <ModelCard key={m.id} m={m} />
                ))}
              </StaggerList>
            </>
          )}
        </section>
        <Panel title={t("admin.models.retrain.title")} testId="retrain-panel">
          <p className="mb-3 text-small text-muted">{t("admin.models.retrain.body")}</p>
          <JobPanel
            actions={[
              {
                kind: "retrain_forecast",
                label: t("admin.models.retrain.forecast"),
                confirmTitle: t("admin.models.retrain.confirmTitle"),
                confirmBody: t("admin.models.retrain.forecastBody"),
                confirmLabel: t("admin.models.retrain.confirm"),
              },
              {
                kind: "retrain_anomaly",
                label: t("admin.models.retrain.anomaly"),
                confirmTitle: t("admin.models.retrain.confirmTitle"),
                confirmBody: t("admin.models.retrain.anomalyBody"),
                confirmLabel: t("admin.models.retrain.confirm"),
              },
            ]}
          />
        </Panel>
      </div>
      <DriftPanel />
    </div>
  );
}
