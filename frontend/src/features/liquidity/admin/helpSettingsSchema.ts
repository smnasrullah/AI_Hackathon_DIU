// Validation for the admin help settings. Bounds mirror the server schemas (help settings and help trigger).
import { z } from "zod";

export interface SettingsMessages {
  number: string;
  range: (min: number, max: number) => string;
}

function whole(m: SettingsMessages, min: number, max: number) {
  return z.number({ error: m.number }).int(m.number).min(min, m.range(min, max)).max(max, m.range(min, max));
}

function decimal(m: SettingsMessages, min: number, max: number) {
  return z.number({ error: m.number }).min(min, m.range(min, max)).max(max, m.range(min, max));
}

export function policySchema(m: SettingsMessages) {
  return z.object({
    enabled: z.boolean(),
    dry_run: z.boolean(),
    claim_timeout_min: whole(m, 1, 1440),
    cooldown_min: whole(m, 0, 1440),
    daily_cap_per_agent: whole(m, 1, 100),
    max_recipients_per_wave: whole(m, 1, 50),
    late_confirm_grace_h: whole(m, 0, 168),
  });
}

export function triggerSchema(m: SettingsMessages) {
  return z.object({
    horizon_h: whole(m, 1, 72),
    buffer_pct: decimal(m, 0, 100),
    min_shortfall_bdt: decimal(m, 0, 1_000_000),
    max_request_bdt: decimal(m, 500, 10_000_000),
    lead_margin_h: decimal(m, 0, 72),
    radius_km: decimal(m, 0.1, 50),
    wave_timeout_min: whole(m, 1, 1440),
    max_waves: whole(m, 1, 10),
    recent_ask_h: decimal(m, 0, 168),
    deadline_floor_min: whole(m, 1, 240),
    urgent_wave_multiplier: decimal(m, 1, 5),
    max_new_per_tick: whole(m, 1, 100),
  });
}

export type PolicyForm = z.infer<ReturnType<typeof policySchema>>;
export type TriggerForm = z.infer<ReturnType<typeof triggerSchema>>;
