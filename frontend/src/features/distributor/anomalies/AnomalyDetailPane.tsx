import { isAxiosError } from "axios";
import { ArrowLeft, ExternalLink, ScanSearch } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import { useAnomaly } from "../../../api/hooks/anomalies";
import { useAnomalyNarrative } from "../../../api/hooks/briefing";
import { MoneyText } from "../../../components/ui/MoneyText";
import { SkeletonCard, SkeletonText } from "../../../components/ui/Skeleton";
import { SourceChip } from "../../../components/ui/SourceChip";
import { EmptyState, ErrorState } from "../../../components/ui/StatePanel";
import { TimeText } from "../../../components/ui/TimeText";
import { formatNumber } from "../../../lib/format";
import { useLocale } from "../../../lib/prefs";
import { WordingBlock } from "../../agent/home/WordingBlock";
import { PeerChart } from "./PeerChart";
import { ReviewPanel } from "./ReviewPanel";

const LINK = "inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-small font-semibold hover:bg-surface-2";

function Narrative({ id }: { id: number }) {
  const { t } = useTranslation();
  const { lang } = useLocale();
  const q = useAnomalyNarrative(id, lang);
  return (
    <section aria-labelledby="narrative-title" className="space-y-2">
      <h3 id="narrative-title" className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
        {t("anomalies.narrative")}
      </h3>
      {q.isPending ? (
        <div className="ap-card p-4">
          <SkeletonText lines={3} />
        </div>
      ) : q.isError ? (
        <ErrorState compact onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : (
        <WordingBlock templateText={q.data.template_text} narration={q.data} pending={false} />
      )}
    </section>
  );
}

/** One flag: why it stands out against its peers, the AI-written note, and the human review. */
export function AnomalyDetailPane({ id, backTo }: { id: number; backTo: string }) {
  const { t } = useTranslation();
  const { digits } = useLocale();
  const navigate = useNavigate();
  const q = useAnomaly(id);

  if (q.isPending) {
    return (
      <div className="space-y-4">
        <SkeletonCard />
        <SkeletonText lines={6} />
      </div>
    );
  }
  if (q.isError) {
    const status = isAxiosError(q.error) ? q.error.response?.status : undefined;
    if (status === 403 || status === 404) {
      return (
        <EmptyState
          compact
          illustration="quiet-pulse"
          title={t("anomalies.missing.title")}
          body={t("anomalies.missing.body")}
          action={{ label: t("anomalies.missing.action"), icon: ScanSearch, onClick: () => navigate(backTo) }}
        />
      );
    }
    return <ErrorState compact onRetry={() => void q.refetch()} retrying={q.isFetching} />;
  }

  const a = q.data;
  return (
    <article className="space-y-4" aria-labelledby="anomaly-title" data-testid="anomaly-detail" data-status={a.status}>
      <header className="space-y-2">
        <Link to={backTo} className="inline-flex min-h-11 items-center gap-1 text-small font-semibold text-muted hover:text-fg lg:hidden">
          <ArrowLeft aria-hidden className="size-4" />
          {t("anomalies.back")}
        </Link>
        <h2 id="anomaly-title" className="font-display text-h2 font-bold">
          {a.agent.name}
        </h2>
        <p className="num text-xs text-muted">
          {a.agent.code} · {a.agent.upazila ? `${a.agent.upazila}, ` : ""}
          {a.agent.district} · <TimeText at={a.window_start} mode="datetime" /> – <TimeText at={a.window_end} mode="datetime" />
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <SourceChip source="model" />
          <span className="num">
            {t("anomalies.score", { score: formatNumber(a.score, digits, { fraction: 2 }), threshold: formatNumber(a.threshold, digits, { fraction: 2 }) })}
          </span>
          <span className="num">{a.model_version}</span>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-2 text-small sm:grid-cols-4">
        {(
          [
            ["cashOut", <MoneyText key="o" value={a.context.cash_out_bdt} compact />],
            ["usual", <MoneyText key="u" value={a.context.baseline_cash_out_bdt} compact />],
            ["cashIn", <MoneyText key="i" value={a.context.cash_in_bdt} compact />],
            ["refills", <span key="r" className="num">{formatNumber(a.context.refills, digits)}</span>],
          ] as const
        ).map(([key, value]) => (
          <div key={key} className="rounded-2xl border border-line bg-surface px-3 py-2">
            <dt className="text-xs text-muted">{t(`anomalies.context.${key}`)}</dt>
            <dd className="mt-0.5 font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      <PeerChart features={a.features} peerCount={a.peer_count} peerGroup={a.peer_group} />
      <Narrative id={a.id} />
      <ReviewPanel anomaly={a} />

      <Link to={`/distributor/agents/${a.agent.agent_id}`} className={LINK}>
        <ExternalLink aria-hidden className="size-4" />
        {t("controlRoom.inspector.detail")}
      </Link>
    </article>
  );
}
