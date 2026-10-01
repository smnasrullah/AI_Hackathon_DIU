import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { CircleAlert, Eye, EyeOff, LogIn } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";

import { login } from "./authApi";
import { useAuthStore } from "./authStore";
import { ROLE_HOME, landingPath } from "./types";

const schema = z.object({
  email: z.string().trim().min(1, "Enter your email").email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});
type LoginForm = z.infer<typeof schema>;

const DEMO_ACCOUNTS = [
  { label: "Agent", email: "agent.mirpur@agentpulse.demo" },
  { label: "Distributor", email: "dist.dhaka@agentpulse.demo" },
  { label: "Admin", email: "admin@agentpulse.demo" },
] as const;

function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err) && err.response?.status === 401) {
    return "Email or password is incorrect.";
  }
  return "Can't reach the server right now. Try again.";
}

const fieldClass =
  "mt-1 block min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base text-fg placeholder:text-muted aria-[invalid=true]:border-risk-red";

export function LoginPage() {
  const user = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  if (user) return <Navigate to={ROLE_HOME[user.role]} replace />;

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const tokens = await login(values.email, values.password);
      setSession(tokens);
      navigate(landingPath(tokens.user.role, from), { replace: true });
    } catch (err) {
      setServerError(errorMessage(err));
    }
  });

  return (
    <section className="mx-auto mt-6 max-w-md rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-sm md:p-8">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted">Liquidity runway</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Sign in</h1>

      <div className="mt-5 flex flex-wrap gap-2" aria-label="Demo accounts">
        {DEMO_ACCOUNTS.map((demo) => (
          <button
            key={demo.label}
            type="button"
            onClick={() => {
              setValue("email", demo.email, { shouldValidate: true });
              setFocus("password");
            }}
            className="min-h-11 rounded-full border border-line bg-surface-2 px-4 text-sm font-semibold"
          >
            {demo.label}
          </button>
        ))}
      </div>

      <form className="mt-5 space-y-4" onSubmit={onSubmit} noValidate>
        <div>
          <label htmlFor="email" className="text-sm font-semibold">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            className={fieldClass}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "email-error" : undefined}
            {...register("email")}
          />
          {errors.email ? (
            <p id="email-error" className="mt-1 text-sm text-risk-red">
              {errors.email.message}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="password" className="text-sm font-semibold">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              className={`${fieldClass} pr-12`}
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? "password-error" : undefined}
              {...register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted"
            >
              {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
            </button>
          </div>
          {errors.password ? (
            <p id="password-error" className="mt-1 text-sm text-risk-red">
              {errors.password.message}
            </p>
          ) : null}
        </div>

        {serverError ? (
          <p role="alert" className="flex items-center gap-2 rounded-xl border border-risk-red/40 px-3 py-2 text-sm">
            <CircleAlert className="size-4 shrink-0 text-risk-red" aria-hidden />
            {serverError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-brand font-semibold text-[var(--ink-950)] disabled:opacity-60"
        >
          <LogIn className="size-4" aria-hidden />
          {isSubmitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-4 text-xs text-muted">Demo passwords are set in .env (DEMO_*_PASSWORD; defaults in .env.example).</p>
    </section>
  );
}
