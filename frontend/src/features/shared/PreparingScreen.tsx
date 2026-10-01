import { CircleAlert, CircleCheck, Circle, LoaderCircle } from "lucide-react";

import type { BootstrapState } from "../../lib/systemStatus";

const STEPS: ReadonlyArray<{ state: BootstrapState; label: string }> = [
  { state: "waiting_for_db", label: "Starting the database" },
  { state: "migrating", label: "Updating the database schema" },
  { state: "seeding", label: "Generating synthetic demo data" },
  { state: "training", label: "Checking forecast models" },
  { state: "precomputing", label: "Preparing forecasts for every agent" },
  { state: "finalizing", label: "Final checks" },
];

function stepIndex(state: BootstrapState): number {
  if (state === "ready") return STEPS.length;
  return STEPS.findIndex((s) => s.state === state);
}

export function PreparingScreen({ state }: { state: BootstrapState }) {
  const failed = state === "failed";
  const current = stepIndex(state);

  return (
    <main className="grid min-h-screen place-items-center bg-bg px-6 text-fg">
      <section
        className="w-full max-w-md rounded-[var(--radius-card)] border border-line bg-surface p-8 shadow-[0_8px_30px_rgba(10,15,31,0.08)]"
        aria-live="polite"
      >
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted">AgentPulse AI</p>
        <h1 className="mt-2 flex items-center gap-2 font-display text-3xl font-bold">
          {failed && <CircleAlert aria-hidden className="size-7 text-risk-red" />}
          {failed ? "Setup stopped" : "Preparing demo data…"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {failed
            ? "Something went wrong while preparing the demo. Run: docker compose logs backend"
            : "First start takes a minute. This page opens the app by itself when everything is ready."}
        </p>

        <ol className="mt-6 space-y-3">
          {STEPS.map((step, i) => {
            const done = !failed && current > i;
            const active = !failed && current === i;
            const Icon = done ? CircleCheck : active ? LoaderCircle : Circle;
            const tone = done ? "text-risk-green" : active ? "animate-spin text-pulse" : "text-muted";
            return (
              <li key={step.state} className="flex items-center gap-3 text-sm">
                <Icon aria-hidden className={`size-5 shrink-0 ${tone}`} />
                <span className={active ? "font-semibold" : done ? "" : "text-muted"}>
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>

        <p className="mt-8 border-t border-line pt-4 text-xs text-muted">
          Synthetic data only · Advisory only — a human approves
        </p>
      </section>
    </main>
  );
}
