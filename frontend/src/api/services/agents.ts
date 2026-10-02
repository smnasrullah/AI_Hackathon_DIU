import { api } from "../../lib/api";
import type {
  AgentExplanation,
  AgentForecast,
  AgentRecommendation,
  AgentRisk,
  AgentRiskPage,
  AgentStockout,
  AgentSummary,
  ExplanationQuery,
  FloatType,
  ForecastQuery,
  LlmText,
  NarrateIn,
  RequestItem,
  RiskListQuery,
  Runway,
  WhatIfIn,
  WhatIfOut,
} from "../types";

export async function getAgentSummary(id: number): Promise<AgentSummary> {
  return (await api.get<AgentSummary>(`/agents/${id}/summary`)).data;
}

export async function getForecast(id: number, params: ForecastQuery = {}): Promise<AgentForecast> {
  return (await api.get<AgentForecast>(`/agents/${id}/forecast`, { params })).data;
}

export async function getStockout(id: number): Promise<AgentStockout> {
  return (await api.get<AgentStockout>(`/agents/${id}/stockout`)).data;
}

export async function getAgentRisk(id: number): Promise<AgentRisk> {
  return (await api.get<AgentRisk>(`/agents/${id}/risk`)).data;
}

export async function getExplanations(id: number, params: ExplanationQuery = {}): Promise<AgentExplanation> {
  return (await api.get<AgentExplanation>(`/agents/${id}/explanations`, { params })).data;
}

export async function getRecommendation(id: number): Promise<AgentRecommendation> {
  return (await api.get<AgentRecommendation>(`/agents/${id}/recommendation`)).data;
}

export async function postWhatIf(id: number, body: WhatIfIn): Promise<WhatIfOut> {
  return (await api.post<WhatIfOut>(`/agents/${id}/whatif`, body)).data;
}

/** Cached 0..72h balance projection for one float: the what-if `before` scenario (delta 0, read only). */
export async function getRunway(id: number, floatType: FloatType): Promise<Runway> {
  const out = await postWhatIf(id, { float_type: floatType, delta_amount: 0 });
  const { capacity, as_of, model_version, generated_at } = out;
  return { ...out.before, float_type: floatType, capacity, as_of, model_version, generated_at };
}

/** SHAP reasons reworded by the LLM layer (template text on any failure; always advisory). */
export async function postNarrate(body: NarrateIn): Promise<LlmText> {
  return (await api.post<LlmText>("/explanations/narrate", body)).data;
}

/** Agent asks the distributor to act on a recommendation. A repeat returns the existing request. */
export async function requestRecommendation(recommendationId: number): Promise<RequestItem> {
  return (await api.post<RequestItem>(`/recommendations/${recommendationId}/request`)).data;
}

export async function listRisk(params: RiskListQuery = {}): Promise<AgentRiskPage> {
  return (await api.get<AgentRiskPage>("/agents/risk", { params })).data;
}
