import { ArrowDownLeft, ArrowUpRight, Check, CheckCircle2, Clock, Hourglass, Lock, MapPin, ShieldCheck, X, XCircle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useRespondSwap } from "../../../api/hooks/swaps";
import type { SwapItem, SwapRespondIn } from "../../../api/types";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { LangText } from "../../../components/ui/LangText";
import { LiquidButton } from "../../../components/ui/LiquidButton";
import { toast } from "../../../components/ui/toastStore";
import { formatDateTime, formatMoney, formatNumber } from "../../../lib/format";
import { useLocale } from "../../../lib/prefs";
import { errorCode } from "../../../lib/apiError";

type Answer = SwapRespondIn["response"];

/** One swap the signed-in agent is part of: partner, distance, amount, deadline; accept or decline while pending. */
export function SwapOfferCard({ swap, agentId }: { swap: SwapItem; agentId: number }) {
  const { t } = useTranslation();
  const { lang, digits } = useLocale();
  const [asking, setAsking] = useState<Answer | null>(null);
  const respond = useRespondSwap();
  const gives = swap.donor.agent_id === agentId;
  const me = gives ? swap.donor : swap.receiver;
  const partner = gives ? swap.receiver : swap.donor;
  const amount = formatMoney(swap.amount_bdt, digits, { lang });
  const floatName = t(`float.${swap.float_type}`);
  const vars = { amount, float: floatName, name: partner.name };
  const Direction = gives ? ArrowUpRight : ArrowDownLeft;
  const pending = swap.status === "pending";

  function send(answer: Answer): void {
    respond.mutate(
      { id: swap.id, body: { response: answer } },
      {
        onSuccess: () => {
          setAsking(null);
          toast({ tone: "success", title: t(`rebalance.swaps.sent.${answer}`) });
        },
        onError: (err) => {
          setAsking(null);
          const code = errorCode(err);
          const title =
            code === "already_decided"
              ? t("rebalance.swaps.closed.already_decided")
              : code === "forbidden"
                ? t("rebalance.swaps.closed.forbidden")
                : t("rebalance.swaps.failed");
          toast({ tone: "error", title });
        },
      },
    );
  }

  return (
    <article
      data-testid={`swap-offer-${swap.id}`}
      data-status={swap.status}
      className="ap-card p-5 shadow-soft"
    >
      <p className="flex items-start gap-2 font-semibold">
        <Direction aria-hidden className="mt-0.5 size-5 shrink-0 text-pulse-fg" />
        {t(gives ? "rebalance.swaps.give" : "rebalance.swaps.receive", vars)}
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-muted">
        <span className="num flex items-center gap-1.5">
          <MapPin aria-hidden className="size-3.5" />
          {t("rebalance.swaps.distance", { km: formatNumber(swap.distance_km, digits, { fraction: 1 }) })}
          {partner.upazila ? ` · ${partner.upazila}` : ""}
        </span>
        {swap.deadline_at ? (
          <span data-testid="swap-deadline" className="flex items-center gap-1.5">
            <Clock aria-hidden className="size-3.5" />
            {t("rebalance.swaps.deadline", { time: formatDateTime(new Date(swap.deadline_at), lang, digits) })}
          </span>
        ) : null}
      </p>
      {partner.response ? (
        <p className="mt-2 text-small">{t(`rebalance.swaps.partner.${partner.response}`, { name: partner.name })}</p>
      ) : null}

      {me.response && pending ? (
        <p role="status" data-testid="my-response" className="mt-4 flex items-center gap-2 rounded-xl bg-surface-2 px-4 py-3 text-small font-semibold">
          {me.response === "accepted" ? (
            <CheckCircle2 aria-hidden className="size-4 text-safe-fg" />
          ) : (
            <XCircle aria-hidden className="size-4 text-act-fg" />
          )}
          {t(`rebalance.swaps.mine.${me.response}`)}
        </p>
      ) : null}

      {pending ? null : (
        <p role="status" data-testid="swap-decision" className="mt-4 flex items-center gap-2 rounded-xl bg-surface-2 px-4 py-3 text-small font-semibold">
          {swap.status === "approved" ? (
            <ShieldCheck aria-hidden className="size-4 text-safe-fg" />
          ) : (
            <XCircle aria-hidden className="size-4 text-act-fg" />
          )}
          {swap.status === "approved" ? t("rebalance.swaps.decided.approved") : t("rebalance.swaps.decided.rejected")}
        </p>
      )}
      {/* Answers can change until the distributor decides; after that the swap is locked. */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <LiquidButton variant="secondary" icon={X} disabled={!pending || me.response === "declined"} onClick={() => setAsking("decline")}>
          {t("rebalance.swaps.decline")}
        </LiquidButton>
        <LiquidButton icon={Check} disabled={!pending || me.response === "accepted"} onClick={() => setAsking("accept")}>
          {t("rebalance.swaps.accept")}
        </LiquidButton>
      </div>
      {pending ? null : (
        <p data-testid="swap-locked" className="mt-2 flex items-center gap-1.5 text-xs text-muted">
          <Lock aria-hidden className="size-3.5" />
          {t("rebalance.swaps.locked")}
        </p>
      )}
      {pending && me.response ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
          <Hourglass aria-hidden className="size-3.5" />
          {me.response === "accepted" ? `${t("rebalance.swaps.waiting")} · ` : ""}
          {t("rebalance.swaps.canChange")}
        </p>
      ) : null}
      {swap.note ? <p className="mt-2 text-small text-muted"><LangText text={t("rebalance.note", { note: swap.note })} /></p> : null}

      <ConfirmDialog
        open={asking !== null}
        onOpenChange={(open) => setAsking(open ? asking : null)}
        title={t(`rebalance.swaps.confirm.${asking ?? "accept"}.title`)}
        description={t(`rebalance.swaps.confirm.${asking ?? "accept"}.body`, vars)}
        confirmLabel={t(`rebalance.swaps.${asking ?? "accept"}`)}
        tone={asking === "decline" ? "danger" : "default"}
        pending={respond.isPending}
        onConfirm={() => asking && send(asking)}
      />
    </article>
  );
}
