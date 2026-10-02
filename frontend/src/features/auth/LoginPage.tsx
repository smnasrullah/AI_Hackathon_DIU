import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, Navigate } from "react-router-dom";

import { PulseLine } from "../../components/signature/PulseLine";
import { useAuthStore } from "./authStore";
import { LoginForm } from "./LoginForm";
import { LoginPanel } from "./LoginPanel";
import { ROLE_HOME } from "./types";

/** /login: split layout (animated vessel left, form right); the form stacks alone on phones. */
export function LoginPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  if (user) return <Navigate to={ROLE_HOME[user.role]} replace />;

  return (
    <div className="grid gap-8 py-4 lg:min-h-[calc(100vh-10rem)] lg:grid-cols-2 lg:py-6">
      <LoginPanel />
      <div className="flex flex-col justify-center">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-4 w-24 lg:hidden" aria-hidden>
            <PulseLine className="h-8" />
          </div>
          <LoginForm />
          <Link to="/" className="mt-4 inline-flex min-h-11 items-center gap-2 text-small font-semibold text-muted hover:text-fg">
            <ArrowLeft aria-hidden className="size-4" />
            {t("login.back")}
          </Link>
        </div>
      </div>
    </div>
  );
}
