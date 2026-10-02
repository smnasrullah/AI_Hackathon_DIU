import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { qk } from "../keys";
import { decideSwap, listSwaps, respondSwap } from "../services/swaps";
import type { SwapDecisionIn, SwapListQuery, SwapRespondIn } from "../types";

export function useSwaps(q: SwapListQuery = {}) {
  return useQuery({ queryKey: qk.swaps.list(q), queryFn: () => listSwaps(q), placeholderData: keepPreviousData });
}

export function useDecideSwap() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: SwapDecisionIn }) => decideSwap(id, body),
    // The map draws swap arrows by status, so it refreshes too.
    onSettled: () =>
      Promise.all([client.invalidateQueries({ queryKey: qk.swaps.all }), client.invalidateQueries({ queryKey: qk.map.all })]),
  });
}

export function useRespondSwap() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: SwapRespondIn }) => respondSwap(id, body),
    onSettled: () => client.invalidateQueries({ queryKey: qk.swaps.all }),
  });
}
