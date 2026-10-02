import { LifeBuoy, RotateCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { EmptyState } from "../../components/ui/StatePanel";

/** Signed in as an agent user with no agent row linked: nothing to predict. */
export function NoAgentState() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <EmptyState
      illustration="quiet-pulse"
      title={t("agent.noAgent.title")}
      body={t("agent.noAgent.body")}
      action={{ label: t("agent.noAgent.action"), icon: LifeBuoy, onClick: () => navigate("/help") }}
    />
  );
}

/** The agent exists but has no float predictions yet. */
export function NoPredictionState({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      title={t("agent.noData.title")}
      body={t("agent.noData.body")}
      action={{ label: t("agent.noData.action"), icon: RotateCw, onClick: onRetry }}
    />
  );
}
