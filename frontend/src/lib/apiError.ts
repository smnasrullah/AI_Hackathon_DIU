import { isAxiosError } from "axios";

/** The backend's `detail` code ("already_decided", "email_taken"), or null for network / validation errors. */
export function errorCode(err: unknown): string | null {
  if (!isAxiosError(err)) return null;
  const detail: unknown = (err.response?.data as { detail?: unknown } | undefined)?.detail;
  return typeof detail === "string" ? detail : null;
}
