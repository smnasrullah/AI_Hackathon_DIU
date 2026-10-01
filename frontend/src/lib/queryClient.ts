import { QueryClient } from "@tanstack/react-query";

/** One client for the app, so logout can clear every cached query. */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});
