import { useAuthStore } from "../auth/authStore";
import { ChangePasswordForm } from "./ChangePasswordForm";

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <section className="mx-auto max-w-md space-y-6">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted">Account</p>
        <h1 className="mt-1 font-display text-3xl font-bold">Settings</h1>
        {user ? (
          <p className="mt-2 text-sm text-muted">
            Signed in as {user.full_name} ({user.role})
          </p>
        ) : null}
      </header>
      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
        <ChangePasswordForm />
      </div>
    </section>
  );
}
