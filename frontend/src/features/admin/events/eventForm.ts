// Event form <-> API conversion. Times are entered in Dhaka time (UTC+6, no DST).
import { z } from "zod";

import type { EventIn, EventItem, EventType } from "../../../api/types";

export const EVENT_TYPES: EventType[] = ["salary", "eid", "hat_bazar", "weather", "holiday"];
const DHAKA_MS = 6 * 3600_000;
const MAX_SPAN_MS = 60 * 24 * 3600_000;

/** ISO instant -> "YYYY-MM-DDTHH:mm" in Dhaka time (for <input type="datetime-local">). */
export function toDhakaInput(iso: string): string {
  return new Date(new Date(iso).getTime() + DHAKA_MS).toISOString().slice(0, 16);
}

/** "YYYY-MM-DDTHH:mm" in Dhaka time -> ISO with the +06:00 offset. */
export function fromDhakaInput(local: string): string {
  return `${local}:00+06:00`;
}

function ms(local: string): number {
  return Date.parse(fromDhakaInput(local));
}

export interface EventMessages {
  required: string;
  endAfterStart: string;
  maxSpan: string;
  intensity: string;
}

export function eventSchema(m: EventMessages) {
  return z
    .object({
      type: z.enum(["salary", "eid", "hat_bazar", "weather", "holiday"]),
      name_en: z.string().trim().min(1, m.required).max(120),
      name_bn: z.string().trim().min(1, m.required).max(120),
      starts_at: z.string().min(1, m.required),
      ends_at: z.string().min(1, m.required),
      district: z.string().trim().max(80),
      intensity: z.number({ error: m.intensity }).gt(0, m.intensity).lte(10, m.intensity),
    })
    .refine((v) => !v.starts_at || !v.ends_at || ms(v.ends_at) > ms(v.starts_at), { path: ["ends_at"], message: m.endAfterStart })
    .refine((v) => !v.starts_at || !v.ends_at || ms(v.ends_at) - ms(v.starts_at) <= MAX_SPAN_MS, { path: ["ends_at"], message: m.maxSpan });
}

export type EventForm = z.infer<ReturnType<typeof eventSchema>>;

export function formFromEvent(e: EventItem | null): EventForm {
  if (!e) return { type: "salary", name_en: "", name_bn: "", starts_at: "", ends_at: "", district: "", intensity: 1.5 };
  return {
    type: e.type,
    name_en: e.name_en,
    name_bn: e.name_bn,
    starts_at: toDhakaInput(e.starts_at),
    ends_at: toDhakaInput(e.ends_at),
    district: e.district ?? "",
    intensity: e.intensity,
  };
}

export function eventFromForm(f: EventForm): EventIn {
  return {
    type: f.type,
    name_en: f.name_en.trim(),
    name_bn: f.name_bn.trim(),
    starts_at: fromDhakaInput(f.starts_at),
    ends_at: fromDhakaInput(f.ends_at),
    district: f.district.trim() || null,
    intensity: f.intensity,
  };
}
