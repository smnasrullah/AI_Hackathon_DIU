import type { BalancePoint, ForecastPoint } from "../../../api/types";
import { dhakaParts } from "../../../lib/format";

export interface HourRow {
  /** horizon_h: this row covers hours [hour - 1, hour) after as_of. */
  hour: number;
  ts: string;
  low: number;
  expected: number;
  high: number;
  /** Expected balance at the end of the hour; null when the projection is missing. */
  balance: number | null;
  /** The predicted stockout falls inside this hour. */
  stockout: boolean;
  /** Asia/Dhaka calendar days after the as_of day (0 = same day). */
  day: number;
}

function dhakaDay(iso: string): number {
  const { year, month, day } = dhakaParts(new Date(iso));
  return Date.UTC(year, month, day) / 86_400_000;
}

/** Join hourly demand with the balance projection; mark the stockout hour. */
export function hourlyRows(
  points: ForecastPoint[],
  series: BalancePoint[] | undefined,
  hoursToStockout: number | null,
  asOf: string,
): HourRow[] {
  const balanceAt = new Map((series ?? []).map((p) => [p.hour, p.expected]));
  const today = dhakaDay(asOf);
  return points.map((p) => ({
    hour: p.horizon_h,
    ts: p.ts,
    low: p.low,
    expected: p.expected,
    high: p.high,
    balance: balanceAt.get(p.horizon_h) ?? null,
    stockout: hoursToStockout !== null && hoursToStockout > p.horizon_h - 1 && hoursToStockout <= p.horizon_h,
    day: dhakaDay(p.ts) - today,
  }));
}
