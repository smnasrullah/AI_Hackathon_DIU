import { AlertTriangle, Banknote, ChevronLeft } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import { useConfirmHelp, useHelpRequest } from "../../../api/hooks/helpRequests";
import type { HelpRequestItem, Lang } from "../../../api/types";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { LiquidButton } from "../../../components/ui/LiquidButton";
import { PageHeader } from "../../../components/ui/PageHeader";
import { EmptyState, ErrorState } from "../../../components/ui/StatePanel";
import { SkeletonPanel } from "../../../components/ui/Skeleton";
import { toast } from "../../../components/ui/toastStore";
import { errorCode } from "../../../lib/apiError";
import { formatDateTime, formatMoney, formatNumber } from "../../../lib/format";
import { useLocale } from "../../../lib/prefs";
import { attentionFor } from "../helpModel";
import { HelpTimeline } from "../HelpTimeline";

/** One request of mine: timeline, who was asked and what they said, and confirm on the requester's behalf. */
export function HelpRequestDetail({ id }: { id: number }) {
  const { t } = useTranslation();
  const q = useHelpRequest(id);
  const navigate = useNavigate();
  const { lang, digits } = useLocale();

  return (
    <div className="space-y-6">
      <Link to="/distributor/help-requests" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-pulse-fg hover:underline">
        <ChevronLeft aria-hidden className="size-4" />
        {t("liquidity.dist.back")}
      </Link>
      {q.isPending ? (
        <SkeletonPanel rows={4} />
      ) : q.isError ? (
        errorCode(q.error) === "forbidden" ? (
          <EmptyState title={t("liquidity.dist.missing")} action={{ label: t("liquidity.dist.back"), onClick: () => navigate("/distributor/help-requests") }} />
        ) : (
          <ErrorState onRetry={() => void q.refetch()} retrying={q.isFetching} />
        )
      ) : (
        <HelpRequestBody item={q.data} lang={lang} digits={digits} />
      )}
    </div>
  );
}

function HelpRequestBody({ item, lang, digits }: { item: HelpRequestItem; lang: Lang; digits: Lang }) {
  const { t } = useTranslation();
  const confirm = useConfirmHelp();
  const [asking, setAsking] = useState(false);
  const amount = formatMoney(item.amount_needed, digits, { lang });
  const float = t(`float.${item.float_type}`);
  const attention = attentionFor(item, null);
  const recipients = item.recipients ?? [];
  const area = item.requester.upazila ?? item.requester.district;

  function onConfirm(): void {
    confirm.mutate(
      { id: item.id },
      {
        onSuccess: () => {
          setAsking(false);
          toast({ tone: "success", title: t("liquidity.dist.done") });
        },
        onError: () => {
          setAsking(false);
          toast({ tone: "error", title: t("liquidity.agent.card.failed") });
        },
      },
    );
  }

  return (
    <>
      <PageHeader
        title={t("liquidity.agent.card.needs", { amount, float })}
        description={`${item.requester.name} · ${area}`}
        actions={
          item.status === "claimed" ? (
            <LiquidButton icon={Banknote} onClick={() => setAsking(true)}>
              {t("liquidity.dist.confirm")}
            </LiquidButton>
          ) : null
        }
      />

      {attention ? (
        <p role="status" data-testid="help-attention" className="flex items-center gap-2 rounded-xl bg-act-solid px-4 py-3 text-small font-bold text-white">
          <AlertTriangle aria-hidden className="size-4" />
          {t(`liquidity.attention.${attention}`)}
        </p>
      ) : null}

      <section className="ap-card space-y-4 p-5 shadow-soft" aria-label={t("liquidity.timeline.label")}>
        <p className="text-small">
          <span className="font-semibold">{t(`liquidity.status.${item.status}`)}</span>
          {" · "}
          {t("liquidity.dist.deadline", { time: formatDateTime(new Date(item.needed_by), lang, digits) })}
        </p>
        <p className="text-small text-muted">
          {item.claimed_by ? t("liquidity.dist.claimedBy", { code: item.claimed_by.display }) : t("liquidity.dist.nobody")}
        </p>
        <HelpTimeline status={item.status} />
      </section>

      <section aria-labelledby="help-recipients" className="space-y-3">
        <h2 id="help-recipients" className="font-display text-h2 font-bold">
          {t("liquidity.dist.recipients")}
        </h2>
        {recipients.length === 0 ? (
          <p className="text-small text-muted">{t("liquidity.dist.noRecipients")}</p>
        ) : (
          <ul className="divide-y divide-line ap-card" data-testid="help-recipients">
            {recipients.map((r) => (
              <li key={r.user_id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-small">
                <span className="font-semibold">{r.display}</span>
                <span className="text-muted">{t("liquidity.dist.wave", { n: formatNumber(r.wave_number, digits) })}</span>
                <span data-testid="help-response">{t(`liquidity.response.${r.response}`)}</span>
                {r.distance_km !== null ? (
                  <span className="num text-muted">{t("liquidity.agent.card.distance", { km: formatNumber(r.distance_km, digits, { fraction: 1 }) })}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={t("liquidity.dist.confirmTitle")}
        description={t("liquidity.dist.confirmBody")}
        confirmLabel={t("liquidity.dist.confirm")}
        pending={confirm.isPending}
        onConfirm={onConfirm}
      />
    </>
  );
}
