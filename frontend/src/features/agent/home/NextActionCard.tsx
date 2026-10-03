import { ArrowLeftRight, ChartLine, CheckCircle2, Clock, Send, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { useRecommendation, useRequestRecommendation } from "../../../api/hooks/agents";
import type { RecommendationItem } from "../../../api/types";
import { LiquidButton } from "../../../components/ui/LiquidButton";
import { SkeletonCard } from "../../../components/ui/Skeleton";
import { EmptyState, ErrorState } from "../../../components/ui/StatePanel";
import { toast } from "../../../components/ui/toastStore";
import { formatClock, formatMoney } from "../../../lib/format";
import { useLocale } from "../../../lib/prefs";
import { pickNextAction } from "./nextAction";

/** The one primary action on agent home: ask the distributor to act on the top recommendation. */
export function NextActionCard({ agentId }: { agentId: number }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const q = useRecommendation(agentId);
  const request = useRequestRecommendation(agentId);

  if (q.isPending) return <SkeletonCard />;
  if (q.isError) return <ErrorState compact onRetry={() => void q.refetch()} retrying={q.isFetching} />;

  const item = pickNextAction(q.data.items);
  if (!item) {
    return (
      <EmptyState
        compact
        illustration="quiet-pulse"
        title={t("action.clear.title")}
        body={t("action.clear.body")}
        action={{ label: t("action.clear.action"), icon: ChartLine, onClick: () => navigate("/agent/forecast") }}
      />
    );
  }

  function ask(id: number): void {
    request.mutate(id, {
      onSuccess: () => toast({ tone: "success", title: t("action.sent") }),
      onError: () => toast({ tone: "error", title: t("action.failed") }),
    });
  }

  return (
    <section aria-labelledby="next-action" className="ap-card p-5 shadow-soft">
      <ActionSummary item={item} />
      {item.status === "open" ? (
        <LiquidButton className="mt-5 w-full" size="lg" icon={Send} loading={request.isPending} onClick={() => ask(item.id)}>
          {t("action.ask")}
        </LiquidButton>
      ) : (
        <p className="mt-5 flex items-center gap-2 rounded-xl bg-surface-2 px-4 py-3 text-small font-semibold" role="status">
          {item.status === "requested" ? <Clock aria-hidden className="size-4 text-pulse-fg" /> : <CheckCircle2 aria-hidden className="size-4 text-muted" />}
          {t(`action.${item.status}`)}
        </p>
      )}
      {item.channel === "swap" ? (
        <LiquidButton variant="ghost" className="mt-2 w-full" icon={ArrowLeftRight} onClick={() => navigate("/agent/swap")}>
          {t("action.seeSwaps")}
        </LiquidButton>
      ) : null}
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
        <ShieldCheck aria-hidden className="size-3.5" />
        {t("common.advisory")}
      </p>
    </section>
  );
}

function ActionSummary({ item }: { item: RecommendationItem }) {
  const { t } = useTranslation();
  const { lang, digits } = useLocale();
  const amount = formatMoney(item.amount_bdt, digits, { lang });
  return (
    <>
      <p id="next-action" className="text-small font-semibold text-muted">
        {t("action.title")}
      </p>
      <p className="mt-1 font-display text-h2 font-bold leading-tight">
        {t("action.add", { amount, float: t(`float.${item.float_type}`) })}
      </p>
      <p className="mt-1 text-small">
        {item.rationale.urgent ? (
          <span className="font-semibold text-act-fg">{t("action.urgent")}</span>
        ) : (
          t("action.by", { time: formatClock(new Date(item.deadline_at), lang, digits) })
        )}
        {item.channel ? <span className="text-muted"> · {t(`action.channel.${item.channel}`)}</span> : null}
      </p>
    </>
  );
}
