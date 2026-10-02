import type { AnomalyItem, AnomalyStatus, FloatType, RequestItem, RequestStatus, SwapItem, SwapStatus } from "../../../api/types";

export type ActivityKind = "request" | "swap" | "anomaly";
export type ActivityEvent =
  | `request_${RequestStatus}`
  | "swap_gives"
  | "swap_gets"
  | `swap_${Exclude<SwapStatus, "pending">}`
  | "anomaly_flagged"
  | `anomaly_${Exclude<AnomalyStatus, "open">}`;

export interface ActivityEntry {
  id: string;
  at: string;
  kind: ActivityKind;
  /** i18n leaf under detail.activity. */
  event: ActivityEvent;
  amount: number | null;
  float: FloatType | null;
  partner: string | null;
  note: string | null;
  by: string | null;
  link: string;
}

const MAX = 50;

function fromRequests(items: RequestItem[], agentId: number): ActivityEntry[] {
  return items
    .filter((r) => r.agent.agent_id === agentId)
    .flatMap((r): ActivityEntry[] => {
      const base = { kind: "request" as const, amount: r.amount_bdt, float: r.float_type, partner: null, link: `/distributor/agents/${agentId}?tab=activity` };
      const asked: ActivityEntry = { ...base, id: `r${r.id}`, at: r.created_at, event: "request_requested", note: null, by: r.requested_by };
      if (!r.decided_at || r.status === "requested") return [asked];
      const decided: ActivityEntry = { ...base, id: `r${r.id}d`, at: r.decided_at, event: `request_${r.status}`, note: r.note, by: r.decided_by };
      return [asked, decided];
    });
}

function fromSwaps(items: SwapItem[], agentId: number): ActivityEntry[] {
  return items
    .filter((s) => s.donor.agent_id === agentId || s.receiver.agent_id === agentId)
    .flatMap((s): ActivityEntry[] => {
      const giving = s.donor.agent_id === agentId;
      const base = { kind: "swap" as const, amount: s.amount_bdt, float: s.float_type, partner: (giving ? s.receiver : s.donor).name, by: null, link: "/distributor/swaps" };
      const suggested: ActivityEntry = { ...base, id: `s${s.id}`, at: s.generated_at, event: giving ? "swap_gives" : "swap_gets", note: null };
      if (!s.decided_at || s.status === "pending") return [suggested];
      const decided: ActivityEntry = { ...base, id: `s${s.id}d`, at: s.decided_at, event: `swap_${s.status}`, note: s.note };
      return [suggested, decided];
    });
}

function fromAnomalies(items: AnomalyItem[], agentId: number): ActivityEntry[] {
  return items
    .filter((a) => a.agent.agent_id === agentId)
    .flatMap((a): ActivityEntry[] => {
      const base = { kind: "anomaly" as const, amount: null, float: null, partner: null, by: null, link: `/distributor/anomalies/${a.id}` };
      const flagged: ActivityEntry = { ...base, id: `a${a.id}`, at: a.generated_at, event: "anomaly_flagged", note: null };
      if (!a.reviewed_at || a.status === "open") return [flagged];
      const reviewed: ActivityEntry = { ...base, id: `a${a.id}d`, at: a.reviewed_at, event: `anomaly_${a.status}`, note: a.note };
      return [flagged, reviewed];
    });
}

/** One agent's requests, swaps and anomaly flags with their human decisions, newest first. */
export function agentActivity(agentId: number, requests: RequestItem[], swaps: SwapItem[], anomalies: AnomalyItem[]): ActivityEntry[] {
  return [...fromRequests(requests, agentId), ...fromSwaps(swaps, agentId), ...fromAnomalies(anomalies, agentId)]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, MAX);
}
