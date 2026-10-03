import { Ban, CheckCircle2, Clock, PackageCheck, Send, XCircle, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useRequestRecommendation } from "../../../api/hooks/agents";
import type { RecommendationItem, RequestItem, RequestStatus } from "../../../api/types";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { LangText } from "../../../components/ui/LangText";
import { LiquidButton } from "../../../components/ui/LiquidButton";
import { RiskPill } from "../../../components/ui/RiskPill";
import { toast } from "../../../components/ui/toastStore";
import { cn } from "../../../lib/cn";
import { formatClock, formatDateTime, formatMoney, formatPercent } from "../../../lib/format";
import { useLocale } from "../../../lib/prefs";
import { canRequest } from "./requestStatus";

interface RecommendationCardProps {
  agentId: number;
  item: RecommendationItem;
  /** Latest request for this item from GET /recommendation-requests. */
  request: RequestItem | undefined;
}

const STATUS_ICON: Record<RequestStatus, LucideIcon> = {
  requested: Clock,
  approved: CheckCircle2,
  declined: XCircle,
  fulfilled: PackageCheck,
  cancelled: Ban,
};

const STATUS_TONE: Record<RequestStatus, string> = {
  requested: "bg-pulse/12 text-pulse-fg",
  approved: "bg-safe/15 text-safe-fg",
  declined: "bg-act/12 text-act-fg",
  fulfilled: "bg-safe/15 text-safe-fg",
  cancelled: "bg-surface-2 text-muted",
};

/** One rebalance recommendation (F4): amount, deadline, why, and the request to the distributor. */
export function RecommendationCard({ agentId, item, request }: RecommendationCardProps) {
  const { t } = useTranslation();
  const { lang, digits } = useLocale();
  const [confirming, setConfirming] = useState(false);
  const send = useRequestRecommendation(agentId);
  // Until the list refetches, the POST response is the freshest status.
  const sent = send.data?.recommendation_id === item.id ? send.data : undefined;
  const current = request ?? sent;
  const amount = formatMoney(item.amount_bdt, digits, { lang });
  const floatName = t(`float.${item.float_type}`);
  const r = item.rationale;

  function confirm(): void {
    send.mutate(item.id, {
      onSuccess: () => {
        setConfirming(false);
        toast({ tone: "success", title: t("action.sent") });
      },
      onError: () => toast({ tone: "error", title: t("action.failed") }),
    });
  }

  return (
    <article
      data-testid={`recommendation-${item.id}`}
      className={cn(
        "ap-card p-5 shadow-soft",
        item.status === "expired" && "opacity-70",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-small font-semibold text-muted">{floatName}</p>
        <RiskPill level={r.risk_level} size="sm" />
      </div>
      <p className="mt-1 font-display text-h2 font-bold leading-tight">{t("action.add", { amount, float: floatName })}</p>
      <p className="num mt-1 text-small">
        {r.urgent ? (
          <span className="font-semibold text-act-fg">{t("action.urgent")}</span>
        ) : (
          t("action.by", { time: formatClock(new Date(item.deadline_at), lang, digits) })
        )}
        {item.channel ? <span className="text-muted"> · {t(`action.channel.${item.channel}`)}</span> : null}
      </p>

      <dl className="num mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-surface-2 p-3 text-small">
        <dt className="text-muted">{t("rebalance.shortfall")}</dt>
        <dd className="text-right font-semibold">{formatMoney(r.shortfall_bdt, digits, { lang })}</dd>
        <dt className="text-muted">{t("rebalance.buffer")}</dt>
        <dd className="text-right font-semibold">{formatMoney(r.buffer_bdt, digits, { lang })}</dd>
        <dt className="text-muted">{t("rebalance.runsOut")}</dt>
        <dd className="text-right font-semibold">{formatDateTime(new Date(r.stockout_at), lang, digits)}</dd>
        <dt className="text-muted">{t("rebalance.chance")}</dt>
        <dd className="text-right font-semibold">{formatPercent(r.risk_probability, digits)}</dd>
      </dl>
      {r.capped ? <p className="mt-2 text-xs text-muted">{t("rebalance.capped")}</p> : null}

      {current ? <RequestStatusLine request={current} /> : null}
      {canRequest(item, current) ? (
        <LiquidButton className="mt-4 w-full" size="lg" icon={Send} onClick={() => setConfirming(true)}>
          {t("action.ask")}
        </LiquidButton>
      ) : !current ? (
        <p className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-small font-semibold text-muted">{t(`rebalance.item.${item.status}`)}</p>
      ) : null}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("rebalance.confirm.title")}
        description={t("rebalance.confirm.body", { amount, float: floatName })}
        confirmLabel={t("rebalance.confirm.action")}
        pending={send.isPending}
        onConfirm={confirm}
      />
    </article>
  );
}

function RequestStatusLine({ request }: { request: RequestItem }) {
  const { t } = useTranslation();
  const Icon = STATUS_ICON[request.status];
  return (
    <div role="status" className={cn("mt-4 rounded-xl px-4 py-3 text-small", STATUS_TONE[request.status])}>
      <p data-testid="request-status" data-status={request.status} className="flex items-center gap-2 font-semibold">
        <Icon aria-hidden className="size-4 shrink-0" />
        {t(`rebalance.status.${request.status}`)}
      </p>
      {request.note ? <p className="mt-1 text-fg"><LangText text={t("rebalance.note", { note: request.note })} /></p> : null}
    </div>
  );
}
