import { api } from "../../lib/api";
import type {
  FairnessReport,
  Freshness,
  GroupBy,
  ImpactComparison,
  ImpactComparisonQuery,
  ImpactQuery,
  ImpactSummary,
  Lang,
  LlmStatus,
  ModelCard,
} from "../types";

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

/** Day-by-day AI vs baseline over the held-out days (`from`/`to` clipped server-side). */
export async function getImpactComparison(params: ImpactComparisonQuery = {}): Promise<ImpactComparison> {
  return (await api.get<ImpactComparison>("/impact/comparison", { params })).data;
}

export async function getFairness(groupBy: GroupBy): Promise<FairnessReport> {
  return (await api.get<FairnessReport>("/responsible-ai/fairness", { params: { groupBy } })).data;
}
