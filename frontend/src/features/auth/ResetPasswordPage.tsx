import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, LinkIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { z } from "zod";

import { LiquidButton } from "../../components/ui/LiquidButton";
import { resetPassword } from "./authApi";
import { AuthCard, FormAlert, OutcomePanel } from "./AuthCard";
import { classifyFormError, type FormFailure } from "./formFailure";
import { PasswordField } from "./PasswordField";
import { PASSWORD_MIN } from "./passwordStrength";

const schema = z
  .object({ password: z.string().min(PASSWORD_MIN, "passwordShort").max(128), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "mismatch" });
type ResetValues = z.infer<typeof schema>;

/** The token travels in the URL fragment (#token=...), so it never reaches a server log. */
function tokenFromHash(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, "")).get("token");
  return token && token.length >= 16 ? token : null;
}

/** /reset-password#token=...: set a new password with a single-use link. */
export function ResetPasswordPage() {
  const { t } = useTranslation();
  const { hash } = useLocation();
  const [token] = useState(() => tokenFromHash(hash));
  const [failure, setFailure] = useState<FormFailure | null>(null);
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetValues>({ resolver: zodResolver(schema), mode: "onTouched", defaultValues: { password: "", confirm: "" } });

  const onSubmit = handleSubmit(async (v) => {
    if (!token) return;
    setFailure(null);
    try {
      await resetPassword(token, v.password);
      setDone(true);
      // Drop the spent token from the address bar and history entry.
      window.history.replaceState(window.history.state, "", window.location.pathname);
    } catch (err) {
      setFailure(classifyFormError(err));
    }
  });

  const fieldError = (msg: string | undefined) => (msg === "passwordShort" || msg === "mismatch" ? t(`signup.err.${msg}`) : undefined);
  const serverMessage =
    failure === null ? null : failure.kind === "refused" ? t("reset.err.invalid") : t(failure.kind === "limited" ? "reset.err.limited" : "reset.err.network");

  return (
    <AuthCard eyebrow={t("reset.eyebrow")} title={t("reset.title")} subtitle={token && !done ? t("reset.subtitle") : undefined} testId="reset-page">
      {!token ? (
        <OutcomePanel icon={LinkIcon} title={t("reset.missingTitle")} body={t("reset.missingBody")}>
          <Link to="/forgot-password" className="mt-4 inline-flex min-h-11 items-center font-semibold text-pulse-fg underline-offset-4 hover:underline">
            {t("reset.requestNew")}
          </Link>
        </OutcomePanel>
      ) : done ? (
        <OutcomePanel title={t("reset.doneTitle")} body={t("reset.doneBody")} testId="reset-done">
          <Link to="/login" className="mt-4 inline-flex min-h-11 items-center font-semibold text-pulse-fg underline-offset-4 hover:underline">
            {t("reset.signIn")}
          </Link>
        </OutcomePanel>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={(e) => void onSubmit(e)} noValidate>
          <PasswordField id="password" autoComplete="new-password" label={t("reset.password")} error={fieldError(errors.password?.message)} {...register("password")} />
          <PasswordField id="confirm" autoComplete="new-password" label={t("reset.confirm")} error={fieldError(errors.confirm?.message)} {...register("confirm")} />
          <FormAlert message={serverMessage} />
          {failure?.kind === "refused" ? (
            <Link to="/forgot-password" className="inline-flex min-h-11 items-center font-semibold text-pulse-fg underline-offset-4 hover:underline">
              {t("reset.requestNew")}
            </Link>
          ) : null}
          <LiquidButton type="submit" size="lg" icon={KeyRound} loading={isSubmitting} data-testid="reset-submit" className="w-full">
            {isSubmitting ? t("reset.submitting") : t("reset.submit")}
          </LiquidButton>
        </form>
      )}
    </AuthCard>
  );
}
