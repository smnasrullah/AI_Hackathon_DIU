import { ArrowDownLeft, ArrowUpRight, Check, CheckCircle2, MapPin, RotateCw, X, XCircle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useRespondSwap, useSwaps } from "../../../api/hooks/swaps";
import type { SwapItem, SwapRespondIn } from "../../../api/types";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { LiquidButton } from "../../../components/ui/LiquidButton";
import { SkeletonCard } from "../../../components/ui/Skeleton";
import { EmptyState, ErrorState } from "../../../components/ui/StatePanel";
import { toast } from "../../../components/ui/toastStore";
import { formatMoney, formatNumber } from "../../../lib/format";
import { useLocale } from "../../../lib/prefs";

type Answer = SwapRespondIn["response"];

/** Pending agent-to-agent swaps (F5) the signed-in agent is part of: accept or decline, the distributor decides. */
export function SwapOffers({ agentId }: { agentId: number }) {
  const { t } = useTranslation();
  const q = useSwaps({ status: "pending" });
  const items = q.data?.items ?? [];

  return (
    <section aria-labelledby="swap-offers" className="space-y-3">
      <h2 id="swap-offers" className="font-display text-h2 font-bold">
        {t("rebalance.swaps.title")}
      </h2>
      {q.isPending ? (
        <SkeletonCard />
      ) : q.isError ? (
        <ErrorState compact onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : items.length === 0 ? (
        <EmptyState
          compact
          illustration="quiet-pulse"
          title={t("rebalance.swaps.empty.title")}
          body={t("rebalance.swaps.empty.body")}
          action={{ label: t("rebalance.swaps.empty.action"), icon: RotateCw, onClick: () => void q.refetch() }}
        />
      ) : (
        <ul className="space-y-3">
          {items.map((s) => (
            <li key={s.id}>
              <SwapOfferCard swap={s} agentId={agentId} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SwapOfferCard({ swap, agentId }: { swap: SwapItem; agentId: number }) {
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

  function send(answer: Answer): void {
    respond.mutate(
      { id: swap.id, body: { response: answer } },
      {
        onSuccess: () => {
          setAsking(null);
          toast({ tone: "success", title: t(`rebalance.swaps.sent.${answer}`) });
        },
        onError: () => toast({ tone: "error", title: t("rebalance.swaps.failed") }),
      },
    );
  }

  return (
    <article data-testid={`swap-offer-${swap.id}`} className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-soft">
      <p className="flex items-start gap-2 font-semibold">
        <Direction aria-hidden className="mt-0.5 size-5 shrink-0 text-pulse-fg" />
        {t(gives ? "rebalance.swaps.give" : "rebalance.swaps.receive", vars)}
      </p>
      <p className="num mt-1 flex items-center gap-1.5 text-small text-muted">
        <MapPin aria-hidden className="size-3.5" />
        {t("rebalance.swaps.distance", { km: formatNumber(swap.distance_km, digits, { fraction: 1 }) })}
        {partner.upazila ? ` · ${partner.upazila}` : ""}
      </p>
      {partner.response ? (
        <p className="mt-2 text-small">{t(`rebalance.swaps.partner.${partner.response}`, { name: partner.name })}</p>
      ) : null}

      {me.response ? (
        <p role="status" data-testid="my-response" className="mt-4 flex items-center gap-2 rounded-xl bg-surface-2 px-4 py-3 text-small font-semibold">
          {me.response === "accepted" ? (
            <CheckCircle2 aria-hidden className="size-4 text-safe-fg" />
          ) : (
            <XCircle aria-hidden className="size-4 text-act-fg" />
          )}
          {t(`rebalance.swaps.mine.${me.response}`)}
        </p>
      ) : null}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <LiquidButton variant="secondary" icon={X} disabled={me.response === "declined"} onClick={() => setAsking("decline")}>
          {t("rebalance.swaps.decline")}
        </LiquidButton>
        <LiquidButton icon={Check} disabled={me.response === "accepted"} onClick={() => setAsking("accept")}>
          {t("rebalance.swaps.accept")}
        </LiquidButton>
      </div>

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
