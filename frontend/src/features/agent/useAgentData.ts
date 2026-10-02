import { useEvents } from "../../api/hooks/events";
import type { AgentSummary } from "../../api/types";
import type { RunwayEvent } from "../../components/signature/RunwayStrip";
import { useLocale } from "../../lib/prefs";
import { useAuthStore } from "../auth/authStore";
import { eventRibbons, runwayWindow } from "./runwayModel";

/** The signed-in agent's own id; the server scopes every agent endpoint to it as well. */
export function useMyAgentId(): number | null {
  return useAuthStore((s) => s.user?.agent_id ?? null);
}

/** Events over the agent's runway (own district + nationwide). Ribbons are decoration: none on error. */
export function useRunwayEvents(summary: Pick<AgentSummary, "as_of" | "agent"> | undefined): RunwayEvent[] {
  const { lang } = useLocale();
  const span = summary ? runwayWindow(summary.as_of) : {};
  const q = useEvents({ ...span, district: summary?.agent.district, page_size: 50 }, summary !== undefined);
  return q.data && summary ? eventRibbons(q.data.items, summary.as_of, lang) : [];
}
