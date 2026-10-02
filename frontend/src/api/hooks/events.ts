import { useQuery } from "@tanstack/react-query";

import { qk } from "../keys";
import { listEvents } from "../services/events";
import type { EventListQuery } from "../types";

export function useEvents(q: EventListQuery, enabled = true) {
  return useQuery({ queryKey: qk.events(q), queryFn: () => listEvents(q), enabled, staleTime: 5 * 60_000 });
}
