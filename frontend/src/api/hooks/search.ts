import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { qk } from "../keys";
import { search } from "../services/search";

/** Command palette search; `q` should already be debounced. */
export function useSearch(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: qk.search(term),
    queryFn: ({ signal }) => search(term, signal),
    enabled: term.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}
