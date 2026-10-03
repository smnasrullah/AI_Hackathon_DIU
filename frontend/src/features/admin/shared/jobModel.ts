// Job step strings from the backend look like "fit:cash_out:q0.1" or "precompute:risk".
const STEPS = ["queued", "start", "generate", "precompute", "load", "fit", "evaluate", "register", "done"] as const;
export type StepKey = (typeof STEPS)[number];

function isStep(v: string): v is StepKey {
  return STEPS.some((s) => s === v);
}

/** Known step label key plus the raw detail after it ("cash_out q0.1"). */
export function stepParts(step: string): { key: StepKey | null; detail: string } {
  const [head = "", ...rest] = step.split(":");
  return isStep(head) ? { key: head, detail: rest.join(" ") } : { key: null, detail: "" };
}

const MODEL_NAMES = ["demand_forecast", "agent_anomaly"] as const;
export type ModelName = (typeof MODEL_NAMES)[number];

/** Registry model names with a translated label; others are shown as stored. */
export function knownModel(name: string): ModelName | null {
  return MODEL_NAMES.find((m) => m === name) ?? null;
}
