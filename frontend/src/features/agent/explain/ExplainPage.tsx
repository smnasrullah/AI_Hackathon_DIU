import { Cpu, ShieldCheck, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import type { FloatType } from "../../../api/types";
import { NoAgentState } from "../AgentPageStates";
import { WhyPanel } from "../home/WhyPanel";
import { isFloatType } from "../runwayModel";
import { useMyAgentId } from "../useAgentData";

/** "Why?" (F7): SHAP reasons as WhyStones, the model chip kept apart from the AI wording chip. */
export function ExplainPage() {
  const { t } = useTranslation();
  const id = useMyAgentId();
  const [params] = useSearchParams();
  const raw = params.get("float");
  const initial: FloatType = isFloatType(raw) ? raw : "cash";

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-h1 font-bold">{t("explain.title")}</h1>
        <p className="mt-1 text-small text-muted">{t("explain.lead")}</p>
      </header>

      <dl className="grid gap-2 text-small sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface p-3">
          <dt className="inline-flex items-center gap-1.5 rounded-full bg-pulse/12 px-2.5 py-1 text-xs font-semibold text-pulse-fg">
            <Cpu aria-hidden className="size-3.5" />
            {t("why.model")}
          </dt>
          <dd className="mt-2 text-muted">{t("explain.modelChip")}</dd>
        </div>
        <div className="rounded-xl border border-line bg-surface p-3">
          <dt className="inline-flex items-center gap-1.5 rounded-full bg-brand/20 px-2.5 py-1 text-xs font-semibold text-fg">
            <Sparkles aria-hidden className="size-3.5" />
            {t("why.llm")}
          </dt>
          <dd className="mt-2 text-muted">{t("explain.aiChip")}</dd>
        </div>
      </dl>

      {id === null ? <NoAgentState /> : <WhyPanel key={initial} agentId={id} initialFloat={initial} />}

      <p className="flex items-center gap-1.5 text-xs text-muted">
        <ShieldCheck aria-hidden className="size-3.5" />
        {t("common.advisory")}
      </p>
    </div>
  );
}
