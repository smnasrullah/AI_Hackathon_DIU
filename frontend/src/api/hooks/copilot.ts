import { useQuery } from "@tanstack/react-query";

import { qk } from "../keys";
import { copilotSuggestions } from "../services/copilot";
import type { Lang } from "../types";

/** Suggested questions: the only ones with recorded replay wording (exact text). */
export function useCopilotSuggestions(lang: Lang) {
  return useQuery({
    queryKey: qk.copilotSuggestions(lang),
    queryFn: ({ signal }) => copilotSuggestions(lang, signal),
    staleTime: Infinity,
  });
}
