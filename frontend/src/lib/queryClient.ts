import { QueryClient } from "@tanstack/react-query";
import axios from "axios";

const MAX_RETRIES = 2;

/** Timeouts, dropped connections and 5xx are worth retrying; 4xx answers will not change. */
export function isTransient(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === undefined || status >= 500;
}

/** One client for the app, so logout can clear every cached query. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failures, error) => failures < MAX_RETRIES && isTransient(error),
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
  },
});
