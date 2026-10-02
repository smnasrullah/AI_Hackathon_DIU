import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { qk } from "../keys";
import { getAnomaly, listAnomalies, reviewAnomaly } from "../services/anomalies";
import type { AnomalyListQuery, AnomalyReviewIn } from "../types";

export function useAnomalies(q: AnomalyListQuery = {}) {
  return useQuery({ queryKey: qk.anomalies.list(q), queryFn: () => listAnomalies(q), placeholderData: keepPreviousData });
}

export function useAnomaly(id: number | null) {
  return useQuery({ queryKey: qk.anomalies.detail(id ?? 0), queryFn: () => getAnomaly(id ?? 0), enabled: id !== null });
}

export function useReviewAnomaly() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: AnomalyReviewIn }) => reviewAnomaly(id, body),
    onSettled: () => client.invalidateQueries({ queryKey: qk.anomalies.all }),
  });
}
