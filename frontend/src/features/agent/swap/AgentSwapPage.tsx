import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../../components/ui/PageHeader";
import { NoAgentState } from "../AgentPageStates";
import { SwapOffers } from "../rebalance/SwapOffers";
import { useMyAgentId } from "../useAgentData";

/** /agent/swap (F5): every swap you are part of, what you receive and what you give, with its status. */
export function AgentSwapPage() {
  const { t } = useTranslation();
  const id = useMyAgentId();

  return (
    <div className="space-y-6">
      <PageHeader title={t("page.agentSwap")} description={t("rebalance.swaps.lead")} />
      {id === null ? <NoAgentState /> : <SwapOffers agentId={id} grouped />}
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <ShieldCheck aria-hidden className="size-3.5" />
        {t("common.advisory")}
      </p>
    </div>
  );
}
