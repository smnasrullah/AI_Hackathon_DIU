import { ArrowLeft, House, LogIn, RotateCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { useAuthStore } from "../auth/authStore";
import { ROLE_HOME } from "../auth/types";
import { StatusPage, type StatusAction } from "./StatusPage";

function useHomeAction(): StatusAction {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  return user
    ? { label: t("status.goHome"), icon: House, to: ROLE_HOME[user.role] }
    : { label: t("status.signIn"), icon: LogIn, to: "/login" };
}

export function ForbiddenPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const home = useHomeAction();
  return (
    <StatusPage
      code="403"
      illustration="quiet-pulse"
      pageTitle={t("page.forbidden")}
      title={t("status.forbiddenTitle")}
      body={user ? t("status.forbiddenBody", { role: t(`role.${user.role}`) }) : t("status.forbiddenSignedOut")}
      actions={[home]}
    />
  );
}

export function NotFoundPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const home = useHomeAction();
  return (
    <StatusPage
      code="404"
      illustration="empty-runway"
      pageTitle={t("page.notFound")}
      title={t("status.notFoundTitle")}
      body={t("status.notFoundBody")}
      actions={[home, { label: t("status.back"), icon: ArrowLeft, variant: "secondary", onClick: () => navigate(-1) }]}
    />
  );
}

/** Also the body of the per-route error boundary: `onRetry` re-renders the failed page. */
export function ServerErrorPage({ onRetry }: { onRetry?: () => void }) {
  const { t } = useTranslation();
  const home = useHomeAction();
  const retry: StatusAction = {
    label: t("status.retry"),
    icon: RotateCw,
    onClick: onRetry ?? (() => window.location.reload()),
  };
  return (
    <StatusPage
      code="500"
      illustration="cracked-vessel"
      pageTitle={t("page.serverError")}
      title={t("status.errorTitle")}
      body={t("status.errorBody")}
      actions={[retry, { ...home, variant: "secondary" }]}
    />
  );
}
