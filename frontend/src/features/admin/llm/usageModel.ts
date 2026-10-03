import type { LlmUsage } from "../../../api/types";

export type Series = "live" | "cache" | "replay" | "template";
export const SERIES: Series[] = ["live", "cache", "replay", "template"];

export interface DayBar {
  day: string;
  total: number;
  parts: Record<Series, number>;
}

/** Disjoint parts per day: cache hits, replay, template, and the rest (LLM wording from a live call). */
export function dayBars(u: LlmUsage): DayBar[] {
  return u.days.map((d) => {
    const live = Math.max(0, d.calls - d.cache_hits - d.replay - d.template);
    return { day: d.day, total: d.calls, parts: { live, cache: d.cache_hits, replay: d.replay, template: d.template } };
  });
}

/** 0..1 share of the daily cap used (over 1 when the cap was passed). */
export function capShare(u: LlmUsage): number {
  return u.daily_cap > 0 ? u.calls_today / u.daily_cap : 0;
}
