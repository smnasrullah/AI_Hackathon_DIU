import { BellOff, House, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { EmptyState } from "../../components/ui/StatePanel";
import { useAuthStore } from "../auth/authStore";
import { ROLE_HOME } from "../auth/types";

/** Empty inbox; when in-app notifications are off, says so and links to Settings. */
export function InboxEmpty({ compact, onAction }: { compact?: boolean; onAction?: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const muted = user?.notify_in_app === false;

  function go(to: string): void {
    onAction?.();
    navigate(to);
  }

  if (muted) {
    return (
      <EmptyState
        compact={compact}
        illustration="quiet-pulse"
        title={t("inbox.mutedTitle")}
        body={t("inbox.mutedBody")}
        action={{ label: t("inbox.mutedAction"), icon: Settings, onClick: () => go("/settings") }}
      />
    );
  }
  return (
    <EmptyState
      compact={compact}
      illustration="quiet-pulse"
      title={t("inbox.emptyTitle")}
      body={t("inbox.emptyBody")}
      action={{
        label: t("inbox.emptyAction"),
        icon: user ? House : BellOff,
        onClick: () => go(user ? ROLE_HOME[user.role] : "/login"),
      }}
    />
  );
}
