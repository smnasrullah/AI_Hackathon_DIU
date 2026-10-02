import type { AvatarColor } from "../../api/types";

export const AVATAR_COLORS: Record<AvatarColor, string> = {
  teal: "#0f7f78",
  indigo: "#4f46e5",
  amber: "#9a5b00",
  rose: "#c2255c",
  emerald: "#13774f",
  sky: "#0369a1",
  violet: "#6d4aff",
  slate: "#4a5578",
};

export const AVATAR_ORDER = Object.keys(AVATAR_COLORS) as AvatarColor[];

export function isAvatarColor(value: string | null | undefined): value is AvatarColor {
  return !!value && value in AVATAR_COLORS;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts.slice(0, 1);
  return letters.map((p) => Array.from(p ?? "")[0] ?? "").join("").toUpperCase() || "?";
}
