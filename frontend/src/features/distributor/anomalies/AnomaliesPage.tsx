import { RotateCw, ScanSearch } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { useAnomalies } from "../../../api/hooks/anomalies";
import type { AnomalyStatus } from "../../../api/types";
import { Pagination } from "../../../components/ui/Pagination";
import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import { SkeletonRows } from "../../../components/ui/Skeleton";
import { EmptyState, ErrorState } from "../../../components/ui/StatePanel";
import { TimeText } from "../../../components/ui/TimeText";
import { cn } from "../../../lib/cn";
import { formatNumber } from "../../../lib/format";
import { useLocale } from "../../../lib/prefs";
import { useMediaQuery } from "../../../lib/useMediaQuery";
import { AnomalyDetailPane } from "./AnomalyDetailPane";
import { AnomalyStatusBadge } from "./AnomalyStatusBadge";

const STATUSES = ["open", "confirmed", "dismissed", "all"] as const;
type StatusFilter = (typeof STATUSES)[number];
const PAGE_SIZE = 20;

function isStatus(v: string | null): v is StatusFilter {
  return STATUSES.some((s) => s === v);
}

/** Anomalies (F9): flags list (status + page in the URL) beside the selected investigation. */
export function AnomaliesPage() {
  const { t } = useTranslation();
  const { digits } = useLocale();
  const navigate = useNavigate();
  const wide = useMediaQuery("(min-width: 1024px)");
  const { id: rawId } = useParams();
  const selected = rawId && Number.isInteger(Number(rawId)) ? Number(rawId) : null;
  const [params, setParams] = useSearchParams();
  const rawStatus = params.get("status");
  const status: StatusFilter = isStatus(rawStatus) ? rawStatus : "open";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const q = useAnomalies({ ...(status === "all" ? {} : { status: status as AnomalyStatus }), page, page_size: PAGE_SIZE });
  const search = params.toString() ? `?${params.toString()}` : "";
  const listPath = `/distributor/anomalies${search}`;

  function setQuery(next: { status?: StatusFilter; page?: number }): void {
    const out = new URLSearchParams(params);
    const s = next.status ?? status;
    if (s === "open") out.delete("status");
    else out.set("status", s);
    const p = next.page ?? (next.status ? 1 : page);
    if (p > 1) out.set("page", String(p));
    else out.delete("page");
    setParams(out, { replace: true });
  }

  const list = (
    <section aria-labelledby="anomaly-list-title" className="space-y-3">
      <h2 id="anomaly-list-title" className="sr-only">
        {t("anomalies.listTitle")}
      </h2>
      <SegmentedControl<StatusFilter>
        label={t("anomalies.filter")}
        size="sm"
        value={status}
        onChange={(s) => setQuery({ status: s })}
        options={STATUSES.map((s) => ({ value: s, label: t(s === "all" ? "anomalies.allStatuses" : `anomalies.status.${s}`) }))}
      />
      {q.isPending ? (
        <SkeletonRows rows={6} cols={2} />
      ) : q.isError && !q.data ? (
        <ErrorState compact onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : q.data.items.length === 0 ? (
        <EmptyState
          compact
          illustration="quiet-pulse"
          title={t("anomalies.empty.title")}
          body={t("anomalies.empty.body")}
          action={
            status === "all"
              ? { label: t("anomalies.empty.refresh"), icon: RotateCw, onClick: () => void q.refetch() }
              : { label: t("anomalies.empty.all"), icon: ScanSearch, onClick: () => setQuery({ status: "all" }) }
          }
        />
      ) : (
        <>
          <ul className="space-y-2">
            {q.data.items.map((a) => (
              <li key={a.id}>
                <Link
                  to={`/distributor/anomalies/${a.id}${search}`}
                  aria-current={a.id === selected ? "page" : undefined}
                  data-testid="anomaly-row"
                  className={cn(
                    "block rounded-2xl border border-line bg-surface px-4 py-3 text-small transition-shadow hover:shadow-[inset_3px_0_0_var(--pulse-blue)]",
                    a.id === selected && "bg-surface-2 shadow-[inset_3px_0_0_var(--pulse-blue)]",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold">{a.agent.name}</span>
                    <AnomalyStatusBadge status={a.status} />
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    <span>{t(`anomalies.feature.${a.reasons[0]?.feature ?? "cash_out_growth"}`)}</span>
                    <span className="num">· {formatNumber(a.score, digits, { fraction: 2 })}</span>
                    <span>
                      · <TimeText at={a.generated_at} mode="datetime" />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={PAGE_SIZE} total={q.data.total} onPageChange={(p) => setQuery({ page: p })} />
        </>
      )}
    </section>
  );

  const first = q.data?.items[0];
  const detail =
    selected !== null ? (
      <AnomalyDetailPane key={selected} id={selected} backTo={listPath} />
    ) : (
      <EmptyState
        compact
        illustration="quiet-pulse"
        title={t("anomalies.pick.title")}
        body={t("anomalies.pick.body")}
        action={
          first
            ? { label: t("anomalies.pick.first"), icon: ScanSearch, onClick: () => navigate(`/distributor/anomalies/${first.id}${search}`) }
            : { label: t("anomalies.empty.refresh"), icon: RotateCw, onClick: () => void q.refetch() }
        }
      />
    );

  return (
    <div className="space-y-4" data-testid="anomalies-page">
      <header>
        <h1 className="font-display text-h1 font-bold">{t("anomalies.title")}</h1>
        <p className="mt-1 text-small text-muted">{t("anomalies.lead")}</p>
      </header>
      {wide ? (
        <div className="grid grid-cols-[minmax(280px,360px)_minmax(0,1fr)] items-start gap-4">
          {list}
          <div className="glass rounded-[var(--radius-card)] p-4">{detail}</div>
        </div>
      ) : selected !== null ? (
        detail
      ) : (
        list
      )}
    </div>
  );
}
