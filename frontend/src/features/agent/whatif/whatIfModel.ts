import type { WhatIfScenario } from "../../../api/types";

/** Slider step in BDT. */
export const WHATIF_STEP = 500;
/** Wait this long after the last slider move before asking the backend. */
export const WHATIF_DEBOUNCE_MS = 300;

/**
 * Slider range for the change in balance. The backend accepts 0 <= balance + delta <= max(capacity, balance)
 * (422 otherwise); both ends are rounded inwards to the step so 0 stays reachable.
 */
export function sliderBounds(balance: number, capacity: number, step = WHATIF_STEP): { min: number; max: number } {
  const room = Math.max(capacity, balance) - balance;
  return { min: -Math.floor(balance / step) * step, max: Math.max(0, Math.floor(room / step) * step) };
}

export type ResultKind = "lasts" | "nowLasts" | "nowRunsOut" | "later" | "earlier" | "same";

type Stockout = Pick<WhatIfScenario, "hours_to_stockout">;

/** How the stockout moved between the backend's before and after scenarios (no numbers are made here). */
export function resultKind(before: Stockout, after: Stockout): ResultKind {
  const b = before.hours_to_stockout;
  const a = after.hours_to_stockout;
  if (b === null && a === null) return "lasts";
  if (a === null) return "nowLasts";
  if (b === null) return "nowRunsOut";
  if (Math.abs(a - b) < 0.5) return "same";
  return a > b ? "later" : "earlier";
}
