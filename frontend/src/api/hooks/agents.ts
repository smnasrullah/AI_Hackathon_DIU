import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { qk } from "../keys";
import {
  getAgentRisk,
  getAgentSummary,
  getExplanations,
  getForecast,
  getRecommendation,
  getRunway,
  getStockout,
  listRisk,
  postNarrate,
  postWhatIf,
  requestRecommendation,
} from "../services/agents";
import type { ExplanationQuery, FloatType, ForecastQuery, Lang, RiskListQuery, WhatIfIn } from "../types";

export function useAgentSummary(id: number | null) {
  return useQuery({ queryKey: qk.agent.summary(id ?? 0), queryFn: () => getAgentSummary(id ?? 0), enabled: id !== null });
}

export function useForecast(id: number | null, q: ForecastQuery = {}) {
  return useQuery({ queryKey: qk.agent.forecast(id ?? 0, q), queryFn: () => getForecast(id ?? 0, q), enabled: id !== null });
}

export function useStockout(id: number | null) {
  return useQuery({ queryKey: qk.agent.stockout(id ?? 0), queryFn: () => getStockout(id ?? 0), enabled: id !== null });
}

export function useAgentRisk(id: number | null) {
  return useQuery({ queryKey: qk.agent.risk(id ?? 0), queryFn: () => getAgentRisk(id ?? 0), enabled: id !== null });
}

export function useExplanations(id: number | null, q: ExplanationQuery = {}) {
  return useQuery({
    queryKey: qk.agent.explanations(id ?? 0, q),
    queryFn: () => getExplanations(id ?? 0, q),
    enabled: id !== null,
  });
}

export function useRecommendation(id: number | null) {
  return useQuery({
    queryKey: qk.agent.recommendation(id ?? 0),
    queryFn: () => getRecommendation(id ?? 0),
    enabled: id !== null,
  });
}

/** 0..72h balance fan for one float (what-if with no change = the cached projection). */
export function useRunway(id: number | null, floatType: FloatType) {
  return useQuery({
    queryKey: qk.agent.runway(id ?? 0, floatType),
    queryFn: () => getRunway(id ?? 0, floatType),
    enabled: id !== null,
  });
}

/** LLM wording for the reasons. Starts only once the template reasons are on screen. */
export function useNarration(id: number | null, target: FloatType, lang: Lang, enabled: boolean) {
  return useQuery({
    queryKey: qk.agent.narration(id ?? 0, target, lang),
    queryFn: () => postNarrate({ agent_id: id ?? 0, target, lang }),
    enabled: enabled && id !== null,
    staleTime: 10 * 60_000,
    retry: false,
  });
}

export function useRequestRecommendation(agentId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (recommendationId: number) => requestRecommendation(recommendationId),
    onSettled: () => client.invalidateQueries({ queryKey: qk.agent.recommendation(agentId) }),
  });
}

/** What-if is a read (no state changes server-side), so it is a mutation only for imperative calls. */
export function useWhatIf(id: number) {
  return useMutation({ mutationFn: (body: WhatIfIn) => postWhatIf(id, body) });
}

export function useRiskList(q: RiskListQuery = {}) {
  return useQuery({ queryKey: qk.riskList(q), queryFn: () => listRisk(q), placeholderData: keepPreviousData });
}
