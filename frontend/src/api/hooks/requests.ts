import { useQuery } from "@tanstack/react-query";

import { qk } from "../keys";
import { listRequests } from "../services/requests";
import type { RequestListQuery } from "../types";

export function useRequests(q: RequestListQuery = {}) {
  return useQuery({ queryKey: qk.requests.list(q), queryFn: () => listRequests(q) });
}
