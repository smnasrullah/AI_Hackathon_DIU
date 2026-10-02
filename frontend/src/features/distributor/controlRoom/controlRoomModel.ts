// Pure list logic for the control room: filter, order and count what GET /map/agents returned.
// Nothing is computed beyond counting and sorting; risk levels come from the backend.
import type { MapAgent, MapSwap, RiskLevel } from "../../../api/types";
import type { FloatFilter } from "./controlRoomStore";

export const SEVERITY: Record<RiskLevel, number> = { green: 0, amber: 1, red: 2 };

export interface AgentFilters {
  levels: readonly RiskLevel[];
  query: string;
  district: string | null;
  float: FloatFilter;
}

function matches(a: MapAgent, needle: string): boolean {
  if (!needle) return true;
  return [a.name, a.code, a.district, a.upazila ?? ""].some((v) => v.toLocaleLowerCase().includes(needle));
}

/** Riskiest first: level, then probability, then code. */
export function sortByRisk(agents: readonly MapAgent[]): MapAgent[] {
  return [...agents].sort(
    (a, b) => SEVERITY[b.level] - SEVERITY[a.level] || b.probability - a.probability || a.code.localeCompare(b.code),
  );
}

export function filterAgents(agents: readonly MapAgent[], f: AgentFilters): MapAgent[] {
  const needle = f.query.trim().toLocaleLowerCase();
  return sortByRisk(
    agents.filter(
      (a) =>
        f.levels.includes(a.level) &&
        (f.district === null || a.district === f.district) &&
        (f.float === "all" || a.worst_float === f.float) &&
        matches(a, needle),
    ),
  );
}

export function levelCounts(agents: readonly MapAgent[]): Record<RiskLevel, number> {
  const out: Record<RiskLevel, number> = { green: 0, amber: 0, red: 0 };
  for (const a of agents) out[a.level] += 1;
  return out;
}

export function districtsOf(agents: readonly MapAgent[]): string[] {
  return [...new Set(agents.map((a) => a.district))].sort((a, b) => a.localeCompare(b));
}

export function swapsOf(swaps: readonly MapSwap[], agentId: number): MapSwap[] {
  return swaps.filter((s) => s.donor_agent_id === agentId || s.receiver_agent_id === agentId);
}

/** Swaps whose both ends are still visible after filtering. */
export function visibleSwaps(swaps: readonly MapSwap[], agents: readonly MapAgent[]): MapSwap[] {
  const ids = new Set(agents.map((a) => a.agent_id));
  return swaps.filter((s) => ids.has(s.donor_agent_id) && ids.has(s.receiver_agent_id));
}
