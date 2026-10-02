import { api } from "../../lib/api";
import type { SwapDecisionIn, SwapItem, SwapListQuery, SwapPage, SwapRespondIn } from "../types";

export async function listSwaps(params: SwapListQuery = {}): Promise<SwapPage> {
  return (await api.get<SwapPage>("/swaps", { params })).data;
}

export async function decideSwap(id: number, body: SwapDecisionIn): Promise<SwapItem> {
  return (await api.post<SwapItem>(`/swaps/${id}/decision`, body)).data;
}

/** Donor or receiver agent accepts or declines; the distributor still decides. */
export async function respondSwap(id: number, body: SwapRespondIn): Promise<SwapItem> {
  return (await api.post<SwapItem>(`/swaps/${id}/respond`, body)).data;
}
