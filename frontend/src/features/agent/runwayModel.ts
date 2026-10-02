// Pure mapping from API payloads to what the runway components draw. No numbers are invented here:
// every value comes from the backend; this only reshapes and orders it.
import type { EventItem, EventType, FloatSummary, FloatType, Lang, RiskLevel, WhatIfScenario } from "../../api/types";
import type { RunwayEvent, RunwayEventKind, RunwayPoint } from "../../components/signature/RunwayStrip";

export const RUNWAY_HOURS = 72;
export const FLOATS: readonly FloatType[] = ["cash", "emoney"];
const HOUR_MS = 3_600_000;

const LEVEL_RANK: Record<RiskLevel, number> = { green: 0, amber: 1, red: 2 };
const EVENT_KIND: Record<EventType, RunwayEventKind> = {
  salary: "salary",
  eid: "eid",
  hat_bazar: "hat",
  weather: "rain",
  holiday: "holiday",
};

export interface StockoutFlag {
  hour: number;
  at: string;
  confidence: number;
}

interface StockoutFields {
  stockout_at: string | null;
  hours_to_stockout: number | null;
  confidence: number;
}

/** Flag for the runway: only when the backend predicts a stockout inside the horizon. */
export function stockoutFlag(f: StockoutFields, hours = RUNWAY_HOURS): StockoutFlag | null {
  if (f.stockout_at === null || f.hours_to_stockout === null || f.hours_to_stockout > hours) return null;
  return { hour: Math.max(0, f.hours_to_stockout), at: f.stockout_at, confidence: f.confidence };
}

export function toRunwayPoints(scenario: Pick<WhatIfScenario, "series">): RunwayPoint[] {
  return scenario.series.map(({ hour, low, expected, high }) => ({ hour, low, expected, high }));
}

/** The float to lead with: soonest stockout, else the worse risk level, else cash. */
export function headlineFloat(floats: FloatSummary[]): FloatSummary | undefined {
  return [...floats].sort((a, b) => {
    const ha = a.hours_to_stockout ?? Number.POSITIVE_INFINITY;
    const hb = b.hours_to_stockout ?? Number.POSITIVE_INFINITY;
    if (ha !== hb) return ha - hb;
    if (a.level !== b.level) return LEVEL_RANK[b.level] - LEVEL_RANK[a.level];
    return FLOATS.indexOf(a.float_type) - FLOATS.indexOf(b.float_type);
  })[0];
}

/** [from, to) of the runway, as ISO strings for the events query. */
export function runwayWindow(asOf: string, hours = RUNWAY_HOURS): { from: string; to: string } {
  const start = new Date(asOf).getTime();
  return { from: new Date(start).toISOString(), to: new Date(start + hours * HOUR_MS).toISOString() };
}

/** Events as ribbons in hours from `asOf`, clipped to the runway. */
export function eventRibbons(events: EventItem[], asOf: string, lang: Lang, hours = RUNWAY_HOURS): RunwayEvent[] {
  const start = new Date(asOf).getTime();
  const toHour = (iso: string) => (new Date(iso).getTime() - start) / HOUR_MS;
  return events
    .map((ev) => ({
      kind: EVENT_KIND[ev.type],
      startHour: Math.max(0, toHour(ev.starts_at)),
      endHour: Math.min(hours, toHour(ev.ends_at)),
      name: lang === "bn" ? ev.name_bn : ev.name_en,
    }))
    .filter((ev) => ev.endHour > ev.startHour)
    .sort((a, b) => a.startHour - b.startHour);
}

export function isFloatType(value: string | null): value is FloatType {
  return value === "cash" || value === "emoney";
}
