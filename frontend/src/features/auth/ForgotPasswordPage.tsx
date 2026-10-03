import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { MailCheck, Send } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, Navigate } from "react-router-dom";
import { z } from "zod";

import { LiquidButton } from "../../components/ui/LiquidButton";
import { fetchSystemStatus, systemStatusKey } from "../../lib/systemStatus";
import { forgotPassword } from "./authApi";
import { AuthCard, FormAlert, OutcomePanel } from "./AuthCard";
import { useAuthStore } from "./authStore";
import { FloatingField } from "./FloatingField";
import { classifyFormError, type FormFailure } from "./formFailure";
import { ROLE_HOME } from "./types";

const schema = z.object({ email: z.string().trim().min(1, "emailRequired").email("emailInvalid") });
type ForgotValues = z.infer<typeof schema>;

/** /forgot-password: always the same "check your email" answer, account or not. */
export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const devMailer = useQuery({ queryKey: systemStatusKey, queryFn: fetchSystemStatus }).data?.dev_mailer ?? false;
  const [failure, setFailure] = useState<FormFailure | null>(null);
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotValues>({ resolver: zodResolver(schema), mode: "onTouched", defaultValues: { email: "" } });

  if (user) return <Navigate to={ROLE_HOME[user.role]} replace />;

  const onSubmit = handleSubmit(async (v) => {
    setFailure(null);
    try {
      await forgotPassword(v.email.trim());
      setSent(true);
    } catch (err) {
      setFailure(classifyFormError(err));
    }
  });

  const emailError = errors.email?.message === "emailInvalid" ? t("signup.err.emailInvalid") : errors.email ? t("signup.err.emailRequired") : undefined;
  const serverMessage = failure === null ? null : t(failure.kind === "limited" ? "forgot.err.limited" : "forgot.err.network");

  return (
    <AuthCard eyebrow={t("forgot.eyebrow")} title={t("forgot.title")} subtitle={sent ? undefined : t("forgot.subtitle")} testId="forgot-page">
      {sent ? (
        <OutcomePanel icon={MailCheck} title={t("forgot.sentTitle")} body={t("forgot.sentBody")} testId="forgot-sent">
          {devMailer ? <p className="mt-2 text-xs text-muted">{t("forgot.devNote")}</p> : null}
        </OutcomePanel>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={(e) => void onSubmit(e)} noValidate>
          <FloatingField id="email" type="email" inputMode="email" autoComplete="email" label={t("forgot.email")} error={emailError} {...register("email")} />
          <FormAlert message={serverMessage} />
          <LiquidButton type="submit" size="lg" icon={Send} loading={isSubmitting} data-testid="forgot-submit" className="w-full">
            {isSubmitting ? t("forgot.submitting") : t("forgot.submit")}
          </LiquidButton>
        </form>
      )}
      <Link to="/login" className="mt-4 inline-flex min-h-11 items-center font-semibold text-pulse-fg underline-offset-4 hover:underline">
        {t("forgot.back")}
      </Link>
    </AuthCard>
  );
}
