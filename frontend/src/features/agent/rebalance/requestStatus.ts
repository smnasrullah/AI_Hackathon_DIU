import type { RecommendationItem, RequestItem } from "../../../api/types";

/** Newest request the agent made for this recommendation (the list is newest first, but sort anyway). */
export function requestFor(recommendationId: number, requests: readonly RequestItem[]): RequestItem | undefined {
  return requests
    .filter((r) => r.recommendation_id === recommendationId)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
}

/** The agent may ask while the suggestion is open and nothing is pending (a withdrawn request can be re-sent). */
export function canRequest(item: RecommendationItem, request: RequestItem | undefined): boolean {
  return item.status === "open" && (request === undefined || request.status === "cancelled");
}

/** Live suggestions first (urgent, then earliest deadline), finished ones after. */
export function sortRecommendations(items: readonly RecommendationItem[]): RecommendationItem[] {
  const live = (i: RecommendationItem) => i.status === "open" || i.status === "requested";
  return [...items].sort(
    (a, b) =>
      Number(live(b)) - Number(live(a)) ||
      Number(b.rationale.urgent) - Number(a.rationale.urgent) ||
      Date.parse(a.deadline_at) - Date.parse(b.deadline_at),
  );
}
