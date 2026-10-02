import { ArrowRight, CircleCheck, CircleDashed, CircleX, Route, Truck } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { SwapItem, SwapParty } from "../../../api/types";
import { MoneyText } from "../../../components/ui/MoneyText";
import { cn } from "../../../lib/cn";
import { formatNumber, localizeDigits } from "../../../lib/format";
import { useLocale } from "../../../lib/prefs";

function PartyLine({ party, role }: { party: SwapParty; role: "donor" | "receiver" }) {
  const { t } = useTranslation();
  const Icon = party.response === "accepted" ? CircleCheck : party.response === "declined" ? CircleX : CircleDashed;
  const tone = party.response === "accepted" ? "text-safe-fg" : party.response === "declined" ? "text-act-fg" : "text-muted";
  return (
    <span className="min-w-0">
      <span className="block truncate font-semibold">{party.name}</span>
      <span className={cn("flex items-center gap-1 text-xs", tone)}>
        <Icon aria-hidden className="size-3.5" />
        {t(`swaps.role.${role}`)} · {t(`swaps.response.${party.response ?? "none"}`)}
      </span>
    </span>
  );
}

interface SwapCardProps {
  swap: SwapItem;
  /** Pending swaps open the handshake card. */
  onOpen?: () => void;
  className?: string;
}

/** Donor -> receiver, amount, distance, both agents' answers and the decision note. */
export function SwapCard({ swap, onOpen, className }: SwapCardProps) {
  const { t } = useTranslation();
  const { digits } = useLocale();
  const body = (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-small">
        <PartyLine party={swap.donor} role="donor" />
        <ArrowRight aria-hidden className="size-4 text-muted" />
        <PartyLine party={swap.receiver} role="receiver" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <MoneyText value={swap.amount_bdt} className="font-display text-h2 font-bold text-fg" />
        <span className={swap.float_type === "cash" ? "text-cash" : "text-emoney"}>{t(`float.${swap.float_type}`)}</span>
        <span className="num inline-flex items-center gap-1">
          <Route aria-hidden className="size-3.5" />
          {localizeDigits(t("swaps.distance", { km: formatNumber(swap.distance_km, digits, { fraction: 1 }) }), digits)}
        </span>
        {swap.van_trip_saved ? (
          <span className="inline-flex items-center gap-1 text-safe-fg">
            <Truck aria-hidden className="size-3.5" />
            {t("swaps.vanSaved")}
          </span>
        ) : null}
      </div>
      {swap.note ? <p className="mt-2 border-l-2 border-line-strong pl-2 text-small text-muted">{t("swaps.note", { note: swap.note })}</p> : null}
    </>
  );
  const shell = cn("block w-full rounded-2xl border border-line bg-surface p-3 text-left shadow-soft", className);
  return onOpen ? (
    <button type="button" onClick={onOpen} data-testid="swap-card" data-swap-id={swap.id} className={cn(shell, "transition-shadow hover:shadow-[inset_3px_0_0_var(--pulse-blue)]")}>
      {body}
    </button>
  ) : (
    <div data-testid="swap-card" data-swap-id={swap.id} className={shell}>
      {body}
    </div>
  );
}
