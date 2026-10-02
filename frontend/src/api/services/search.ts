import { api } from "../../lib/api";
import type { SearchResponse } from "../types";

export async function search(q: string, signal?: AbortSignal): Promise<SearchResponse> {
  return (await api.get<SearchResponse>("/search", { params: { q }, signal })).data;
}
