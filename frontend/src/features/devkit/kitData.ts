// Deterministic sample data for /dev/kit only. Shapes match the API (BalancePoint, Reason).
import { createContext } from "react";

import type { Reason } from "../../api/types";
import type { RunwayEvent, RunwayPoint } from "../../components/signature/RunwayStrip";

export const KIT_CAPACITY = 200_000;
/** 12:00 in Dhaka. */
export const KIT_NOW = "2026-10-02T06:00:00Z";

/** Hourly drain with a day/night rhythm. */
function drain(hour: number): number {
  return 2800 * (1 + 0.6 * Math.sin(((hour + 6) / 24) * 2 * Math.PI));
}

export function makeSeries(start: number, hours = 72): RunwayPoint[] {
  const points: RunwayPoint[] = [];
  let expected = start;
  for (let h = 0; h <= hours; h++) {
    if (h > 0) expected = Math.max(0, expected - drain(h));
    points.push({
      hour: h,
      expected,
      low: Math.max(0, expected * 0.82 - h * 180),
      high: Math.min(KIT_CAPACITY * 1.05, expected * 1.12 + h * 260),
    });
  }
  return points;
}

export function stockoutOf(series: RunwayPoint[], confidence: number) {
  const hit = series.find((p) => p.expected <= 0);
  if (!hit) return null;
  const at = new Date(new Date(KIT_NOW).getTime() + hit.hour * 3_600_000).toISOString();
  return { hour: hit.hour, at, confidence };
}

export const KIT_EVENTS: RunwayEvent[] = [
  { kind: "hat", startHour: 3, endHour: 9 },
  { kind: "salary", startHour: 20, endHour: 34 },
  { kind: "rain", startHour: 40, endHour: 50 },
  { kind: "eid", startHour: 58, endHour: 72 },
];

export const KIT_HOURLY = makeSeries(46_000, 12).map((p) => p.expected);

export const KIT_REASONS: Record<"bn" | "en", Reason[]> = {
  en: [
    { factor: "salary_window", direction: "up", impact: 18_400, share: 0.46, sentence: "Salary week: cash-out runs about 40% above a usual Thursday." },
    { factor: "hat_bazar", direction: "up", impact: 9_200, share: 0.23, sentence: "Hat-bazar day nearby brings more cash-out in the afternoon." },
    { factor: "rain", direction: "down", impact: -4_100, share: 0.11, sentence: "Rain is forecast this evening, which usually keeps visits lower." },
  ],
  bn: [
    { factor: "salary_window", direction: "up", impact: 18_400, share: 0.46, sentence: "বেতনের সপ্তাহ: সাধারণ বৃহস্পতিবারের চেয়ে প্রায় ৪০% বেশি ক্যাশ-আউট।" },
    { factor: "hat_bazar", direction: "up", impact: 9_200, share: 0.23, sentence: "কাছেই হাটবার, তাই বিকেলে ক্যাশ-আউট বেশি।" },
    { factor: "rain", direction: "down", impact: -4_100, share: 0.11, sentence: "সন্ধ্যায় বৃষ্টির পূর্বাভাস, সাধারণত তখন গ্রাহক কম আসে।" },
  ],
};

export interface KitRow {
  id: number;
  code: string;
  name: string;
  district: string;
  level: "green" | "amber" | "red";
  cash: number;
  hours: number | null;
}

export const KIT_ROWS: KitRow[] = [
  { id: 1, code: "AG-0142", name: "Rahim Telecom", district: "Dhaka", level: "red", cash: 12_400, hours: 3.6 },
  { id: 2, code: "AG-0377", name: "Nadia Store", district: "Sylhet", level: "amber", cash: 58_000, hours: 19.5 },
  { id: 3, code: "AG-0021", name: "Karim Pharmacy", district: "Rajshahi", level: "green", cash: 1_45_000, hours: null },
  { id: 4, code: "AG-0590", name: "Mollah Enterprise", district: "Khulna", level: "amber", cash: 41_250, hours: 26 },
  { id: 5, code: "AG-0233", name: "Shapla Mobile", district: "Barishal", level: "green", cash: 96_800, hours: 61 },
];

export type KitView = "single" | "both";
export const KitViewContext = createContext<KitView>("single");
