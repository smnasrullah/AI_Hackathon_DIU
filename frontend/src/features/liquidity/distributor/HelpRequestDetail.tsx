import { AlertTriangle, Banknote, ChevronLeft, PackageCheck, XCircle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import { useCancelHelp, useConfirmHelp, useConfirmLateHelp, useHelpRequest } from "../../../api/hooks/helpRequests";
import type { HelpRequestItem, Lang } from "../../../api/types";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { LangText } from "../../../components/ui/LangText";
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
import { UrgentBadge } from "../HelpParts";

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

type Ask = "confirm" | "confirmLate" | "cancel" | null;

function HelpRequestBody({ item, lang, digits }: { item: HelpRequestItem; lang: Lang; digits: Lang }) {
  const { t } = useTranslation();
  const confirm = useConfirmHelp();
  const confirmLate = useConfirmLateHelp();
  const cancel = useCancelHelp();
  const [asking, setAsking] = useState<Ask>(null);
  const amount = formatMoney(item.amount_needed, digits, { lang });
  const float = t(`float.${item.float_type}`);
  const attention = attentionFor(item);
  const active = item.status === "open" || item.status === "claimed";
  // Only the requester's own distributor (owner view) may call it off; hidden otherwise.
  const canCancel = active && item.view === "owner";
  const pending = confirm.isPending || confirmLate.isPending || cancel.isPending;
  const recipients = item.recipients ?? [];
  const area = item.requester.upazila ?? item.requester.district;

  function onAnswer(): void {
    const action = asking === "cancel" ? cancel : asking === "confirmLate" ? confirmLate : confirm;
    const done = asking === "cancel" ? t("liquidity.dist.cancelled") : t("liquidity.dist.done");
    action.mutate(
      { id: item.id },
      {
        onSuccess: () => {
          setAsking(null);
          toast({ tone: "success", title: done });
        },
        onError: () => {
          setAsking(null);
          toast({ tone: "error", title: t("liquidity.agent.card.failed") });
        },
      },
    );
  }

  return (
    <>
      <PageHeader
        title={t("liquidity.agent.card.needs", { amount, float })}
        description={<LangText text={`${item.requester.name} · ${area}`} />}
        actions={
          <div className="flex flex-wrap gap-2">
            {item.status === "claimed" ? (
              <LiquidButton icon={Banknote} onClick={() => setAsking("confirm")}>
                {t("liquidity.dist.confirm")}
              </LiquidButton>
            ) : null}
            {item.can_confirm_late ? (
              <LiquidButton data-testid="help-confirm-late" variant="secondary" icon={PackageCheck} onClick={() => setAsking("confirmLate")}>
                {t("liquidity.dist.confirmLate")}
              </LiquidButton>
            ) : null}
            {canCancel ? (
              <LiquidButton data-testid="help-dist-cancel" variant="secondary" icon={XCircle} onClick={() => setAsking("cancel")}>
                {t("liquidity.dist.cancel")}
              </LiquidButton>
            ) : null}
          </div>
        }
      />

      {item.urgent ? <UrgentBadge /> : null}

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
          {t("liquidity.dist.deadline", { time: item.deadline_asap ? t("liquidity.asap") : formatDateTime(new Date(item.needed_by), lang, digits) })}
        </p>
        <p className="text-small text-muted">
          {item.claimed_by ? t("liquidity.dist.claimedBy", { code: item.claimed_by.display }) : t("liquidity.dist.nobody")}
        </p>
        {typeof item.wave_number === "number" && typeof item.max_waves === "number" ? (
          <p className="num text-small text-muted" data-testid="help-wave">
            {t("liquidity.dist.waveOf", { n: formatNumber(item.wave_number, digits), max: formatNumber(item.max_waves, digits) })}
          </p>
        ) : null}
        {item.reason_summary ? (
          <p className="text-small" data-testid="help-reason">
            <LangText text={item.reason_summary} />
          </p>
        ) : null}
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
        open={asking !== null}
        onOpenChange={(open) => setAsking(open ? asking : null)}
        title={t(`liquidity.dist.ask.${asking ?? "confirm"}.title`)}
        description={t(`liquidity.dist.ask.${asking ?? "confirm"}.body`)}
        confirmLabel={t(`liquidity.dist.ask.${asking ?? "confirm"}.action`)}
        tone={asking === "cancel" ? "danger" : "default"}
        pending={pending}
        onConfirm={onAnswer}
      />
    </>
  );
}
