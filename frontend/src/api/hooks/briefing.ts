import { useQuery } from "@tanstack/react-query";

import { qk } from "../keys";
import { getAnomalyNarrative, getDistributorBriefing } from "../services/briefing";
import type { Lang } from "../types";

export function useDistributorBriefing(lang: Lang) {
  return useQuery({ queryKey: qk.briefing(lang), queryFn: () => getDistributorBriefing(lang), staleTime: 10 * 60_000, retry: false });
}

export function useAnomalyNarrative(id: number | null, lang: Lang) {
  return useQuery({
    queryKey: qk.anomalyNarrative(id ?? 0, lang),
    queryFn: () => getAnomalyNarrative(id ?? 0, lang),
    enabled: id !== null,
    staleTime: 10 * 60_000,
    retry: false,
  });
}
