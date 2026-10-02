import type { RecommendationItem } from "../../../api/types";

/** Most pressing first: still actionable, then urgent, then earliest deadline. */
export function pickNextAction(items: RecommendationItem[]): RecommendationItem | undefined {
  const live = items.filter((i) => i.status === "open" || i.status === "requested");
  const pool = live.length ? live : items;
  return [...pool].sort(
    (a, b) =>
      Number(b.rationale.urgent) - Number(a.rationale.urgent) ||
      new Date(a.deadline_at).getTime() - new Date(b.deadline_at).getTime(),
  )[0];
}
