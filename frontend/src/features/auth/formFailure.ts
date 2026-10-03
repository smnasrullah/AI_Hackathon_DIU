import axios from "axios";

import { errorCode } from "../../lib/apiError";

/** Coarse outcome of a failed public auth request: rate limited, refused with a code, or offline. */
export type FormFailure = { kind: "limited" } | { kind: "network" } | { kind: "refused"; code: string | null };

export function classifyFormError(err: unknown): FormFailure {
  if (!axios.isAxiosError(err) || !err.response) return { kind: "network" };
  if (err.response.status === 429) return { kind: "limited" };
  if (err.response.status >= 500) return { kind: "network" };
  return { kind: "refused", code: errorCode(err) };
}
