import { api } from "../../lib/api";
import type { AnomalyDetail, AnomalyListQuery, AnomalyPage, AnomalyReviewIn } from "../types";

export async function listAnomalies(params: AnomalyListQuery = {}): Promise<AnomalyPage> {
  return (await api.get<AnomalyPage>("/anomalies", { params })).data;
}

export async function getAnomaly(id: number): Promise<AnomalyDetail> {
  return (await api.get<AnomalyDetail>(`/anomalies/${id}`)).data;
}

export async function reviewAnomaly(id: number, body: AnomalyReviewIn): Promise<AnomalyDetail> {
  return (await api.post<AnomalyDetail>(`/anomalies/${id}/review`, body)).data;
}
