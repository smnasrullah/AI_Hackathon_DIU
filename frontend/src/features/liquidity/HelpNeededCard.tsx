import { AlertTriangle, CheckCircle2, Clock, HandHeart, Info, MapPin, Undo2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useClaimHelp, useDeclineHelp, useWithdrawHelp } from "../../api/hooks/helpRequests";
import type { HelpRequestItem } from "../../api/types";
import { LiquidButton } from "../../components/ui/LiquidButton";
import { toast } from "../../components/ui/toastStore";
import { errorCode } from "../../lib/apiError";
import { formatDuration, formatMoney, formatNumber } from "../../lib/format";
import { useLocale } from "../../lib/prefs";
import { hoursUntil } from "./helpModel";

interface Props {
  item: HelpRequestItem;
  now: Date;
}

/** One request addressed to me: who asks, how much, by when, and my answer (or my claimed next step). */
export function HelpNeededCard({ item, now }: Props) {
  const { t } = useTranslation();
  const { lang, digits } = useLocale();
  const claim = useClaimHelp();
  const decline = useDeclineHelp();
  const withdraw = useWithdrawHelp();
  const busy = claim.isPending || decline.isPending || withdraw.isPending;

  const amount = formatMoney(item.amount_needed, digits, { lang });
  const float = t(`float.${item.float_type}`);
  const hours = hoursUntil(item.needed_by, now);
  const overdue = hours <= 0;
  const area = item.requester.upazila ?? item.requester.district;
  const name = item.requester.name;
  const claimedByMe = item.claimed_by_me;

  function onClaim(): void {
    claim.mutate(item.id, {
      onSuccess: () => toast({ tone: "success", title: t("liquidity.agent.card.waiting") }),
      onError: (err) =>
        toast(
          errorCode(err) === "already_taken"
            ? { tone: "warning", title: t("liquidity.agent.card.taken") }
            : { tone: "error", title: t("liquidity.agent.card.failed") },
        ),
    });
  }

  function onDecline(): void {
    decline.mutate(
      { id: item.id },
      {
        onSuccess: () => toast({ tone: "info", title: t("liquidity.agent.card.declined") }),
        onError: () => toast({ tone: "error", title: t("liquidity.agent.card.failed") }),
      },
    );
  }

  function onWithdraw(): void {
    withdraw.mutate(
      { id: item.id },
      {
        onSuccess: () => toast({ tone: "info", title: t("liquidity.agent.card.withdrawn") }),
        onError: () => toast({ tone: "error", title: t("liquidity.agent.card.failed") }),
      },
    );
  }

  return (
    <article data-testid={`help-needed-${item.id}`} data-claimed={claimedByMe ? "true" : "false"} className="ap-card p-5 shadow-soft">
      <p className="flex items-start gap-2 font-semibold">
        <HandHeart aria-hidden className="mt-0.5 size-5 shrink-0 text-act-fg" />
        <span>
          <span className="block">{t("liquidity.agent.card.from", { name, area: area ?? "" })}</span>
          <span className="block text-body font-bold">{t("liquidity.agent.card.needs", { amount, float })}</span>
        </span>
      </p>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-small text-muted">
        {item.urgent ? (
          <li data-testid="help-urgent" className="flex items-center gap-1.5 font-semibold text-act-fg">
            <AlertTriangle aria-hidden className="size-3.5" />
            {t("liquidity.urgent")}
          </li>
        ) : null}
        <li className="flex items-center gap-1.5">
          <Clock aria-hidden className="size-3.5" />
          {overdue ? (
            <span data-testid="help-countdown" className="font-semibold text-act-fg">
              {t("liquidity.agent.card.overdue")}
            </span>
          ) : item.deadline_asap ? (
            <span data-testid="help-countdown" className="font-semibold text-act-fg">
              {t("liquidity.asap")}
            </span>
          ) : (
            <time data-testid="help-countdown" dateTime={item.needed_by} className="num">
              {t("liquidity.agent.card.left", { time: formatDuration(hours, lang, digits) })}
            </time>
          )}
        </li>
        {typeof item.my_distance_km === "number" ? (
          <li className="num flex items-center gap-1.5">
            <MapPin aria-hidden className="size-3.5" />
            {t("liquidity.agent.card.distance", { km: formatNumber(item.my_distance_km, digits, { fraction: 1 }) })}
          </li>
        ) : null}
      </ul>
      {/* Helpers get only a coarse, number-free reason; the full one stays with the requester side. */}
      <p data-testid="help-reason-category" className="mt-2 flex items-center gap-1.5 text-small">
        <Info aria-hidden className="size-3.5 text-muted" />
        {t("liquidity.agent.card.reason", { reason: t(`liquidity.reasonCategory.${item.reason_category ?? "unknown"}`) })}
      </p>

      {claimedByMe ? (
        <div className="mt-4 space-y-3">
          <p role="status" data-testid="help-next-step" className="flex items-start gap-2 rounded-xl bg-surface-2 px-4 py-3 text-small font-semibold">
            <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-safe-fg" />
            {t("liquidity.agent.card.next", { amount, float, name })}
          </p>
          <LiquidButton data-testid="help-withdraw" variant="secondary" size="sm" icon={Undo2} disabled={busy} loading={withdraw.isPending} onClick={onWithdraw}>
            {t("liquidity.agent.card.withdraw")}
          </LiquidButton>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <LiquidButton data-testid="help-decline" variant="secondary" icon={X} disabled={busy} loading={decline.isPending} onClick={onDecline}>
            {t("liquidity.agent.card.cantHelp")}
          </LiquidButton>
          <LiquidButton data-testid="help-claim" icon={HandHeart} disabled={busy || overdue} loading={claim.isPending} onClick={onClaim}>
            {t("liquidity.agent.card.canHelp")}
          </LiquidButton>
        </div>
      )}
    </article>
  );
}
