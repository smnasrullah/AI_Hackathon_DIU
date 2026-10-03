import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAssumptions, useDataSummary } from "../../../api/hooks/admin";
import type { DataSummary } from "../../../api/types";
import { CountUp } from "../../../components/ui/CountUp";
import { SkeletonPanel, SkeletonText } from "../../../components/ui/Skeleton";
import { StaggerItem, StaggerList } from "../../../components/ui/Stagger";
import { SourceChip } from "../../../components/ui/SourceChip";
import { ErrorState } from "../../../components/ui/StatePanel";
import { TimeText } from "../../../components/ui/TimeText";
import { formatNumber } from "../../../lib/format";
import { useLocale } from "../../../lib/prefs";
import { errorCode } from "../shared/apiError";
import { JobPanel } from "../shared/JobPanel";
import { AdminHeader, Badge, Facts, Panel } from "../shared/ui";
import { MarkdownDoc } from "./MarkdownDoc";

const TABLES = ["distributors", "agents", "users", "float_snapshots", "transactions", "transactions_holdout", "events", "weather_daily"] as const;
type TableName = (typeof TABLES)[number];

function isTable(v: string): v is TableName {
  return TABLES.some((t) => t === v);
}

function Summary({ d }: { d: DataSummary }) {
  const { t } = useTranslation();
  const { digits } = useLocale();
  const seedOk = d.seed === d.configured_seed;
  const counts = d.counts.filter((c) => isTable(c.table));
  return (
    <Panel title={t("admin.data.title")} aside={<SourceChip source="rule" />} testId="data-summary">
      <Facts
        rows={[
          [
            t("admin.data.seed"),
            <span key="s" className="inline-flex items-center gap-2">
              {d.seed === null ? "—" : formatNumber(d.seed, digits)}
              {seedOk ? null : <Badge tone="warn">{t("admin.data.seedMismatch", { seed: formatNumber(d.configured_seed, digits) })}</Badge>}
            </span>,
          ],
          [t("admin.data.version"), d.data_version ?? "—"],
          [
            t("admin.data.history"),
            <span key="h" className="text-xs">
              <TimeText at={d.period.start} mode="datetime" /> – <TimeText at={d.period.end} mode="datetime" />
            </span>,
          ],
          [t("admin.data.holdout"), <TimeText key="ho" at={d.period.holdout_start} mode="datetime" />],
          [t("admin.data.simNow"), <TimeText key="sn" at={d.period.sim_now} mode="datetime" />],
          [t("admin.data.labelled"), formatNumber(d.labelled_anomalous_agents, digits)],
        ]}
      />
      <h3 className="mt-4 text-small font-semibold">{t("admin.data.rows")}</h3>
      <StaggerList className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4" data-testid="data-counts">
        {counts.map((c) => (
          <StaggerItem key={c.table} className="rounded-2xl border border-line bg-surface-2/60 px-3 py-2">
            <p className="text-xs text-muted">{isTable(c.table) ? t(`admin.data.table.${c.table}`) : c.table}</p>
            <CountUp value={c.rows} className="block text-lg font-semibold" />
          </StaggerItem>
        ))}
      </StaggerList>
    </Panel>
  );
}

function Assumptions() {
  const { t } = useTranslation();
  const q = useAssumptions();
  const missing = q.isError && errorCode(q.error) === "assumptions_missing";
  return (
    <Panel
      title={t("admin.data.assumptions.title")}
      aside={
        <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted">
          <FileText aria-hidden className="size-3.5" />
          {t("admin.data.assumptions.source")}
        </span>
      }
      testId="assumptions"
    >
      {q.isPending ? (
        <SkeletonText lines={8} />
      ) : missing ? (
        <p className="text-small text-muted">{t("admin.data.assumptions.missing")}</p>
      ) : q.isError ? (
        <ErrorState compact onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : (
        // Scrollable regions take focus so keyboard users can scroll them.
        <div className="max-h-[70vh] overflow-y-auto pr-2" tabIndex={0} role="region" aria-label={t("admin.data.assumptions.title")}>
          <MarkdownDoc markdown={q.data.markdown} />
        </div>
      )}
    </Panel>
  );
}

/** /admin/data: dataset summary, regeneration job with progress, and the assumptions doc. */
export function AdminDataPage() {
  const { t } = useTranslation();
  const { digits } = useLocale();
  const q = useDataSummary();
  const seed = q.data ? formatNumber(q.data.configured_seed, digits) : "";
  return (
    <div className="space-y-4" data-testid="admin-data">
      <AdminHeader title={t("admin.data.title")} lead={t("admin.data.lead")} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {q.isPending ? (
          <SkeletonPanel rows={7} />
        ) : q.isError ? (
          <ErrorState onRetry={() => void q.refetch()} retrying={q.isFetching} />
        ) : (
          <Summary d={q.data} />
        )}
        <Panel title={t("admin.data.generate.title")} testId="generate-panel">
          <p className="text-small text-muted">{t("admin.data.generate.body", { seed })}</p>
          <p className="mb-3 mt-1 text-xs text-watch-fg">{t("admin.data.generate.warn")}</p>
          <JobPanel
            actions={[
              {
                kind: "generate_data",
                label: t("admin.data.generate.button"),
                confirmTitle: t("admin.data.generate.confirmTitle"),
                confirmBody: t("admin.data.generate.confirmBody"),
                confirmLabel: t("admin.data.generate.confirm"),
              },
            ]}
          />
        </Panel>
      </div>
      <Assumptions />
    </div>
  );
}
