import { api } from "../../lib/api";
import type { Lang, LlmText } from "../types";

/** Daily briefing over the caller's agents, written from the backend evidence pack (template on any failure). */
export async function getDistributorBriefing(lang: Lang): Promise<LlmText> {
  return (await api.get<LlmText>("/distributor/briefing", { params: { lang } })).data;
}

/** Neutral investigation note for one anomaly flag, from its peer evidence only. */
export async function getAnomalyNarrative(id: number, lang: Lang): Promise<LlmText> {
  return (await api.get<LlmText>(`/anomalies/${id}/narrative`, { params: { lang } })).data;
}
