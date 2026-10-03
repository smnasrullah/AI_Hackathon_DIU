import { zodResolver } from "@hookform/resolvers/zod";
import { Hourglass, UserPlus } from "lucide-react";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, Navigate } from "react-router-dom";
import { z } from "zod";

import { LiquidButton } from "../../components/ui/LiquidButton";
import { cn } from "../../lib/cn";
import { signup } from "./authApi";
import { AuthCard, FormAlert, OutcomePanel } from "./AuthCard";
import { useAuthStore } from "./authStore";
import { FloatingField } from "./FloatingField";
import { classifyFormError, type FormFailure } from "./formFailure";
import { PasswordField } from "./PasswordField";
import { PASSWORD_MIN, passwordStrength, STRENGTH_STEPS } from "./passwordStrength";
import { ROLE_HOME } from "./types";

const ERR = ["nameRequired", "emailRequired", "emailInvalid", "passwordShort", "mismatch"] as const;
type ErrKey = (typeof ERR)[number];

const schema = z
  .object({
    fullName: z.string().trim().min(1, "nameRequired").max(120),
    email: z.string().trim().min(1, "emailRequired").email("emailInvalid"),
    password: z.string().min(PASSWORD_MIN, "passwordShort").max(128),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "mismatch" });
type SignupValues = z.infer<typeof schema>;

function StrengthMeter({ password }: { password: string }) {
  const { t } = useTranslation();
  if (!password) return <p className="text-xs text-muted">{t("signup.strength.hint")}</p>;
  const level = passwordStrength(password);
  const steps = STRENGTH_STEPS[level];
  const tone = steps <= 1 ? "bg-act" : steps === 2 ? "bg-watch" : "bg-safe";
  return (
    <div data-testid="password-strength" data-level={level}>
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn("h-1 flex-1 rounded-full", i <= steps ? tone : "bg-line")} />
        ))}
      </div>
      <p className="mt-1 text-xs text-muted" aria-live="polite">
        {t("signup.strength.label", { level: t(`signup.strength.${level}`) })} · {t("signup.strength.hint")}
      </p>
    </div>
  );
}

/** /signup: name, email, password (+ confirm). Creates a pending account; no role is sent. */
export function SignupPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [failure, setFailure] = useState<FormFailure | null>(null);
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({ resolver: zodResolver(schema), mode: "onTouched", defaultValues: { fullName: "", email: "", password: "", confirm: "" } });
  const password = useWatch({ control, name: "password" });

  if (user) return <Navigate to={ROLE_HOME[user.role]} replace />;

  const fieldError = (msg: string | undefined) => {
    const key = ERR.find((k: ErrKey) => k === msg);
    return key ? t(`signup.err.${key}`) : undefined;
  };

  const onSubmit = handleSubmit(async (v) => {
    setFailure(null);
    try {
      await signup(v.fullName.trim(), v.email.trim(), v.password);
      setDone(true);
    } catch (err) {
      setFailure(classifyFormError(err));
    }
  });

  const serverMessage =
    failure === null ? null : failure.kind === "refused" ? t("signup.err.rejected") : t(`signup.err.${failure.kind}`);

  return (
    <AuthCard eyebrow={t("signup.eyebrow")} title={t("signup.title")} subtitle={done ? undefined : t("signup.subtitle")} testId="signup-page">
      {done ? (
        <OutcomePanel icon={Hourglass} title={t("signup.pendingTitle")} body={t("signup.pendingBody")} testId="signup-pending">
          <Link to="/login" className="mt-4 inline-flex min-h-11 items-center font-semibold text-pulse-fg underline-offset-4 hover:underline">
            {t("signup.pendingBack")}
          </Link>
        </OutcomePanel>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={(e) => void onSubmit(e)} noValidate>
          <FloatingField id="fullName" autoComplete="name" label={t("signup.fullName")} error={fieldError(errors.fullName?.message)} {...register("fullName")} />
          <FloatingField id="email" type="email" inputMode="email" autoComplete="email" label={t("signup.email")} error={fieldError(errors.email?.message)} {...register("email")} />
          <PasswordField
            id="password"
            autoComplete="new-password"
            label={t("signup.password")}
            error={fieldError(errors.password?.message)}
            hint={<StrengthMeter password={password} />}
            {...register("password")}
          />
          <PasswordField id="confirm" autoComplete="new-password" label={t("signup.confirm")} error={fieldError(errors.confirm?.message)} {...register("confirm")} />
          <FormAlert message={serverMessage} />
          <LiquidButton type="submit" size="lg" icon={UserPlus} loading={isSubmitting} data-testid="signup-submit" className="w-full">
            {isSubmitting ? t("signup.submitting") : t("signup.submit")}
          </LiquidButton>
          <p className="text-small text-muted">
            {t("signup.haveAccount")}{" "}
            <Link to="/login" className="font-semibold text-pulse-fg underline-offset-4 hover:underline">
              {t("signup.signIn")}
            </Link>
          </p>
        </form>
      )}
    </AuthCard>
  );
}
