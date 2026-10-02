import { isAxiosError } from "axios";

/** Every human decision carries a note for the audit log (server: 1..500 chars after trimming). */
export const NOTE_MIN = 5;
export const NOTE_MAX = 500;

/** The API's error code ("already_decided", "swap_declined", ...) or null. */
export function errorCode(error: unknown): string | null {
  if (!isAxiosError(error)) return null;
  const detail: unknown = (error.response?.data as { detail?: unknown } | undefined)?.detail;
  return typeof detail === "string" ? detail : null;
}
