import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { qk } from "../keys";
import { decideSwap, listSwaps } from "../services/swaps";
import type { SwapDecisionIn, SwapListQuery } from "../types";

export function useSwaps(q: SwapListQuery = {}) {
  return useQuery({ queryKey: qk.swaps.list(q), queryFn: () => listSwaps(q), placeholderData: keepPreviousData });
}

export function useDecideSwap() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: SwapDecisionIn }) => decideSwap(id, body),
    onSettled: () => client.invalidateQueries({ queryKey: qk.swaps.all }),
  });
}
