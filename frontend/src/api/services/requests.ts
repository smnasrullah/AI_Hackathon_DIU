import { api } from "../../lib/api";
import type { RequestListQuery, RequestPage } from "../types";

/** Recommendation requests in scope (an agent sees only their own), newest first. */
export async function listRequests(params: RequestListQuery = {}): Promise<RequestPage> {
  return (await api.get<RequestPage>("/recommendation-requests", { params })).data;
}
