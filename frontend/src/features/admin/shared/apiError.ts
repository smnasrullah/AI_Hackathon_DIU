import axios from "axios";

/** The backend's `detail` code ("email_taken"), or null for network / validation errors. */
export function errorCode(err: unknown): string | null {
  if (!axios.isAxiosError(err)) return null;
  const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail;
  return typeof detail === "string" ? detail : null;
}

/** Keeps only the filled-in query values, so URLs and query keys stay small. */
export function compact<T extends Record<string, unknown>>(q: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(q) as (keyof T)[]) {
    const v = q[key];
    if (v !== undefined && v !== null && v !== "") out[key] = v;
  }
  return out;
}
