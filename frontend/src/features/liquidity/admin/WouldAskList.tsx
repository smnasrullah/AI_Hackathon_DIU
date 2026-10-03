import { EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { PlanItemOut } from "../../../api/types";
import { formatMoney } from "../../../lib/format";
import { useLocale } from "../../../lib/prefs";
import { HELP_ADMIN_NS } from "../../../i18n/helpAdmin";

/** Dry run (or kill switch): nothing was sent. Lists each request that WOULD have been made and
 * who WOULD have been asked (agent / distributor codes, never e-mails). */
export function WouldAskList({ dryRun, items, heading = true }: { dryRun: boolean; items: readonly PlanItemOut[]; heading?: boolean }) {
  const { t } = useTranslation();
  const { t: th } = useTranslation(HELP_ADMIN_NS);
  const { lang, digits } = useLocale();
  return (
    <div role="status" data-testid="would-ask" className="space-y-2 rounded-xl bg-surface-2 px-4 py-3 text-small">
      {heading ? (
        <p className="flex items-center gap-2 font-bold">
          <EyeOff aria-hidden className="size-4 shrink-0" />
          {th(dryRun ? "wouldAsk.dryRun" : "wouldAsk.off")}
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className="text-muted">{th("wouldAsk.none")}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((p) => (
            <li key={`${p.agent_id}-${p.float_type}`} data-testid="would-ask-item">
              <span className="font-semibold">
                {p.agent_code} · {t(`float.${p.float_type}`)} · <span className="num">{formatMoney(p.amount_bdt, digits, { lang })}</span>
              </span>
              <span className="block text-muted">
                {th("wouldAsk.asked", { who: p.asks.map((a) => a.display).join(", ") || "—" })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
