import { useQuery } from "@tanstack/react-query";

import { fetchSystemStatus, systemStatusKey } from "../../lib/systemStatus";
import { qk } from "../keys";
import { getFairness, getFreshness, getImpactComparison, getImpactSummary, getLlmStatus, getModelCard } from "../services/system";
import type { GroupBy, ImpactComparisonQuery, ImpactQuery, Lang } from "../types";

export function useFreshness() {
  return useQuery({ queryKey: qk.system.freshness, queryFn: getFreshness, refetchInterval: 60_000 });
}

export function useLlmStatus() {
  return useQuery({ queryKey: qk.system.llm, queryFn: getLlmStatus });
}

export function useImpactSummary(q: ImpactQuery = {}) {
  return useQuery({ queryKey: qk.impact(q), queryFn: () => getImpactSummary(q) });
}

export function useImpactComparison(q: ImpactComparisonQuery = {}) {
  return useQuery({ queryKey: qk.impactComparison(q), queryFn: () => getImpactComparison(q) });
}

export function useFairness(groupBy: GroupBy) {
  return useQuery({ queryKey: qk.fairness(groupBy), queryFn: () => getFairness(groupBy), staleTime: 5 * 60_000 });
}

export function useModelCard(lang: Lang) {
  return useQuery({ queryKey: qk.modelCard(lang), queryFn: () => getModelCard(lang), staleTime: 5 * 60_000 });
}

export function useSystemStatus() {
  return useQuery({ queryKey: systemStatusKey, queryFn: fetchSystemStatus });
}
