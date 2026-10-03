import { Banknote, Clock, PackageCheck, Users, XCircle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useCancelHelp, useConfirmHelp, useConfirmLateHelp } from "../../api/hooks/helpRequests";
import type { HelpRequestItem } from "../../api/types";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { LiquidButton } from "../../components/ui/LiquidButton";
import { toast } from "../../components/ui/toastStore";
import { formatDuration, formatMoney, formatNumber } from "../../lib/format";
import { useLocale } from "../../lib/prefs";
import { askedCount, hoursUntil, isActive } from "./helpModel";
import { HelpTimeline } from "./HelpTimeline";

/** The requester's own request: where it stands, how many were asked (never who), and the two actions. */
export function MyHelpRequestCard({ item, now }: { item: HelpRequestItem; now: Date }) {
  const { t } = useTranslation();
  const { lang, digits } = useLocale();
  const confirm = useConfirmHelp();
  const confirmLate = useConfirmLateHelp();
  const cancel = useCancelHelp();
  const [asking, setAsking] = useState(false);
  const active = isActive(item.status);
  const amount = formatMoney(item.amount_needed, digits, { lang });
  const float = t(`float.${item.float_type}`);
  const left = formatDuration(hoursUntil(item.needed_by, now), lang, digits);
  // Same clock as needed_by: at request time this equals the forecast page's "stock-out in X".
  const stockoutLeft = item.stockout_at ? hoursUntil(item.stockout_at, now) : null;
  const asked = askedCount(item);

  function onReceived(): void {
    confirm.mutate(
      { id: item.id },
      {
        onSuccess: () => toast({ tone: "success", title: t("liquidity.agent.mine.receivedDone") }),
        onError: () => toast({ tone: "error", title: t("liquidity.agent.card.failed") }),
      },
    );
  }

  function onReceivedLate(): void {
    confirmLate.mutate(
      { id: item.id },
      {
        onSuccess: () => toast({ tone: "success", title: t("liquidity.agent.mine.receivedDone") }),
        onError: () => toast({ tone: "error", title: t("liquidity.agent.card.failed") }),
      },
    );
  }

  function onCancel(): void {
    cancel.mutate(
      { id: item.id },
      {
        onSuccess: () => {
          setAsking(false);
          toast({ tone: "info", title: t("liquidity.agent.mine.cancelled") });
        },
        onError: () => {
          setAsking(false);
          toast({ tone: "error", title: t("liquidity.agent.card.failed") });
        },
      },
    );
  }

  return (
    <article data-testid="my-help-request" data-request-id={item.id} data-status={item.status} className="ap-card space-y-4 p-5 shadow-soft">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-semibold">
          <span className="block text-body font-bold">{t("liquidity.agent.card.needs", { amount, float })}</span>
          <span data-testid="my-help-status" className="block text-small text-muted">
            {t(`liquidity.status.${item.status}`)}
          </span>
        </p>
        {active ? (
          <time dateTime={item.needed_by} data-testid="my-help-left" className="num rounded-full bg-surface-2 px-3 py-1 text-small font-semibold">
            {item.deadline_asap ? t("liquidity.asap") : t("liquidity.agent.mine.left", { time: left })}
          </time>
        ) : null}
      </header>

      <HelpTimeline status={item.status} />

      {active && stockoutLeft !== null && stockoutLeft > 0 ? (
        <p className="num flex items-center gap-2 text-small text-muted" data-testid="my-help-stockout">
          <Clock aria-hidden className="size-4" />
          {t("liquidity.agent.mine.stockout", { time: formatDuration(stockoutLeft, lang, digits) })}
        </p>
      ) : null}

      <p className="flex items-center gap-2 text-small text-muted" data-testid="my-help-asked">
        <Users aria-hidden className="size-4" />
        {t("liquidity.agent.mine.asked", { n: formatNumber(asked, digits) })}
      </p>

      {item.status === "claimed" ? (
        <div className="space-y-2">
          <LiquidButton data-testid="help-received" icon={Banknote} loading={confirm.isPending} disabled={confirm.isPending} onClick={onReceived} className="w-full">
            {t("liquidity.agent.mine.received")}
          </LiquidButton>
          <p className="text-xs text-muted">{t("liquidity.agent.mine.receivedHint")}</p>
        </div>
      ) : null}

      {item.can_confirm_late ? (
        <div className="space-y-2">
          <LiquidButton data-testid="help-received-late" variant="secondary" icon={PackageCheck} loading={confirmLate.isPending} disabled={confirmLate.isPending} onClick={onReceivedLate} className="w-full">
            {t("liquidity.agent.mine.receivedLate")}
          </LiquidButton>
          <p className="text-xs text-muted">{t("liquidity.agent.mine.receivedLateHint")}</p>
        </div>
      ) : null}

      {active ? (
        <LiquidButton data-testid="help-cancel" variant="secondary" icon={XCircle} className="w-full" onClick={() => setAsking(true)}>
          {t("liquidity.agent.mine.cancel")}
        </LiquidButton>
      ) : null}

      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={t("liquidity.agent.mine.cancelTitle")}
        description={t("liquidity.agent.mine.cancelBody")}
        confirmLabel={t("liquidity.agent.mine.cancel")}
        cancelLabel={t("liquidity.agent.mine.keep")}
        tone="danger"
        pending={cancel.isPending}
        onConfirm={onCancel}
      />
    </article>
  );
}
