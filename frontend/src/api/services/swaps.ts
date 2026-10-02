import { api } from "../../lib/api";
import type { SwapDecisionIn, SwapItem, SwapListQuery, SwapPage } from "../types";

export async function listSwaps(params: SwapListQuery = {}): Promise<SwapPage> {
  return (await api.get<SwapPage>("/swaps", { params })).data;
}

export async function decideSwap(id: number, body: SwapDecisionIn): Promise<SwapItem> {
  return (await api.post<SwapItem>(`/swaps/${id}/decision`, body)).data;
}
