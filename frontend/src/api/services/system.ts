import { api } from "../../lib/api";
import type { Freshness, ImpactQuery, ImpactSummary, Lang, LlmStatus, ModelCard } from "../types";

export async function getFreshness(): Promise<Freshness> {
  return (await api.get<Freshness>("/system/freshness")).data;
}

export async function getLlmStatus(): Promise<LlmStatus> {
  return (await api.get<LlmStatus>("/llm/status")).data;
}

export async function getImpactSummary(params: ImpactQuery = {}): Promise<ImpactSummary> {
  return (await api.get<ImpactSummary>("/impact/summary", { params })).data;
}

export async function getModelCard(lang: Lang): Promise<ModelCard> {
  return (await api.get<ModelCard>("/responsible-ai/model-card", { params: { lang } })).data;
}
