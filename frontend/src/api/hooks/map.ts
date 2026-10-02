import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { qk } from "../keys";
import { getMapAgents } from "../services/map";

/** The control room re-reads the map this often (only while the tab is visible). */
export const MAP_POLL_MS = 45_000;

export function useMapAgents(atHour: number) {
  return useQuery({
    queryKey: qk.map.agents(atHour),
    queryFn: () => getMapAgents(atHour),
    placeholderData: keepPreviousData,
    refetchInterval: MAP_POLL_MS,
    staleTime: 30_000,
  });
}
