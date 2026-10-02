import { Eye, ShieldCheck, Siren, type LucideIcon } from "lucide-react";

import type { RiskLevel } from "../../api/types";

/** Colour + icon + word for every risk level (DESIGN.md §1: never colour alone). */
export const RISK_STYLE: Record<RiskLevel, { icon: LucideIcon; fg: string; bg: string; ring: string; stroke: string }> = {
  green: { icon: ShieldCheck, fg: "text-safe-fg", bg: "bg-safe/12", ring: "ring-safe/35", stroke: "var(--risk-safe)" },
  amber: { icon: Eye, fg: "text-watch-fg", bg: "bg-watch/15", ring: "ring-watch/40", stroke: "var(--risk-watch)" },
  red: { icon: Siren, fg: "text-act-fg", bg: "bg-act/12", ring: "ring-act/40", stroke: "var(--risk-act)" },
};
