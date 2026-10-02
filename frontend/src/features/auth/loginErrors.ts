import axios from "axios";

/** Lockout window when the server sends no Retry-After (matches LOGIN_LOCKOUT_MIN default). */
export const DEFAULT_LOCKOUT_S = 15 * 60;

export type LoginFailure = { kind: "invalid" } | { kind: "network" } | { kind: "locked"; retryAfterS: number };

export function classifyLoginError(err: unknown): LoginFailure {
  if (!axios.isAxiosError(err) || !err.response) return { kind: "network" };
  const { status, headers } = err.response;
  if (status === 401) return { kind: "invalid" };
  if (status === 429) {
    const raw = Number((headers as Record<string, unknown>)["retry-after"]);
    return { kind: "locked", retryAfterS: Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_LOCKOUT_S };
  }
  return { kind: "network" };
}

/** Field error keys used as zod messages; translated at render. */
export const FIELD_ERRORS = ["emailRequired", "emailInvalid", "passwordRequired"] as const;
export type FieldErrorKey = (typeof FIELD_ERRORS)[number];

export function fieldErrorKey(message: string | undefined): FieldErrorKey | null {
  return FIELD_ERRORS.find((k) => k === message) ?? null;
}

/** 905 -> "15:05". */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
