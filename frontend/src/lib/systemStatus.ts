import { api } from "./api";

export type BootstrapState =
  | "starting"
  | "waiting_for_db"
  | "migrating"
  | "seeding"
  | "training"
  | "precomputing"
  | "finalizing"
  | "ready"
  | "failed";

export interface SystemStatus {
  ready: boolean;
  bootstrap_state: BootstrapState;
  db: boolean;
  migration_current: string | null;
  migration_head: string | null;
  seed: number | null;
  data_version: string | null;
  artifacts_ok: boolean;
  model_version: string | null;
  llm_mode: "anthropic" | "openai_compatible" | "replay" | "template";
  generated_at: string;
}

export const systemStatusKey = ["system", "status"] as const;

export async function fetchSystemStatus(): Promise<SystemStatus> {
  const res = await api.get<SystemStatus>("/system/status");
  return res.data;
}
