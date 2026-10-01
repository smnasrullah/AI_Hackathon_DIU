import { ShieldX } from "lucide-react";
import { Link } from "react-router-dom";

import { useAuthStore } from "./authStore";
import { ROLE_HOME } from "./types";

export function ForbiddenPage() {
  const user = useAuthStore((s) => s.user);
  const target = user ? ROLE_HOME[user.role] : "/login";

  return (
    <section className="mx-auto mt-10 max-w-md rounded-[var(--radius-card)] border border-line bg-surface p-8 shadow-sm">
      <div className="flex items-center gap-3 text-risk-red">
        <ShieldX className="size-6" aria-hidden />
        <p className="font-mono text-xs uppercase tracking-[0.18em]">403 · No access</p>
      </div>
      <h1 className="mt-3 font-display text-3xl font-bold">This page is not for your role</h1>
      <p className="mt-3 text-muted">
        {user
          ? `You are signed in as ${user.role}. Each role sees only its own agents and tools.`
          : "Sign in to continue."}
      </p>
      <Link
        to={target}
        className="mt-6 inline-flex min-h-11 items-center rounded-full bg-brand px-5 font-semibold text-[var(--ink-950)]"
      >
        {user ? "Go to my home" : "Sign in"}
      </Link>
    </section>
  );
}
