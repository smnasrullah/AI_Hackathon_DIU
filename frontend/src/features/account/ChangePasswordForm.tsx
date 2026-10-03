import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { CircleAlert, CircleCheck, KeyRound } from "lucide-react";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { changePassword } from "../auth/authApi";
import { passwordStrength } from "./passwordStrength";

const MIN = 8;

const schema = z
  .object({
    oldPassword: z.string().min(1, "Enter your current password"),
    newPassword: z.string().min(MIN, `Use at least ${MIN} characters`).max(128),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { path: ["confirm"], message: "Passwords do not match" })
  .refine((v) => v.newPassword !== v.oldPassword, {
    path: ["newPassword"],
    message: "Choose a password different from the current one",
  });
type Form = z.infer<typeof schema>;

function errorMessage(err: unknown): string {
  const detail = axios.isAxiosError(err) ? (err.response?.data as { detail?: unknown } | undefined)?.detail : undefined;
  if (detail === "wrong_password") return "Current password is incorrect.";
  if (detail === "same_password") return "Choose a password different from the current one.";
  return "Could not change the password. Try again.";
}

const fieldClass =
  "mt-1 block min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base text-fg aria-[invalid=true]:border-risk-red";

const FIELDS = [
  { name: "oldPassword", label: "Current password", autoComplete: "current-password" },
  { name: "newPassword", label: "New password", autoComplete: "new-password" },
  { name: "confirm", label: "Confirm new password", autoComplete: "new-password" },
] as const;

export function ChangePasswordForm() {
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { oldPassword: "", newPassword: "", confirm: "" } });
  const strength = passwordStrength(useWatch({ control, name: "newPassword" }));

  const onSubmit = handleSubmit(async (values) => {
    setResult(null);
    try {
      const revoked = await changePassword(values.oldPassword, values.newPassword);
      reset();
      const others = revoked === 1 ? "1 other session was" : `${revoked} other sessions were`;
      setResult({ ok: true, text: `Password changed. ${others} signed out.` });
    } catch (err) {
      setResult({ ok: false, text: errorMessage(err) });
    }
  });

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate aria-labelledby="change-password-title">
      <h2 id="change-password-title" className="flex items-center gap-2 font-display text-xl font-bold">
        <KeyRound className="size-5" aria-hidden />
        Change password
      </h2>
      {FIELDS.map((field) => {
        const error = errors[field.name];
        return (
          <div key={field.name}>
            <label htmlFor={field.name} className="text-sm font-semibold">
              {field.label}
            </label>
            <input
              id={field.name}
              type="password"
              autoComplete={field.autoComplete}
              className={fieldClass}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${field.name}-error` : field.name === "newPassword" ? "strength" : undefined}
              {...register(field.name)}
            />
            {field.name === "newPassword" && !error ? (
              <p id="strength" className="mt-1 text-xs text-muted">
                Strength: {strength}. At least {MIN} characters; mix words, numbers and symbols.
              </p>
            ) : null}
            {error ? (
              <p id={`${field.name}-error`} className="mt-1 text-sm text-risk-red">
                {error.message}
              </p>
            ) : null}
          </div>
        );
      })}
      {result ? (
        <p role={result.ok ? "status" : "alert"} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm">
          {result.ok ? (
            <CircleCheck className="size-4 shrink-0 text-risk-green" aria-hidden />
          ) : (
            <CircleAlert className="size-4 shrink-0 text-risk-red" aria-hidden />
          )}
          {result.text}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isSubmitting}
        className="ap-press min-h-11 rounded-full bg-brand px-5 font-semibold text-[var(--ink-950)] disabled:opacity-60"
      >
        {isSubmitting ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
