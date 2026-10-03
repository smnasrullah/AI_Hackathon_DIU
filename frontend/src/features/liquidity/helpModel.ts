// Pure rules for the help request screens: what to show, in which order, and what needs attention.
// No text here: the components translate. The server decides every state; this only reads it.
import type { FloatType, HelpRequestItem, HelpResponse, HelpStatus } from "../../api/types";

export type Step = "sent" | "accepted" | "received";
export type StepState = "done" | "current" | "todo";

const TIMELINE: Record<HelpStatus, [StepState, StepState, StepState]> = {
  open: ["done", "current", "todo"],
  claimed: ["done", "done", "current"],
  fulfilled: ["done", "done", "done"],
  expired: ["done", "todo", "todo"],
  cancelled: ["done", "todo", "todo"],
};

/** Three steps in order. The request ended early (expired, cancelled) stops after "sent". */
export function timelineStates(status: HelpStatus): Record<Step, StepState> {
  const [sent, accepted, received] = TIMELINE[status];
  return { sent, accepted, received };
}

export type Attention = "lastWave" | "expired";

/**
 * Needs a human: it ran out of time unfilled, or it is still open on the last wave. The server says
 * which wave is the last (`is_last_wave`, distributors and admins only); `lastWave` is a fallback.
 */
export function attentionFor(item: Pick<HelpRequestItem, "status" | "wave_number" | "is_last_wave">, lastWave: number | null = null): Attention | null {
  if (item.status === "expired") return "expired";
  if (item.status !== "open") return null;
  if (item.is_last_wave === true) return "lastWave";
  if (lastWave !== null && typeof item.wave_number === "number" && item.wave_number >= lastWave) return "lastWave";
  return null;
}

export function hoursUntil(deadlineIso: string, now: Date): number {
  return (Date.parse(deadlineIso) - now.getTime()) / 3_600_000;
}

/** Whether the caller still has to answer (first ask, or no answer yet). */
export function awaitingMyAnswer(item: Pick<HelpRequestItem, "my_response">): boolean {
  return item.my_response === null || item.my_response === undefined || item.my_response === "none";
}

/**
 * What a helper sees on their card: an open request they have not answered, or the one they claimed
 * and have not yet withdrawn from. Declined or taken-by-someone-else requests drop off.
 */
export function helpNeededFor(items: readonly HelpRequestItem[]): HelpRequestItem[] {
  return items.filter((item) => (item.status === "open" && awaitingMyAnswer(item)) || (item.claimed_by_me && item.status === "claimed"));
}

/** Requests the requester can still act on (not yet fulfilled, expired or cancelled). */
export function isActive(status: HelpStatus): boolean {
  return status === "open" || status === "claimed";
}

/** How many people were asked. Names are never shown to the requester. */
export function askedCount(item: Pick<HelpRequestItem, "recipients">): number {
  return item.recipients?.length ?? 0;
}

export type ResponseKey = HelpResponse;

export interface HelpMapPoint {
  id: number;
  name: string;
  amount: number;
  floatType: FloatType;
  urgent: boolean;
  lng: number;
  lat: number;
}

/** Open requests placed on the map at their requester's shop. Requests whose shop is not on the map are left out. */
export function helpMapPoints(items: readonly HelpRequestItem[], agents: readonly { agent_id: number; lng: number; lat: number }[]): HelpMapPoint[] {
  const at = new Map(agents.map((a) => [a.agent_id, a] as const));
  const points: HelpMapPoint[] = [];
  for (const item of items) {
    if (item.status !== "open") continue;
    const shop = at.get(item.requester.agent_id);
    if (!shop) continue;
    points.push({ id: item.id, name: item.requester.name, amount: item.amount_needed, floatType: item.float_type, urgent: item.urgent, lng: shop.lng, lat: shop.lat });
  }
  return points;
}
